const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

(async () => {
  const { analyzeOpportunity, rankAndLimit } =
    await import('../../backend/opportunity-radar/src/scoring/triageEngine.js');
  const { opportunityProfile } =
    await import('../../backend/opportunity-radar/src/scoring/triageEngine.js');
  assert(
    !JSON.stringify(opportunityProfile).match(/cybersecurity|security/i),
    'user skill profile excludes cybersecurity',
  );

  function event(id, extra = {}) {
    return {
      id,
      platform: 'unstop',
      title: `Beginner web prototype ${id}`,
      organizer: `MLH Campus ${id}`,
      event_url: `https://unstop.com/hackathons/${id}`,
      mode: 'in-person',
      location: 'New Delhi',
      areaScope: 'local',
      distanceKm: 18,
      start_date: '2026-11-01',
      end_date: '2026-11-02',
      registration_deadline: '2026-10-20',
      prize_pool: 'INR 60000',
      skill_match_score: 0.9,
      raw_data: {
        description: `Beginner build a web app prototype for a practical student problem. ${'Create a clear product, a simple interface, and a working web demonstration. '.repeat(12)}`,
        matchedSkills: ['html', 'css', 'javascript'],
        minTeam: 2,
        maxTeam: 4,
        eligibility: 'Students',
      },
      ...extra,
    };
  }

  const easy = analyzeOpportunity(event('easy'));
  assert.equal(easy.bucket, 'easy');
  assert.equal(easy.tier, 'Tier A');
  assert(easy.score >= 90);
  assert(!easy.reason.includes('verified'), 'listing fields do not claim verification');
  assert.equal(easy.effortHours, '4–10');
  const hard = analyzeOpportunity(
    event('hard', {
      title: 'Build a computer vision model',
      raw_data: {
        description:
          'Train a deep learning computer vision model with complex hardware integration. '.repeat(
            12,
          ),
        matchedSkills: [],
      },
    }),
  );
  assert.equal(hard.difficulty, 'hard');
  const missing = analyzeOpportunity(
    event('unknown', {
      areaScope: 'unknown',
      locationLabel: 'Location not verified',
      raw_data: { description: 'A hackathon. '.repeat(12) },
    }),
  );
  assert.equal(missing.bucket, 'unverified');
  assert.notEqual(missing.tier, 'Tier S');

  const { tierEngine } = await import('../../backend/opportunity-radar/src/scoring/tierEngine.js');
  assert.notEqual(
    tierEngine.calculateTier(event('legacy'), { attendance_safe: true, isWeekend: true }).tier,
    'Tier S',
    'legacy scoring cannot grant S from an organizer keyword',
  );

  const many = Array.from({ length: 12 }, (_, i) => event(`listed-${i}`));
  many.push(event('listed-0', { id: 'other-source-duplicate' }));
  const ranked = rankAndLimit(many);
  assert.equal(
    ranked.filter((x) => x.analysis.bucket === 'easy' && x.analysis.tierKey === 'A').length,
    10,
    'limit each difficulty/tier bucket to ten',
  );
  assert.equal(
    new Set(ranked.map((x) => x.id)).size,
    ranked.length,
    'no repeated event across groups',
  );
  assert.equal(
    ranked.some((x) => x.title === 'Beginner web prototype listed-11'),
    false,
    'lower-ranked overflow is hidden',
  );
  assert.equal(
    rankAndLimit([
      event('a'),
      event('b', {
        title: 'A vague listing',
        raw_data: { description: 'No project detail is available.' },
      }),
    ]).filter((x) => x.analysis.bucket === 'easy').length,
    1,
    'never force-fill tiers',
  );
  assert(ranked.every((x) => x.analysis.tierKey !== 'S'), 'quota does not promise S-tier');

  const radarRequire = createRequire(path.resolve(__dirname, '../../backend/opportunity-radar/package.json'));
  const { load } = radarRequire('cheerio');
  const { extractDevpostDetails } =
    await import('../../backend/opportunity-radar/src/scrapers/devpostDetails.js');
  const $ = load(`<script type="application/ld+json">${JSON.stringify({
    '@type': 'Event',
    startDate: '2026-11-01T09:00:00+05:30',
    endDate: '2026-11-02T18:00:00+05:30',
    description: 'Build a web app',
  })}</script>`);
  const details = extractDevpostDetails($);
  assert.equal(details.start_date, '2026-11-01T03:30:00.000Z');
  assert.equal(details.end_date, '2026-11-02T12:30:00.000Z');
  assert.equal(details.registration_deadline, undefined, 'event end is not a registration deadline');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-expiry-test-'));
  process.env.RADAR_DATA_DIR = tempDir;
  try {
    const { database } = await import('../../backend/opportunity-radar/src/db/database.js');
    try {
      database.upsertOpportunity(event('ended', {
        registration_deadline: null,
        end_date: '2000-01-01T00:00:00.000Z',
      }));
      database.upsertOpportunity(event('still-open', {
        registration_deadline: null,
        end_date: null,
      }));
      assert.deepEqual(
        database.getAllOpportunities({ status: 'active' }).map((item) => item.id),
        ['still-open'],
        'known ended events expire while undated listings remain active',
      );
    } finally {
      database.db.close();
    }
  } finally {
    delete process.env.RADAR_DATA_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(
    'PASS: evidence-based tiers, Devpost event dates, known-end expiry, dedupe, and ten-item tier cap.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
