const assert = require('node:assert/strict');

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
  assert.equal(easy.tier, 'Tier S');
  assert(easy.score >= 90);
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
  assert.equal(missing.tier.startsWith('Tier '), true);

  const many = Array.from({ length: 12 }, (_, i) => event(`listed-${i}`));
  many.push(event('listed-0', { id: 'other-source-duplicate' }));
  const ranked = rankAndLimit(many);
  assert.equal(
    ranked.filter((x) => x.analysis.bucket === 'easy' && x.analysis.tierKey === 'S').length,
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
  console.log(
    'PASS: event difficulty, quality thresholds, conservative unverified bucket, dedupe, rank order, and ten-item tier cap.',
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
