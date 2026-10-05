const assert = require('node:assert/strict');
const {
  collectSnapshotInput,
  publishMobileSnapshot,
} = require('../../backend/features/mobile-publish/publisher');
const { projectSnapshot } = require('../../backend/features/mobile-publish/projection');

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
const menu = Object.fromEntries(
  days.map((day) => [day, Object.fromEntries(meals.map((meal) => [meal, ['Meal']]))]),
);
const metadata = {
  revision: 'revision-1',
  runId: 'run-1',
  publishedAt: '2026-09-30T10:00:00.000Z',
};
const academic = {
  attendance: { combined: null, nst: null, rufp: null },
  subjects: [],
  schedule: [],
  emails: [{ subject: 'Update', snippet: 'Short mail digest.' }],
  sources: { newton: { updatedAt: '2026-09-30T09:00:00.000Z' } },
};
const radar = { fetchedAt: '2026-09-30T09:30:00.000Z', opportunities: [] };
const menuData = { menu, fetchedAt: '2026-09-30T09:45:00.000Z' };
const syncState = {
  finishedAt: 'must-not-be-used-as-source-freshness',
  sources: {
    newton: { status: 'failed', error: 'private diagnostic', token: 'private-token' },
    rishiverse: { status: 'success', updatedAt: '2026-09-30T09:10:00.000Z' },
    gmail: { status: 'partial', items: [{ body: 'private body' }] },
    radar: { status: 'success' },
  },
};

(async () => {
  const calls = { academic: 0, radar: 0, menu: 0, sync: 0 };
  const input = await collectSnapshotInput({
    metadata,
    getAcademic: () => (calls.academic++, academic),
    getRadar: () => (calls.radar++, radar),
    getMenu: () => (calls.menu++, menuData),
    getSyncState: () => (calls.sync++, syncState),
  });
  assert.deepEqual(calls, { academic: 1, radar: 1, menu: 1, sync: 1 });
  assert.deepEqual(Object.keys(input).sort(), [
    'academic',
    'menu',
    'metadata',
    'radar',
    'syncResult',
  ]);
  assert.deepEqual(input.syncResult.sources, {
    newton: { status: 'failed' },
    rishiverse: { status: 'success', updatedAt: '2026-09-30T09:10:00.000Z' },
    gmail: { status: 'partial' },
    radar: { status: 'success' },
    menu: { status: 'success', updatedAt: menuData.fetchedAt },
  });
  const failedMenuInput = await collectSnapshotInput({
    metadata,
    getAcademic: () => academic,
    getRadar: () => radar,
    getMenu: () => ({ ...menuData, status: 'failed' }),
    getSyncState: () => syncState,
  });
  assert.deepEqual(projectSnapshot(failedMenuInput).sources.menu, {
    status: 'failed',
    freshness: 'stale',
    updatedAt: menuData.fetchedAt,
  });
  const snap = await publishMobileSnapshot(input, {
    env: {},
    fetchImpl: async () => assert.fail('must not send when cloud is not configured'),
  });
  assert.deepEqual(snap, { status: 'not_configured' });
  assert.deepEqual(await publishMobileSnapshot({ malformed: true }, { env: {} }), {
    status: 'failed',
    reason: 'invalid_snapshot',
  });

  const config = {
    CONVEX_MOBILE_PUBLISH_URL: 'https://example.convex.site/mobile/snapshot',
    CONVEX_MOBILE_PUBLISH_TOKEN: 'publisher-test-secret',
  };
  let request;
  const published = await publishMobileSnapshot(input, {
    env: config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(published, { status: 'published', revision: 'revision-1' });
  assert.equal(request.url.href, config.CONVEX_MOBILE_PUBLISH_URL);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer publisher-test-secret');
  const body = JSON.parse(request.options.body);
  assert.equal(body.academic.emails[0].summary, 'Short mail digest.');
  assert.deepEqual(body.sources.newton, {
    status: 'failed',
    freshness: 'stale',
    updatedAt: '2026-09-30T09:00:00.000Z',
  });
  assert(!request.options.body.includes('private-token'));
  assert(!request.options.body.includes('private diagnostic'));
  assert(!request.options.body.includes('private body'));
  assert(!JSON.stringify(published).includes(config.CONVEX_MOBILE_PUBLISH_TOKEN));

  for (const badUrl of [
    'http://example.convex.site/publish',
    'https://evil.example/publish',
    'https://user:pass@example.convex.site/publish',
    'https://example.convex.site/publish?token=secret',
    'https://example.convex.site/unrelated',
  ]) {
    assert.deepEqual(
      await publishMobileSnapshot(input, {
        env: { ...config, CONVEX_MOBILE_PUBLISH_URL: badUrl },
        fetchImpl: async () => assert.fail('must reject unsafe endpoint before network call'),
      }),
      { status: 'failed', reason: 'invalid_configuration' },
    );
  }

  assert.deepEqual(
    await publishMobileSnapshot(input, {
      env: config,
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'private response' }),
    }),
    { status: 'failed', reason: 'http_error', httpStatus: 503 },
  );
  const networkFailure = await publishMobileSnapshot(input, {
    env: config,
    fetchImpl: async () => {
      throw new Error(`request failed with ${config.CONVEX_MOBILE_PUBLISH_TOKEN}`);
    },
  });
  assert.deepEqual(networkFailure, { status: 'failed', reason: 'transport_error' });
  assert(!JSON.stringify(networkFailure).includes(config.CONVEX_MOBILE_PUBLISH_TOKEN));

  assert.deepEqual(await publishMobileSnapshot({ malformed: true }, { env: config }), {
    status: 'failed',
    reason: 'invalid_snapshot',
  });
  await assert.rejects(
    collectSnapshotInput({
      metadata,
      getAcademic: async () => {
        throw new Error('private source failure');
      },
      getRadar: async () => radar,
      getMenu: async () => menuData,
      getSyncState: async () => syncState,
    }),
    /private source failure/,
  );
  console.log(
    'PASS: mobile snapshot collection and Convex publisher isolate configuration and transport failures.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
