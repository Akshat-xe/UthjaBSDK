import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const actors = {
  solidcode: {
    id: 'solidcode/unstop-scraper',
    platform: 'unstop',
    price: '$3.60 / 1,000 on free plan + start fee',
    input: (n) => ({ opportunityTypes: ['hackathons'], maxResults: n }),
  },
  trusted_offshoot: {
    id: 'trusted_offshoot/unstop-hackathon-scraper',
    platform: 'unstop',
    price: 'Platform usage charges; no fixed result price',
    usageBilled: true,
    input: (n) => ({
      startUrls: [{ url: 'https://unstop.com/hackathons' }],
      maxItems: n,
      proxyConfiguration: { useApifyProxy: false },
    }),
  },
  parsebird: {
    id: 'parsebird/unstop-jobs-internships-scraper',
    platform: 'unstop',
    price: 'From $2.90 / 1,000; plan-dependent',
    input: (n) => ({ opportunityTypes: ['hackathons'], maxResults: n }),
  },
  dami_studio: {
    id: 'dami_studio/unstop-scraper',
    platform: 'unstop',
    price: 'From $2.50 / 1,000',
    input: (n) => ({
      listing: ['hackathons'],
      status: 'open',
      maxItems: n,
      includeDetails: true,
      includeDescriptionHtml: false,
      detailConcurrency: 2,
    }),
  },
  freshdata: {
    id: 'freshdata/linkedin-job-details-scraper',
    platform: 'linkedin',
    price: '$8 / 1,000',
    input: (_n, url) => ({ job_url: url }),
  },
  bestscrapers: {
    id: 'bestscrapers/linkedin-job-details-scraper',
    platform: 'linkedin',
    price: '$8 / 1,000',
    input: (_n, url) => ({ job_url: url }),
  },
};

export function loadApifyConfig() {
  return JSON.parse(fs.readFileSync(new URL('../../config/apify.json', import.meta.url), 'utf8'));
}

export function connectorStatus(config = loadApifyConfig()) {
  return Object.entries(actors).map(([key, actor]) => ({
    key,
    actor: actor.id,
    platform: actor.platform,
    price: actor.price,
    enabled: config.actors?.[key] === true,
    ready:
      config.actors?.[key] === true &&
      Boolean(process.env.APIFY_TOKEN) &&
      (!actor.usageBilled || config.allowUsageBilledActor === true) &&
      (actor.platform !== 'linkedin' || config.linkedinJobUrls?.length > 0),
    requiresJobUrl: actor.platform === 'linkedin',
  }));
}

const text = (value) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const terms = (value) =>
  Array.isArray(value) ? value.map((x) => text(x?.name || x)).filter(Boolean) : [];
function isoDate(value) {
  // Only accept dates carrying a year, not "ends in 12 days".
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}
export function normalizeActorRow(key, row, fallbackUrl) {
  const actor = actors[key];
  const data = row.data && typeof row.data === 'object' ? row.data : row;
  const title = text(data.title || data.job_title);
  const rawUrl = text(data.url || data.link || data.job_url || data.linkedin_url || fallbackUrl);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${key}: output has no valid opportunity URL`);
  }
  const domain = actor.platform === 'unstop' ? 'unstop.com' : 'linkedin.com';
  if (
    url.protocol !== 'https:' ||
    !(url.hostname === domain || url.hostname.endsWith('.' + domain))
  )
    throw new Error(`${key}: unexpected opportunity URL`);
  if (!title) throw new Error(`${key}: output schema has no title`);
  url.search = '';
  url.hash = '';
  const numericId =
    actor.platform === 'unstop'
      ? url.pathname.match(/(?:-|\/)(\d+)\/?$/)?.[1]
      : url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1];
  const id = `${actor.platform}_${numericId || text(data.id || data.job_id) || createHash('sha256').update(url.href).digest('hex').slice(0, 16)}`;
  const closed =
    data.registrationOpen === false ||
    /^(closed|expired|ended)$/i.test(text(data.status)) ||
    (data.expired &&
      Number.isFinite(Date.parse(data.expired)) &&
      Date.parse(data.expired) < Date.now());
  return {
    id,
    platform: actor.platform,
    title,
    event_url: url.href,
    organizer: text(
      data.organizer?.name || data.organizer || data.organiserName || data.company_name,
    ),
    event_type:
      actor.platform === 'linkedin'
        ? 'job'
        : text(data.kind || data.opportunityType) || 'hackathon',
    mode: text(data.mode || data.locationMode) || (data.isOnline === true ? 'online' : 'unknown'),
    location: text(data.location || data.city || data.job_location),
    registration_deadline: isoDate(data.deadline || data.registrationDeadline),
    start_date: null,
    end_date: null,
    status: closed ? 'expired' : 'active',
    prize_pool: text(data.prize || data.prizeSummary),
    skills_required: terms(data.skills || data.tags),
    raw_data: {
      provider: actor.id,
      description: text(data.descriptionText || data.job_description).slice(0, 20000),
      eligibility: terms(data.eligibility || data.eligibilityTags),
      paid: data.hasEntryFee === true || /^paid$/i.test(text(data.registrationFee)),
      deadlineText: text(data.deadlineText || data.date),
      minTeam: data.minTeamSize,
      maxTeam: data.maxTeamSize,
    },
  };
}

export async function fetchApifyActor(
  key,
  config = loadApifyConfig(),
  { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const actor = actors[key];
  if (!actor || config.actors?.[key] !== true) throw new Error('Apify connector is not enabled');
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('Set APIFY_TOKEN locally to use enabled Apify connectors');
  const n = config.maxItems,
    cap = config.maxChargeUsdPerRun,
    timeout = config.timeoutSeconds;
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 100 ||
    !Number.isFinite(cap) ||
    cap <= 0 ||
    cap > 5 ||
    !Number.isInteger(timeout) ||
    timeout < 10 ||
    timeout > 120
  )
    throw new Error('Invalid Apify run limits');
  if (actor.usageBilled && config.allowUsageBilledActor !== true)
    throw new Error(
      'Usage-billed actor needs allowUsageBilledActor; dollar cap applies only to pay-per-event charges',
    );
  // A detail actor consumes a known job URL; it is not a LinkedIn job search engine.
  const urls =
    actor.platform === 'linkedin'
      ? [...new Set(config.linkedinJobUrls || [])].slice(0, n)
      : [undefined];
  if (urls.length > 3) throw new Error('Use at most three LinkedIn job URLs per harvest');
  if (!urls.length) throw new Error('Add linkedinJobUrls to fetch LinkedIn job details');
  for (const url of urls)
    if (
      url !== undefined &&
      !/^https:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/(?:[^/?#]+-)?\d+\/?(?:[?#].*)?$/.test(url)
    )
      throw new Error('Expected a public LinkedIn /jobs/view/ URL');
  async function request(route, options = {}) {
    let response;
    try {
      response = await fetchImpl(`https://api.apify.com/v2/${route}`, {
        ...options,
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(
        'Apify network request failed; inspect the Apify console before retrying a start',
      );
    }
    if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);
    return response.json();
  }
  const output = [];
  for (const url of urls) {
    const query = new URLSearchParams({ timeout: String(timeout), maxItems: String(n) });
    if (!actor.usageBilled) query.set('maxTotalChargeUsd', String(cap / urls.length));
    // Never retry this POST: a lost response may still represent a billable run.
    let run = (
      await request(`actors/${actor.id.replace('/', '~')}/runs?${query}`, {
        method: 'POST',
        body: JSON.stringify(actor.input(n, url)),
      })
    ).data;
    if (!run?.id || !/^[a-zA-Z0-9]+$/.test(run.id))
      throw new Error('Apify did not return a valid run ID');
    const runId = run.id;
    const deadline = Date.now() + (timeout + 30) * 1000;
    try {
      while (!['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(run.status)) {
        if (Date.now() >= deadline) throw new Error('Apify polling deadline exceeded');
        await sleep(1500);
        run = (await request(`actor-runs/${runId}`)).data;
        if (!run) throw new Error('Apify run status missing');
      }
      if (run.status !== 'SUCCEEDED') throw new Error(`Apify run ${run.status}`);
      if (!/^[a-zA-Z0-9]+$/.test(run.defaultDatasetId || ''))
        throw new Error('Apify dataset missing');
      const rows = await request(
        `datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=${n}`,
      );
      if (!Array.isArray(rows)) throw new Error('Apify dataset schema changed');
      output.push(...rows.map((row) => normalizeActorRow(key, row, url)));
    } catch (error) {
      if (!['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(run?.status)) {
        try {
          await request(`actor-runs/${runId}/abort`, { method: 'POST' });
        } catch {
          /* Server-side timeout also bounds the run. */
        }
      }
      throw error;
    }
  }
  return output;
}

export function configuredApifySources(config = loadApifyConfig()) {
  return Object.fromEntries(
    Object.keys(actors)
      .filter((key) => config.actors?.[key] === true)
      .map((key) => [`apify:${key}`, () => fetchApifyActor(key, config)]),
  );
}
