'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {
  SyncScheduler,
  parseInterval,
  parseCron,
  matchesCron,
  computeNextCronRun,
  deriveOverallStatus,
  summarizeSources,
} = require('../../backend/features/sync/scheduler');

(async () => {
  // 1. Test parseInterval
  assert.equal(parseInterval('15m', { minIntervalMs: 1000 }), 900_000);
  assert.equal(parseInterval('30m', { minIntervalMs: 1000 }), 1_800_000);
  assert.equal(parseInterval('1h', { minIntervalMs: 1000 }), 3_600_000);
  assert.equal(parseInterval('60s', { minIntervalMs: 1000 }), 60_000);
  assert.equal(parseInterval('1800000', { minIntervalMs: 1000 }), 1_800_000);
  assert.equal(parseInterval('45', { minIntervalMs: 1000 }), 45 * 60 * 1000);
  assert.equal(parseInterval('', { minIntervalMs: 1000 }), null);
  assert.equal(parseInterval(null, { minIntervalMs: 1000 }), null);

  assert.throws(() => parseInterval('invalid', { minIntervalMs: 1000 }), /Invalid interval expression/);
  assert.throws(() => parseInterval('-5m', { minIntervalMs: 1000 }), /Invalid interval expression/);
  assert.throws(() => parseInterval('0m', { minIntervalMs: 1000 }), /Interval must be greater than 0/);
  assert.throws(
    () => parseInterval('5s', { minIntervalMs: 10_000 }),
    /shorter than minimum allowed/,
  );

  // 2. Test parseCron and matchesCron / computeNextCronRun
  const cron15m = parseCron('*/15 * * * *');
  assert.deepEqual([...cron15m.minute].sort((a, b) => a - b), [0, 15, 30, 45]);
  assert.equal(cron15m.hour.size, 24);
  assert.equal(cron15m.domWildcard, true);
  assert.equal(cron15m.dowWildcard, true);

  const cronWeekday9am = parseCron('0 9 * * 1-5');
  assert.deepEqual([...cronWeekday9am.minute], [0]);
  assert.deepEqual([...cronWeekday9am.hour], [9]);
  assert.deepEqual([...cronWeekday9am.dow].sort((a, b) => a - b), [1, 2, 3, 4, 5]);

  assert.throws(() => parseCron('* * * *'), /must have exactly 5 fields/);
  assert.throws(() => parseCron('60 * * * *'), /out of range/);
  assert.throws(() => parseCron('* 25 * * *'), /out of range/);
  assert.throws(() => parseCron('* * 32 * *'), /out of range/);
  assert.throws(() => parseCron('* * * 13 *'), /out of range/);
  assert.throws(() => parseCron('* * * * 8'), /out of range/);

  // Check computeNextCronRun with known date:
  // Friday, 2026-10-02 at 09:15:00 UTC (or local)
  const baseFriday = new Date(2026, 9, 2, 9, 15, 0); // month is 0-indexed in JS Date: 9 = October
  const next15 = computeNextCronRun(cron15m, baseFriday);
  assert.equal(next15.getMinutes(), 30);
  assert.equal(next15.getHours(), 9);

  // Friday 09:05 -> next weekday 9am should be Monday 09:00!
  const nextWeekday = computeNextCronRun(cronWeekday9am, baseFriday);
  assert.equal(nextWeekday.getDay(), 1); // Monday
  assert.equal(nextWeekday.getHours(), 9);
  assert.equal(nextWeekday.getMinutes(), 0);

  // 3. Test deriveOverallStatus and summarizeSources (do NOT invent success when sources lack access!)
  assert.equal(
    deriveOverallStatus(
      { sources: { newton: { status: 'success' }, rishiverse: { status: 'success' }, radar: { status: 'success' } } },
      { status: 'published' },
    ),
    'success',
  );
  assert.equal(
    deriveOverallStatus(
      { sources: { newton: { status: 'success' }, rishiverse: { status: 'success' }, radar: { status: 'success' } } },
      { status: 'not_configured' },
    ),
    'success',
  );
  // Attendance setup_required must NOT report success!
  assert.equal(
    deriveOverallStatus(
      {
        sources: {
          newton: { status: 'setup_required' },
          rishiverse: { status: 'setup_required' },
          radar: { status: 'success' },
          gmail: { status: 'success' },
        },
      },
      { status: 'published' },
    ),
    'partial',
  );
  assert.equal(
    deriveOverallStatus(
      { sources: { newton: { status: 'setup_required' }, rishiverse: { status: 'setup_required' } } },
      null,
    ),
    'setup_required',
  );
  assert.equal(
    deriveOverallStatus(
      { sources: { newton: { status: 'failed' }, rishiverse: { status: 'failed' } } },
      null,
    ),
    'failed',
  );
  // If publish failed, overall is partial not success
  assert.equal(
    deriveOverallStatus(
      { sources: { newton: { status: 'success' }, rishiverse: { status: 'success' } } },
      { status: 'failed' },
    ),
    'partial',
  );

  // summarizeSources redacts any private tokens, mail snippets, or internal properties
  const safeSummary = summarizeSources({
    sources: {
      newton: { status: 'setup_required', token: 'secret-token-123', cookie: 'secret-cookie' },
      gmail: { status: 'success', emails: [{ body: 'private email content' }] },
    },
  });
  assert.deepEqual(safeSummary, {
    newton: 'setup_required',
    gmail: 'success',
  });

  // 4. Test Disabled by Default
  const disabledScheduler = new SyncScheduler({
    executeSync: async () => ({ syncState: {}, publishResult: {} }),
    env: {}, // No SYNC_SCHEDULE_ENABLED
  });
  assert.equal(disabledScheduler.enabled, false);
  assert.equal(disabledScheduler.mode, 'disabled');
  assert.equal(disabledScheduler.getStatus().enabled, false);
  assert.equal(disabledScheduler.getStatus().nextRunAt, null);
  disabledScheduler.start();
  assert.equal(disabledScheduler.timer, null);
  disabledScheduler.stop();

  // 5. Test Enabled with Interval
  const intervalScheduler = new SyncScheduler({
    executeSync: async () => ({ syncState: {}, publishResult: {} }),
    env: {
      SYNC_SCHEDULE_ENABLED: 'true',
      SYNC_SCHEDULE_INTERVAL: '15m',
    },
    options: { minIntervalMs: 100 },
  });
  assert.equal(intervalScheduler.enabled, true);
  assert.equal(intervalScheduler.mode, 'interval');
  assert.equal(intervalScheduler.intervalMs, 900_000);
  intervalScheduler.start();
  assert.ok(intervalScheduler.nextRunAt);
  assert.ok(new Date(intervalScheduler.nextRunAt).getTime() > Date.now());
  intervalScheduler.stop();
  assert.equal(intervalScheduler.nextRunAt, null);

  // 6. Test Enabled with Cron
  const cronScheduler = new SyncScheduler({
    executeSync: async () => ({ syncState: {}, publishResult: {} }),
    env: {
      SYNC_SCHEDULE_ENABLED: 'true',
      SYNC_SCHEDULE_CRON: '*/30 * * * *',
    },
  });
  assert.equal(cronScheduler.enabled, true);
  assert.equal(cronScheduler.mode, 'cron');
  assert.equal(cronScheduler.cronExpression, '*/30 * * * *');
  cronScheduler.start();
  assert.ok(cronScheduler.nextRunAt);
  const nextCronDate = new Date(cronScheduler.nextRunAt);
  assert.ok([0, 30].includes(nextCronDate.getMinutes()));
  cronScheduler.stop();

  // 7. Test Shared Pipeline Execution & Safe Outcome Recording
  let executedTriggers = [];
  const execScheduler = new SyncScheduler({
    executeSync: async ({ trigger }) => {
      executedTriggers.push(trigger);
      return {
        syncState: {
          finishedAt: new Date().toISOString(),
          sources: {
            newton: { status: 'setup_required' },
            rishiverse: { status: 'setup_required' },
            radar: { status: 'success' },
          },
        },
        publishResult: { status: 'published', revision: 'test-rev-1' },
      };
    },
    env: {},
  });

  const manualRun = execScheduler.triggerManual();
  assert.equal(manualRun.started, true);
  await manualRun.promise;
  assert.deepEqual(executedTriggers, ['manual']);
  const statusAfterManual = execScheduler.getStatus();
  assert.ok(statusAfterManual.lastRunAt);
  assert.equal(statusAfterManual.lastOutcome.status, 'partial');
  assert.equal(statusAfterManual.lastOutcome.trigger, 'manual');
  assert.equal(statusAfterManual.lastOutcome.publishStatus, 'published');
  assert.equal(statusAfterManual.lastOutcome.publishRevision, 'test-rev-1');
  assert.deepEqual(statusAfterManual.lastOutcome.sources, {
    newton: 'setup_required',
    rishiverse: 'setup_required',
    radar: 'success',
  });

  // Scheduled tick uses the EXACT same executeSync pipeline
  await execScheduler.tick();
  assert.deepEqual(executedTriggers, ['manual', 'scheduled']);
  const statusAfterScheduled = execScheduler.getStatus();
  assert.equal(statusAfterScheduled.lastOutcome.trigger, 'scheduled');
  assert.equal(statusAfterScheduled.lastOutcome.status, 'partial');

  // 8. Test Nonoverlap: manual and scheduled skip/reject when busy
  let resolveSlowSync;
  const slowSyncPromise = new Promise((resolve) => {
    resolveSlowSync = resolve;
  });

  let slowRunCount = 0;
  const overlapScheduler = new SyncScheduler({
    executeSync: async () => {
      slowRunCount++;
      await slowSyncPromise;
      return { syncState: { sources: {} }, publishResult: {} };
    },
    env: {},
  });

  // Start slow run
  const firstTrigger = overlapScheduler.triggerManual();
  assert.equal(firstTrigger.started, true);
  assert.equal(overlapScheduler.isBusy(), true);

  // Attempt second manual trigger while busy -> rejected with already_running
  const secondTrigger = overlapScheduler.triggerManual();
  assert.equal(secondTrigger.started, false);
  assert.equal(secondTrigger.reason, 'already_running');

  // Attempt scheduled tick while busy -> skipped, records skip timestamp
  assert.equal(overlapScheduler.skipCount, 0);
  assert.equal(overlapScheduler.lastSkippedAt, null);
  await overlapScheduler.tick();
  assert.equal(overlapScheduler.skipCount, 1);
  assert.ok(overlapScheduler.lastSkippedAt);
  assert.equal(slowRunCount, 1); // No new execution was started!

  // Now resolve slow sync and verify lock clears
  resolveSlowSync();
  await firstTrigger.promise;
  assert.equal(overlapScheduler.isBusy(), false);

  // Subsequent manual run succeeds
  const thirdTrigger = overlapScheduler.triggerManual();
  assert.equal(thirdTrigger.started, true);
  await thirdTrigger.promise;
  assert.equal(slowRunCount, 2);

  // 9. Test Fast Live Timer Execution
  let liveTickCount = 0;
  const liveScheduler = new SyncScheduler({
    executeSync: async () => {
      liveTickCount++;
      return {
        syncState: { sources: { radar: { status: 'success' } } },
        publishResult: { status: 'not_configured' },
      };
    },
    env: {
      SYNC_SCHEDULE_ENABLED: 'true',
      SYNC_SCHEDULE_INTERVAL: '15ms',
    },
    options: { minIntervalMs: 10 },
  });

  liveScheduler.start();
  await new Promise((r) => setTimeout(r, 60));
  liveScheduler.stop();
  assert.ok(liveTickCount >= 1, `Live scheduler should have ticked at least once, got ${liveTickCount}`);
  assert.equal(liveScheduler.getStatus().lastOutcome.status, 'success');

  // 10. Test Server Endpoints Integration
  const { app, scheduler } = require('../../backend/server');
  scheduler.stop(); // ensure in-process background scheduler does not interfere
  const originalExecuteSync = scheduler.executeSync;
  scheduler.executeSync = async () => ({
    syncState: { sources: {} },
    publishResult: { status: 'published' },
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const testPort = address.port;
  const localOrigin = `http://127.0.0.1:${process.env.PORT || 3000}`;

  function makeRequest({ path, method = 'GET', headers = {} }) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: testPort,
          path,
          method,
          headers: {
            Host: `127.0.0.1:${process.env.PORT || 3000}`,
            ...headers,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            let parsed = body;
            try {
              parsed = JSON.parse(body);
            } catch {}
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  try {
    // Test GET /api/sync/status
    const statusRes = await makeRequest({ path: '/api/sync/status' });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.success, true);
    assert.ok(statusRes.body.schedule, 'sync/status includes schedule info');
    assert.equal(typeof statusRes.body.schedule.enabled, 'boolean');
    assert.equal(typeof statusRes.body.schedule.running, 'boolean');

    // Test GET /api/sync/schedule
    const schedRes = await makeRequest({ path: '/api/sync/schedule' });
    assert.equal(schedRes.status, 200);
    assert.equal(schedRes.body.success, true);
    assert.equal(typeof schedRes.body.enabled, 'boolean');
    assert.equal(typeof schedRes.body.running, 'boolean');

    // Test POST /api/sync with foreign origin is blocked
    const foreignPost = await makeRequest({
      path: '/api/sync',
      method: 'POST',
      headers: { Origin: 'https://attacker.example.com' },
    });
    assert.equal(foreignPost.status, 403);

    // Test POST /api/sync with valid local origin
    const localPost = await makeRequest({
      path: '/api/sync',
      method: 'POST',
      headers: { Origin: localOrigin },
    });
    // Can return 202 or 409 if already running
    assert.ok([202, 409].includes(localPost.status));
  } finally {
    server.close();
    scheduler.executeSync = originalExecuteSync;
  }

  console.log(
    'PASS: scheduled local sync orchestration parses interval/cron, respects non-overlap, shares the full sync pipeline, and safely exposes schedule status.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
