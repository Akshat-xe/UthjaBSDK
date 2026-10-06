'use strict';

const assert = require('node:assert/strict');
const {
  SyncRequestWorker,
  resolveEndpoints,
  isValidRequestId,
} = require('../../backend/features/sync/syncRequestWorker');

(async () => {
  // --- 1. Endpoint Resolution & HTTPS Allowlist ---
  assert.equal(
    resolveEndpoints({}).status,
    'not_configured',
    'Unconfigured env must return not_configured',
  );

  assert.equal(
    resolveEndpoints({
      CONVEX_MOBILE_PUBLISH_URL: 'http://insecure.example.com/mobile/snapshot',
      CONVEX_MOBILE_PUBLISH_TOKEN: 'secret-token',
    }).status,
    'failed',
    'HTTP URLs must be rejected',
  );

  assert.equal(
    resolveEndpoints({
      CONVEX_MOBILE_PUBLISH_URL: 'https://evil.attacker.com/mobile/snapshot',
      CONVEX_MOBILE_PUBLISH_TOKEN: 'secret-token',
    }).status,
    'failed',
    'Non-convex host must be rejected',
  );

  assert.equal(
    resolveEndpoints({
      CONVEX_MOBILE_PUBLISH_URL: 'https://app.convex.site/wrong/path',
      CONVEX_MOBILE_PUBLISH_TOKEN: 'secret-token',
    }).status,
    'failed',
    'Wrong path must be rejected',
  );

  assert.equal(
    resolveEndpoints({
      CONVEX_MOBILE_PUBLISH_URL: 'https://user:pass@app.convex.site/mobile/snapshot',
      CONVEX_MOBILE_PUBLISH_TOKEN: 'secret-token',
    }).status,
    'failed',
    'URL credentials must be rejected',
  );

  const valid = resolveEndpoints({
    CONVEX_MOBILE_PUBLISH_URL: 'https://swift-otter-123.convex.site/mobile/snapshot',
    CONVEX_MOBILE_PUBLISH_TOKEN: 'test-publish-token',
  });
  assert.equal(valid.status, 'configured');
  assert.equal(valid.claimUrl, 'https://swift-otter-123.convex.site/mobile/sync-request/claim');
  assert.equal(valid.completeUrlPrefix, 'https://swift-otter-123.convex.site/mobile/sync-request/');
  assert.equal(valid.token, 'test-publish-token');

  // Request ID validation
  assert.equal(isValidRequestId('req-123_abc'), true);
  assert.equal(isValidRequestId(''), false);
  assert.equal(isValidRequestId('req/escape'), false);
  assert.equal(isValidRequestId('req?foo=bar'), false);
  assert.equal(isValidRequestId('a'.repeat(200)), false);

  // --- 2. Worker Lifecycle & Non-Overlap ---
  let schedulerBusy = false;
  let executedTriggers = [];
  let publishStatusResult = 'published';

  const mockScheduler = {
    isBusy: () => schedulerBusy,
    execute: async (trigger) => {
      executedTriggers.push(trigger);
      schedulerBusy = true;
      try {
        if (publishStatusResult === 'error') {
          throw new Error('Sync failed');
        }
        return {
          syncState: { running: false },
          publishResult: { status: publishStatusResult, revision: 'rev-456' },
        };
      } finally {
        schedulerBusy = false;
      }
    },
  };

  const fetchCalls = [];
  let pendingQueue = [{ requestId: 'req-001', state: 'running' }];
  const completedRequests = [];

  const mockFetch = async (url, options) => {
    fetchCalls.push({ url: String(url), method: options.method, body: options.body });
    const urlStr = String(url);

    if (urlStr.endsWith('/mobile/sync-request/claim')) {
      assert.equal(options.headers.Authorization, 'Bearer test-publish-token');
      const item = pendingQueue.shift() || null;
      return {
        ok: true,
        json: async () => item,
      };
    }

    if (urlStr.includes('/mobile/sync-request/')) {
      assert.equal(options.headers.Authorization, 'Bearer test-publish-token');
      const reqId = urlStr.slice(urlStr.lastIndexOf('/') + 1);
      const parsedBody = JSON.parse(options.body);
      completedRequests.push({ requestId: reqId, state: parsedBody.state });
      return {
        ok: true,
        json: async () => ({ success: true, requestId: reqId, state: parsedBody.state }),
      };
    }

    return { ok: false, status: 404 };
  };

  const worker = new SyncRequestWorker({
    scheduler: mockScheduler,
    env: {
      CONVEX_MOBILE_PUBLISH_URL: 'https://swift-otter-123.convex.site/mobile/snapshot',
      CONVEX_MOBILE_PUBLISH_TOKEN: 'test-publish-token',
    },
    pollIntervalMs: 50,
    fetchImpl: mockFetch,
  });
  worker.running = true;

  // Step A: Poll and process successful request
  await worker.poll();
  assert.equal(executedTriggers.length, 1);
  assert.equal(executedTriggers[0], 'request');
  assert.equal(completedRequests.length, 1);
  assert.equal(completedRequests[0].requestId, 'req-001');
  assert.equal(completedRequests[0].state, 'completed');

  // Step B: Poll when queue is empty
  await worker.poll();
  assert.equal(executedTriggers.length, 1, 'Should not execute sync when queue is empty');

  // Step C: Poll when scheduler is busy
  schedulerBusy = true;
  pendingQueue.push({ requestId: 'req-002', state: 'running' });
  await worker.poll();
  assert.equal(pendingQueue.length, 1, 'Should not claim request while scheduler is busy');
  assert.equal(completedRequests.length, 1);
  schedulerBusy = false;

  // Step D: Process request that results in failed publish -> marks failed
  publishStatusResult = 'failed';
  await worker.poll();
  assert.equal(completedRequests.length, 2);
  assert.equal(completedRequests[1].requestId, 'req-002');
  assert.equal(completedRequests[1].state, 'failed');

  // Step E: Process request where sync execution throws an exception -> marks failed
  publishStatusResult = 'error';
  pendingQueue.push({ requestId: 'req-003', state: 'running' });
  await worker.poll();
  assert.equal(completedRequests.length, 3);
  assert.equal(completedRequests[2].requestId, 'req-003');
  assert.equal(completedRequests[2].state, 'failed');

  // Step F: Verify status report
  const status = worker.getStatus();
  assert.equal(status.lastRequestId, 'req-003');
  assert.ok(status.lastPolledAt);
  assert.ok(status.lastClaimedAt);
  assert.ok(status.lastCompletedAt);

  worker.stop();

  console.log('PASS: SyncRequestWorker claims when idle, obeys non-overlap, marks completed/failed, and uses bounded HTTPS.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
