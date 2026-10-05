const assert = require('node:assert/strict');
const {
  collectSnapshotInput,
  publishMobileSnapshot,
  publishProjectedSnapshot,
} = require('../../backend/features/mobile-publish/publisher');
const { projectSnapshot } = require('../../backend/features/mobile-publish/projection');
const {
  filterApprovedAcademicMail,
  sanitizeStagedAcademicMail,
} = require('../../backend/features/mobile-publish/mailFilter');

const MAX_CONVEX_BODY_BYTES = 700_000;
const config = {
  CONVEX_MOBILE_PUBLISH_URL: 'https://example.convex.site/mobile/snapshot',
  CONVEX_MOBILE_PUBLISH_TOKEN: 'unit-test-token',
};
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];

function snapshotInput() {
  return {
    metadata: {
      revision: 'revision-interrupted-run',
      runId: 'run-interrupted',
      publishedAt: '2026-10-04T12:00:00.000Z',
    },
    academic: {
      attendance: { combined: null, nst: null, rufp: null },
      subjects: [],
      schedule: [],
      emails: [],
    },
    radar: { fetchedAt: null, opportunities: [] },
    menu: {
      fetchedAt: null,
      menu: Object.fromEntries(
        days.map((day) => [day, Object.fromEntries(meals.map((meal) => [meal, []]))]),
      ),
    },
    syncResult: { sources: {} },
  };
}

function largestValidInput() {
  const input = snapshotInput();
  const long = (length) => 'x'.repeat(length);
  input.academic.subjects = Array.from({ length: 100 }, () => ({
    name: long(100),
    group: long(60),
    code: long(40),
    attended: 100,
    total: 100,
    absent: 100,
    percent: 100,
    canMiss: 100,
    needAttend: 100,
  }));
  input.academic.schedule = Array.from({ length: 14 }, () => ({
    date: long(48),
    badge: long(60),
    items: Array.from({ length: 8 }, () => ({
      time: long(48),
      subject: long(100),
      type: long(48),
      title: long(140),
      status: long(48),
      location: long(100),
    })),
  }));
  input.academic.emails = Array.from({ length: 12 }, () => ({
    sender: long(100),
    subject: long(180),
    summary: long(220),
    date: long(48),
    category: long(48),
    priority: long(24),
    actionItem: long(180),
  }));
  input.radar.opportunities = Array.from({ length: 50 }, (_, index) => ({
    id: `event-${index}`,
    title: long(180),
    organizer: long(120),
    platform: long(40),
    event_url: `https://example.test/${index}`,
    mode: long(40),
    location: long(120),
    locationLabel: long(120),
    areaScope: 'outside',
    distanceKm: 20050,
    registration_deadline: long(48),
    start_date: long(48),
    end_date: long(48),
    prize_pool: long(100),
    skills_required: Array.from({ length: 12 }, () => long(40)),
    analysis: {
      bucket: 'unverified',
      tier: 'Tier E',
      tierKey: 'E',
      difficulty: 'unknown',
      effortHours: long(40),
      confidence: 'low',
    },
    raw_data: {
      description: long(1000),
      eligibility: long(120),
      submissionDates: long(120),
      minTeam: 100,
      maxTeam: 100,
    },
  }));
  for (const day of days) {
    for (const meal of meals) input.menu.menu[day][meal] = Array.from({ length: 40 }, () => long(100));
  }
  return input;
}

async function main() {
  const inbox = [
    { sender: 'Faculty <teacher@campus.example.edu>', subject: 'Lab timetable' },
    { sender: 'Shop <offers@store.example>', subject: 'Order confirmed' },
    { sender: 'Tutor <tutor@external.example>', subject: 'Assignment' },
  ];
  assert.deepEqual(filterApprovedAcademicMail(inbox, ''), []);
  assert.deepEqual(
    filterApprovedAcademicMail(inbox, '@campus.example.edu,tutor@external.example'),
    [inbox[0], inbox[2]],
  );
  assert.deepEqual(filterApprovedAcademicMail(inbox, '@example.edu'), []);

  const input = snapshotInput();
  const snapshot = projectSnapshot(input);
  const oldStage = {
    ...snapshot,
    academic: { ...snapshot.academic, emails: inbox },
  };
  const sanitized = sanitizeStagedAcademicMail(oldStage, '', 'revision-after-mail-policy');
  assert.equal(sanitized.revision, 'revision-after-mail-policy');
  assert.deepEqual(sanitized.academic.emails, []);
  assert.deepEqual(oldStage.academic.emails, inbox);
  let sentBody;
  await publishProjectedSnapshot(sanitized, {
    env: config,
    fetchImpl: async (_url, options) => {
      sentBody = JSON.parse(options.body);
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(sentBody.academic.emails, []);
  const attemptedBodies = [];
  let attempts = 0;
  const retryFetch = async (_url, options) => {
    attemptedBodies.push(options.body);
    attempts += 1;
    if (attempts === 1) throw new Error('simulated connection loss after request send');
    return { ok: true, status: 200 };
  };
  assert.deepEqual(
    await publishProjectedSnapshot(snapshot, { env: config, fetchImpl: retryFetch }),
    { status: 'failed', reason: 'transport_error' },
    'an interrupted request is surfaced as retryable transport failure',
  );
  assert.deepEqual(
    await publishProjectedSnapshot(snapshot, { env: config, fetchImpl: retryFetch }),
    { status: 'published', revision: snapshot.revision },
    'retrying the same staged snapshot succeeds',
  );
  assert.equal(attemptedBodies[0], attemptedBodies[1]);
  assert.equal(JSON.parse(attemptedBodies[0]).runId, snapshot.runId);
  assert.equal(JSON.parse(attemptedBodies[1]).revision, snapshot.revision);

  const duplicateBodies = [];
  const duplicateFetch = async (_url, options) => {
    duplicateBodies.push(options.body);
    return { ok: true, status: 200 };
  };
  await publishProjectedSnapshot(snapshot, { env: config, fetchImpl: duplicateFetch });
  await publishProjectedSnapshot(snapshot, { env: config, fetchImpl: duplicateFetch });
  assert.equal(duplicateBodies.length, 2);
  assert.equal(duplicateBodies[0], duplicateBodies[1]);

  const allFailedInput = snapshotInput();
  const lastGoodAt = '2026-10-03T10:00:00.000Z';
  allFailedInput.academic.sources = {
    newton: { updatedAt: lastGoodAt },
    rishiverse: { updatedAt: lastGoodAt },
    gmail: { updatedAt: lastGoodAt },
  };
  allFailedInput.academic.mailUpdatedAt = lastGoodAt;
  allFailedInput.radar.fetchedAt = lastGoodAt;
  allFailedInput.menu.fetchedAt = lastGoodAt;
  const state = {
    sources: Object.fromEntries(
      ['newton', 'rishiverse', 'gmail', 'radar'].map((name) => [name, { status: 'failed' }]),
    ),
  };
  const collected = await collectSnapshotInput({
    metadata: allFailedInput.metadata,
    getAcademic: () => allFailedInput.academic,
    getRadar: () => allFailedInput.radar,
    getMenu: () => ({ ...allFailedInput.menu, status: 'failed' }),
    getSyncState: () => state,
  });
  const allFailed = projectSnapshot(collected);
  for (const name of ['newton', 'rishiverse', 'gmail', 'radar', 'menu']) {
    assert.deepEqual(allFailed.sources[name], {
      status: 'failed',
      freshness: 'stale',
      updatedAt: lastGoodAt,
    });
  }
  let publishedAllFailedBody;
  assert.deepEqual(
    await publishMobileSnapshot(collected, {
      env: config,
      fetchImpl: async (_url, options) => {
        publishedAllFailedBody = options.body;
        return { ok: true, status: 200 };
      },
    }),
    { status: 'published', revision: allFailed.revision },
    'a completed run with every source failed can still publish preserved last-good data',
  );
  assert.equal(JSON.parse(publishedAllFailedBody).sources.gmail.status, 'failed');

  const boundedBody = JSON.stringify(projectSnapshot(largestValidInput()));
  assert(
    Buffer.byteLength(boundedBody, 'utf8') < MAX_CONVEX_BODY_BYTES,
    `maximum projected snapshot must fit Convex's ${MAX_CONVEX_BODY_BYTES}-byte body limit`,
  );
  const oversizedStage = { ...snapshot, unexpectedField: 'x'.repeat(MAX_CONVEX_BODY_BYTES) };
  let oversizedWasSent = false;
  assert.deepEqual(
    await publishProjectedSnapshot(oversizedStage, {
      env: config,
      fetchImpl: async () => {
        oversizedWasSent = true;
        return { ok: true, status: 200 };
      },
    }),
    { status: 'failed', reason: 'invalid_snapshot' },
    'an unexpected top-level field must be rejected before upload',
  );
  assert.equal(oversizedWasSent, false);
  const oversizedValidShape = { ...snapshot, academic: { ...snapshot.academic, semester: 'x'.repeat(MAX_CONVEX_BODY_BYTES) } };
  assert.deepEqual(
    await publishProjectedSnapshot(oversizedValidShape, {
      env: config,
      fetchImpl: async () => assert.fail('oversized snapshot must not reach Convex'),
    }),
    { status: 'failed', reason: 'snapshot_too_large' },
  );
  let malformedStageWasSent = false;
  assert.deepEqual(
    await publishProjectedSnapshot(
      {
        schemaVersion: 1,
        revision: snapshot.revision,
        runId: snapshot.runId,
        publishedAt: snapshot.publishedAt,
        sources: {},
      },
      {
        env: config,
        fetchImpl: async () => {
          malformedStageWasSent = true;
          return { ok: true, status: 200 };
        },
      },
    ),
    { status: 'failed', reason: 'invalid_snapshot' },
    'a staged object with missing snapshot sections must fail validation',
  );
  assert.equal(malformedStageWasSent, false);

  const offline = await publishProjectedSnapshot(snapshot, {
    env: config,
    fetchImpl: async () => {
      throw new Error(`offline; authorization ${config.CONVEX_MOBILE_PUBLISH_TOKEN}`);
    },
  });
  assert.deepEqual(offline, { status: 'failed', reason: 'transport_error' });
  assert(!JSON.stringify(offline).includes(config.CONVEX_MOBILE_PUBLISH_TOKEN));

  console.log(
    'PASS: mobile publish retries, duplicate payloads, bounded payload size, all-failed sources, and offline transport.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
