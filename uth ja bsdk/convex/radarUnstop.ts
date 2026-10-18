// Public Unstop listings only. This parser deliberately makes no quality or eligibility claims.
const BASE = 'https://unstop.com';

type Row = Record<string, unknown>;
export type PublicRadarOpportunity = {
  id: string;
  title: string;
  organizer: string;
  platform: 'unstop';
  eventUrl: string;
  mode: string;
  location: string;
  locationLabel: string;
  areaScope: 'remote' | 'unknown';
  distanceKm: null;
  startDate: string | null;
  endDate: string | null;
  registrationDeadline: string | null;
  prizePool: string;
  teamSize: string | null;
  summary: string;
  description: string;
  skills: string[];
  tier: 'E';
  difficulty: 'unverified';
  confidence: 'low';
};

function record(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Row : null;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

function date(value: unknown): string | null {
  const candidate = text(value, 48);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function safeListingUrl(value: unknown, id: number): string {
  const candidate = text(value, 500);
  try {
    const parsed = new URL(candidate || `/hackathons/${id}`, BASE);
    if (parsed.protocol === 'https:' && parsed.hostname === 'unstop.com' &&
      !parsed.username && !parsed.password && parsed.pathname.startsWith('/hackathons/'))
      return parsed.toString();
  } catch { /* Use a URL built from the numeric source id. */ }
  return `${BASE}/hackathons/${id}`;
}

export function parseUnstopPage(input: unknown, now = Date.now()): PublicRadarOpportunity[] {
  const data = record(record(input)?.data);
  if (!data || !Array.isArray(data.data)) throw new Error('Unstop response schema changed');
  const output: PublicRadarOpportunity[] = [];
  for (const raw of data.data.slice(0, 20)) {
    const row = record(raw);
    if (!row || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0) continue;
    const title = text(row.title, 180);
    if (!title) continue;
    const registration = record(row.regnRequirements);
    const deadline = date(registration?.end_regn_dt);
    if (registration?.reg_status === 'FINISHED' || (deadline && Date.parse(deadline) < now)) continue;
    const organizer = text(record(row.organisation)?.name ?? row.organisation_name, 120);
    const region = text(row.region, 40).toLowerCase();
    const mode = /online|virtual|remote/.test(region) ? 'online' :
      /offline|in.?person/.test(region) ? 'in-person' : 'unknown';
    const place = record(row.address_with_country_logo);
    const location = text(place?.city, 120);
    const min = registration?.min_team_size;
    const max = registration?.max_team_size;
    const teamSize = typeof min === 'number' && typeof max === 'number' &&
      Number.isSafeInteger(min) && Number.isSafeInteger(max) &&
      min >= 1 && max >= min && max <= 100 ? `${min}–${max} people` : null;
    const prize = Array.isArray(row.prizes) ? row.prizes
      .map(record).filter((value): value is Row => value !== null)
      .filter((value) => typeof value.cash === 'number' && value.cash > 0 && value.cash < 1e9)
      .slice(0, 5)
      .map((value) => `${text(value.currencyCode, 6) ||
        (value.currency === 'fa-rupee' ? 'INR' : 'Currency unverified')} ${value.cash}`)
      .join(' + ').slice(0, 100) : '';
    const skills = Array.isArray(row.workfunction) ? row.workfunction
      .map((value) => text(record(value)?.name, 40)).filter(Boolean).slice(0, 12) : [];
    const description = text(text(row.details, 2000).replace(/<[^>]*>/g, ' '), 500);
    output.push({
      id: `unstop_${row.id}`, title, organizer, platform: 'unstop',
      eventUrl: safeListingUrl(row.seo_url ?? row.public_url, row.id),
      mode, location, locationLabel: location || 'Location unverified',
      areaScope: mode === 'online' ? 'remote' : 'unknown', distanceKm: null,
      startDate: date(row.start_date ?? row.event_start_date),
      endDate: date(row.end_date ?? row.event_end_date),
      registrationDeadline: deadline, prizePool: prize, teamSize,
      summary: '', description, skills,
      tier: 'E', difficulty: 'unverified', confidence: 'low',
    });
  }
  return output;
}
