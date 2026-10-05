const tiers = ['S', 'A', 'B', 'C', 'D', 'E'];
const flagshipOrganizers = [
  'google',
  'microsoft',
  'major league hacking',
  'mlh',
  'smart india hackathon',
  'sih',
  'ethglobal',
  'devfolio',
  'iit',
  'nit',
  'iiit',
  'bits',
  'amazon',
  'flipkart',
];
const profile = {
  primary: ['HTML', 'CSS', 'AI-assisted web building', 'prompt-led prototyping', 'automation'],
  learning: ['JavaScript basics', 'Python', 'APIs', 'practical machine learning'],
  preference: 'Build-focused projects; lower preference for ML-heavy model training.',
};

function text(value) {
  return typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}
function has(value, pattern) {
  return pattern.test(value);
}
function effortSignals(event) {
  const description = text(event.raw_data?.description);
  const input = `${event.title || ''} ${description}`.toLowerCase();
  if (description.length < 100)
    return {
      difficulty: 'unknown',
      hours: null,
      confidence: 'low',
      reason: 'The event description is too short to estimate the work.',
    };
  const hard = has(
    input,
    /deep learning|train(?:ing)? (?:a )?(?:model|neural)|computer vision|hardware|robotics|blockchain|distributed systems|advanced cryptography|production[- ]grade|multiple integrations|research paper/,
  );
  const easy = has(
    input,
    /beginner|first[- ]time|no[- ]code|low[- ]code|starter|introductory|simple prototype/,
  );
  const medium = has(
    input,
    /build|prototype|web app|mobile app|full[- ]stack|working solution|team project|dashboard|automation/,
  );
  if (hard)
    return {
      difficulty: 'hard',
      hours: '16–36',
      confidence: 'medium',
      reason: 'The description names advanced or integration-heavy work.',
    };
  if (easy)
    return {
      difficulty: 'easy',
      hours: '4–10',
      confidence: 'medium',
      reason: 'The description signals beginner or prototype scope.',
    };
  if (medium)
    return {
      difficulty: 'medium',
      hours: '8–20',
      confidence: 'low',
      reason: 'The description suggests a build project; task size is not specified.',
    };
  return {
    difficulty: 'unknown',
    hours: null,
    confidence: 'low',
    reason: 'No clear build scope was found in the event description.',
  };
}

export function analyzeOpportunity(event) {
  const raw = event.raw_data || {};
  const description = text(raw.description);
  const organizer = text(event.organizer);
  const locationKnown = event.areaScope === 'local' || event.areaScope === 'remote';
  const hasDates = Boolean(
    event.start_date || event.end_date || raw.submissionDates || raw.submissionStart,
  );
  const skills = Array.isArray(raw.matchedSkills) ? raw.matchedSkills : [];
  const fit = Number.isFinite(Number(event.skill_match_score))
    ? Number(event.skill_match_score)
    : 0;
  let score = 0;
  if (organizer && !/independent \/ campus|community$/i.test(organizer)) score += 10;
  if (description.length >= 180) score += 12;
  if (description.length >= 700) score += 8;
  if (hasDates) score += 8;
  if (event.registration_deadline) score += 8;
  if (event.prize_pool) score += 8;
  if (raw.minTeam || raw.maxTeam) score += 5;
  if (raw.eligibility) score += 5;
  if (locationKnown) score += 10;
  if (event.distanceKm != null && event.distanceKm <= 100) score += 5;
  if (skills.length) score += 6;
  score += Math.min(18, Math.round(fit * 18));
  score = Math.min(100, score);
  const strongEvidence = [
    organizer && !/independent \/ campus|community$/i.test(organizer),
    description.length >= 700,
    hasDates,
    Boolean(event.registration_deadline),
    Boolean(event.prize_pool),
    fit >= 0.3,
  ].filter(Boolean).length;
  const flagship = flagshipOrganizers.some((name) =>
    new RegExp(
      `(?:^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`,
      'i',
    ).test(organizer),
  );
  const prizeTotal = [...String(event.prize_pool || '').matchAll(/\bINR\s*([\d,]+)/gi)].reduce(
    (sum, m) => sum + Number(m[1].replace(/,/g, '')),
    0,
  );
  const qualifiesForS =
    score >= 90 && flagship && prizeTotal >= 50000 && fit >= 0.3 && strongEvidence >= 5;
  let tier = qualifiesForS
    ? 'S'
    : score >= 80
      ? 'A'
      : score >= 66
        ? 'B'
        : score >= 52
          ? 'C'
          : score >= 38
            ? 'D'
            : 'E';
  const effort = effortSignals(event);
  const incomplete =
    !locationKnown ||
    description.length < 100 ||
    !organizer ||
    effort.difficulty === 'unknown' ||
    score < 28;
  const bucket = incomplete ? 'unverified' : effort.difficulty;
  const reason = incomplete
    ? 'Some event facts or a usable project scope are missing; verify the official listing.'
    : tier === 'S'
      ? 'Strong verified detail, recognized organizer, listed prize value, and high skill fit.'
      : `Rule-based evidence score ${score}/100; matched ${skills.length || 0} skill signals.${score >= 90 && !qualifiesForS ? ' It does not meet the stricter S-tier proof requirements.' : ''}`;
  const durationText = text(event.title + ' ' + description);
  const duration = durationText.match(/\b(\d{1,3})\s*[- ]?\s*(hours?|hrs?|days?)\b/i);
  const eventWindow = duration
    ? `${duration[1]} ${/^h/i.test(duration[2]) ? 'hours' : 'days'} (listed event window)`
    : '';
  return {
    bucket,
    tier: `Tier ${tier}`,
    tierKey: tier,
    score,
    skillFit: Math.round(fit * 100),
    matchedSkills: skills,
    difficulty: effort.difficulty,
    effortHours: effort.hours,
    confidence: effort.confidence,
    effortReason: effort.reason,
    eventWindow,
    research: null,
    reason,
    method: 'transparent-rules-v1',
  };
}

export function rankAndLimit(items, limit = 10) {
  const ranked = items.map((item) => ({ ...item, analysis: analyzeOpportunity(item) }));
  const unique = new Map();
  for (const item of ranked) {
    const eventDate = String(item.start_date || item.end_date || '').slice(0, 10);
    const key = `${text(item.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()}|${text(item.organizer).toLowerCase()}|${eventDate}`;
    const current = unique.get(key);
    if (
      !current ||
      text(item.raw_data?.description).length > text(current.raw_data?.description).length
    )
      unique.set(key, item);
  }
  const ordered = [...unique.values()].sort(
    (a, b) =>
      b.analysis.score - a.analysis.score ||
      (a.registration_deadline || '9999').localeCompare(b.registration_deadline || '9999'),
  );
  const counts = {};
  return ordered.filter((item) => {
    if (item.analysis.bucket === 'unverified') return true;
    const key = `${item.analysis.bucket}:${item.analysis.tierKey}`;
    counts[key] ||= 0;
    if (counts[key] >= limit) return false;
    counts[key]++;
    return true;
  });
}

export const opportunityProfile = profile;
export const opportunityTiers = tiers;
