'use strict';

/**
 * Mac worker for polling, claiming, and completing mobile sync requests queued through Convex.
 * Ensures strict non-overlap with local manual and scheduled syncs, bounded HTTPS transport,
 * and zero secret/payload logging.
 */

const DEFAULT_POLL_INTERVAL_MS = 7_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveEndpoints(env, { allowInsecureHttp = false } = {}) {
  const publishUrl =
    typeof env.CONVEX_MOBILE_PUBLISH_URL === 'string'
      ? env.CONVEX_MOBILE_PUBLISH_URL.trim()
      : '';
  const token =
    typeof env.CONVEX_MOBILE_PUBLISH_TOKEN === 'string'
      ? env.CONVEX_MOBILE_PUBLISH_TOKEN.trim()
      : '';

  if (!publishUrl || !token) {
    return { status: 'not_configured' };
  }

  let parsed;
  try {
    parsed = new URL(publishUrl);
  } catch {
    return { status: 'failed', reason: 'invalid_configuration' };
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const isAllowedHost = allowInsecureHttp
    ? isLocalhost || parsed.hostname.endsWith('.convex.site')
    : parsed.hostname.endsWith('.convex.site');
  const isAllowedProto = allowInsecureHttp && isLocalhost ? (parsed.protocol === 'http:' || parsed.protocol === 'https:') : parsed.protocol === 'https:';

  if (
    !isAllowedProto ||
    !isAllowedHost ||
    parsed.pathname !== '/mobile/snapshot' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return { status: 'failed', reason: 'invalid_configuration' };
  }

  const base = `${parsed.protocol}//${parsed.host}`;
  return {
    status: 'configured',
    token,
    claimUrl: `${base}/mobile/sync-request/claim`,
    completeUrlPrefix: `${base}/mobile/sync-request/`,
  };
}

function isValidRequestId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

class SyncRequestWorker {
  constructor({
    scheduler,
    env = process.env,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    fetchImpl = globalThis.fetch,
    allowInsecureHttp = false,
  } = {}) {
    if (!scheduler || typeof scheduler.isBusy !== 'function' || typeof scheduler.execute !== 'function') {
      throw new TypeError('SyncRequestWorker requires a valid SyncScheduler instance.');
    }
    this.scheduler = scheduler;
    this.env = env;
    this.pollIntervalMs = Math.max(1000, Number(pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS);
    this.fetchImpl = fetchImpl;
    this.allowInsecureHttp = Boolean(allowInsecureHttp);

    this.timer = null;
    this.running = false;
    this.busy = false;

    this.lastPolledAt = null;
    this.lastClaimedAt = null;
    this.lastCompletedAt = null;
    this.lastRequestId = null;
    this.lastError = null;
  }

  start() {
    this.stop();
    const config = resolveEndpoints(this.env, { allowInsecureHttp: this.allowInsecureHttp });
    if (config.status !== 'configured') {
      this.lastError = config.status === 'not_configured' ? 'not_configured' : config.reason;
      return;
    }
    this.running = true;
    this.lastError = null;
    this.scheduleNext(this.pollIntervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleNext(delayMs) {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.poll();
    }, delayMs);
    if (this.timer.unref) this.timer.unref();
  }

  async poll() {
    if (!this.running) return;
    this.lastPolledAt = new Date().toISOString();

    // Check if worker or scheduler is busy before claiming
    if (this.busy || this.scheduler.isBusy()) {
      this.scheduleNext(this.pollIntervalMs);
      return;
    }

    const config = resolveEndpoints(this.env, { allowInsecureHttp: this.allowInsecureHttp });
    if (config.status !== 'configured') {
      this.lastError = config.reason || 'configuration_unavailable';
      this.scheduleNext(this.pollIntervalMs);
      return;
    }

    let claimed = null;
    try {
      claimed = await this.claimRequest(config);
    } catch {
      // Safe transport error; continue polling
      this.scheduleNext(this.pollIntervalMs);
      return;
    }

    if (!claimed || !claimed.requestId) {
      this.scheduleNext(this.pollIntervalMs);
      return;
    }

    const { requestId } = claimed;
    if (!isValidRequestId(requestId)) {
      this.scheduleNext(this.pollIntervalMs);
      return;
    }

    this.busy = true;
    this.lastClaimedAt = new Date().toISOString();
    this.lastRequestId = requestId;

    let syncOutcome = null;
    let published = false;
    try {
      syncOutcome = await this.scheduler.execute('request');
      published = syncOutcome?.publishResult?.status === 'published';
    } catch {
      published = false;
    }

    const finalState = published ? 'completed' : 'failed';
    try {
      await this.completeRequest(config, requestId, finalState);
      this.lastCompletedAt = new Date().toISOString();
    } catch {
      // Complete call failure logged safely without payload/secret details
    } finally {
      this.busy = false;
      this.scheduleNext(this.pollIntervalMs);
    }
  }

  async claimRequest(config) {
    const response = await this.fetchImpl(config.claimUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      redirect: 'error',
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    if (!isRecord(body) || typeof body.requestId !== 'string' || body.state !== 'running') {
      return null;
    }

    return { requestId: body.requestId, state: body.state };
  }

  async completeRequest(config, requestId, state) {
    if (!isValidRequestId(requestId)) {
      throw new Error('Invalid requestId format.');
    }
    const url = `${config.completeUrlPrefix}${encodeURIComponent(requestId)}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      redirect: 'error',
    });

    if (!response.ok) {
      throw new Error(`Failed to complete sync request: HTTP ${response.status}`);
    }
    return response.json();
  }

  getStatus() {
    return {
      enabled: this.running,
      busy: this.busy,
      pollIntervalMs: this.pollIntervalMs,
      lastPolledAt: this.lastPolledAt,
      lastClaimedAt: this.lastClaimedAt,
      lastCompletedAt: this.lastCompletedAt,
      lastRequestId: this.lastRequestId,
      lastError: this.lastError,
    };
  }
}

module.exports = {
  SyncRequestWorker,
  resolveEndpoints,
  isValidRequestId,
  DEFAULT_POLL_INTERVAL_MS,
};
