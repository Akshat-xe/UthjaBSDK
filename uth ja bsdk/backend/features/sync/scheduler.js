'use strict';

/**
 * Scheduled sync orchestration for laptop background execution.
 * Package-free interval and 5-field cron parser with strict non-overlap protection.
 */

function parseInterval(value, { minIntervalMs = 10_000 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim().toLowerCase();
  if (!str) return null;

  const match = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/);
  if (!match) {
    throw new Error(`Invalid interval expression: "${value}"`);
  }

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Interval must be greater than 0: "${value}"`);
  }

  const unit = match[2] || '';
  let ms;
  switch (unit) {
    case 'ms':
      ms = Math.round(num);
      break;
    case 's':
      ms = Math.round(num * 1000);
      break;
    case 'm':
      ms = Math.round(num * 60 * 1000);
      break;
    case 'h':
      ms = Math.round(num * 3600 * 1000);
      break;
    case 'd':
      ms = Math.round(num * 86400 * 1000);
      break;
    default:
      // When no unit: if >= 1000 treat as milliseconds, otherwise treat as minutes
      ms = num >= 1000 ? Math.round(num) : Math.round(num * 60 * 1000);
      break;
  }

  if (ms < minIntervalMs) {
    throw new Error(`Interval ${ms}ms is shorter than minimum allowed (${minIntervalMs}ms)`);
  }
  return ms;
}

function parseCronField(fieldStr, min, max, isDayOfWeek = false) {
  const parts = fieldStr.split(',');
  const values = new Set();
  let isWildcard = false;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error(`Empty part in cron field "${fieldStr}"`);

    if (trimmed === '*') {
      isWildcard = true;
      for (let i = min; i <= (isDayOfWeek ? 6 : max); i++) values.add(i);
      continue;
    }

    if (trimmed.startsWith('*/')) {
      const step = parseInt(trimmed.slice(2), 10);
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid step in cron field "${fieldStr}"`);
      }
      for (let i = min; i <= max; i += step) {
        values.add(isDayOfWeek && i === 7 ? 0 : i);
      }
      continue;
    }

    if (trimmed.includes('-')) {
      const [rangePart, stepPart] = trimmed.split('/');
      const step = stepPart ? parseInt(stepPart, 10) : 1;
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid step in range "${trimmed}"`);
      }
      const rangeEnds = rangePart.split('-');
      if (rangeEnds.length !== 2) throw new Error(`Invalid range "${trimmed}"`);
      const start = parseInt(rangeEnds[0], 10);
      const end = parseInt(rangeEnds[1], 10);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < min ||
        end > max ||
        start > end
      ) {
        throw new Error(`Invalid range boundaries in "${trimmed}"`);
      }
      for (let i = start; i <= end; i += step) {
        values.add(isDayOfWeek && i === 7 ? 0 : i);
      }
      continue;
    }

    const val = parseInt(trimmed, 10);
    if (!Number.isInteger(val) || val < min || val > max) {
      throw new Error(`Value "${trimmed}" out of range [${min}, ${max}]`);
    }
    values.add(isDayOfWeek && val === 7 ? 0 : val);
  }

  return { values, isWildcard };
}

function parseCron(expression) {
  if (typeof expression !== 'string') return null;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Cron expression must have exactly 5 fields, got ${fields.length}`);
  }

  const minute = parseCronField(fields[0], 0, 59);
  const hour = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 7, true);

  return {
    raw: expression.trim(),
    minute: minute.values,
    hour: hour.values,
    dom: dom.values,
    month: month.values,
    dow: dow.values,
    domWildcard: dom.isWildcard,
    dowWildcard: dow.isWildcard,
  };
}

function matchesCron(parsed, date) {
  const m = date.getMinutes();
  const h = date.getHours();
  const dom = date.getDate();
  const mon = date.getMonth() + 1;
  const dow = date.getDay();

  if (!parsed.minute.has(m)) return false;
  if (!parsed.hour.has(h)) return false;
  if (!parsed.month.has(mon)) return false;

  if (parsed.domWildcard && parsed.dowWildcard) {
    return true;
  }
  if (parsed.domWildcard) {
    return parsed.dow.has(dow);
  }
  if (parsed.dowWildcard) {
    return parsed.dom.has(dom);
  }
  return parsed.dom.has(dom) || parsed.dow.has(dow);
}

function computeNextCronRun(parsed, fromDate = new Date()) {
  const next = new Date(fromDate.getTime());
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search forward up to 525,600 minutes (1 year)
  for (let i = 0; i < 525600; i++) {
    if (matchesCron(parsed, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }
  return null;
}

function summarizeSources(syncState) {
  if (!syncState || typeof syncState.sources !== 'object') return {};
  const summary = {};
  for (const [key, val] of Object.entries(syncState.sources)) {
    if (val && typeof val.status === 'string') {
      summary[key] = val.status;
    }
  }
  return summary;
}

function deriveOverallStatus(syncState, publishResult) {
  if (!syncState || typeof syncState.sources !== 'object') return 'failed';
  const sourceStatuses = Object.values(syncState.sources).map((s) => s?.status);
  if (!sourceStatuses.length) return 'failed';

  const allSuccess = sourceStatuses.every((s) => s === 'success');
  const allSetupRequired = sourceStatuses.every((s) => s === 'setup_required');
  const allFailed = sourceStatuses.every((s) => s === 'failed');

  if (allFailed) return 'failed';
  if (
    allSuccess &&
    (!publishResult ||
      publishResult.status === 'published' ||
      publishResult.status === 'not_configured')
  ) {
    return 'success';
  }
  if (allSetupRequired) return 'setup_required';
  return 'partial';
}

class SyncScheduler {
  constructor({
    executeSync,
    isSyncRunning,
    env = process.env,
    options = {},
  } = {}) {
    this.executeSync = executeSync;
    this.isSyncRunning = isSyncRunning;
    this.env = env;
    this.options = options;

    this.timer = null;
    this.inFlight = false;
    this.inFlightPromise = null;

    this.lastRunAt = null;
    this.nextRunAt = null;
    this.lastOutcome = null;
    this.lastSkippedAt = null;
    this.skipCount = 0;

    this.reloadConfig();
  }

  reloadConfig() {
    const rawEnabled = this.env.SYNC_SCHEDULE_ENABLED;
    this.enabled = rawEnabled === 'true' || rawEnabled === '1' || rawEnabled === 'yes';

    this.cronExpression = null;
    this.parsedCron = null;
    this.intervalMs = null;
    this.mode = 'disabled';
    this.configError = null;

    if (!this.enabled) {
      this.mode = 'disabled';
      return;
    }

    const minIntervalMs =
      this.options.minIntervalMs ?? (this.env.NODE_ENV === 'test' ? 10 : 10_000);

    const cronStr = this.env.SYNC_SCHEDULE_CRON ? this.env.SYNC_SCHEDULE_CRON.trim() : '';
    if (cronStr) {
      try {
        this.parsedCron = parseCron(cronStr);
        this.cronExpression = cronStr;
        this.mode = 'cron';
      } catch (err) {
        this.configError = `Invalid cron: ${err.message}`;
        this.mode = 'error';
        return;
      }
    } else {
      const intervalStr = this.env.SYNC_SCHEDULE_INTERVAL
        ? this.env.SYNC_SCHEDULE_INTERVAL.trim()
        : '30m';
      try {
        this.intervalMs = parseInterval(intervalStr, { minIntervalMs });
        this.mode = 'interval';
      } catch (err) {
        this.configError = `Invalid interval: ${err.message}`;
        this.mode = 'error';
        return;
      }
    }
  }

  isBusy() {
    return this.inFlight || Boolean(this.isSyncRunning && this.isSyncRunning());
  }

  start() {
    this.stop();
    this.reloadConfig();
    if (!this.enabled || this.mode === 'error') {
      return;
    }
    this.scheduleNext();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
  }

  scheduleNext() {
    if (!this.enabled || this.mode === 'error') {
      this.nextRunAt = null;
      return;
    }

    let delayMs;
    const now = Date.now();

    if (this.mode === 'cron') {
      const nextDate = computeNextCronRun(this.parsedCron, new Date(now));
      if (!nextDate) {
        this.nextRunAt = null;
        return;
      }
      this.nextRunAt = nextDate.toISOString();
      delayMs = Math.max(0, nextDate.getTime() - now);
    } else if (this.mode === 'interval') {
      delayMs = this.intervalMs;
      this.nextRunAt = new Date(now + delayMs).toISOString();
    } else {
      return;
    }

    this.timer = setTimeout(async () => {
      await this.tick();
    }, delayMs);
    if (this.timer.unref) this.timer.unref();
  }

  async tick() {
    if (this.isBusy()) {
      this.recordSkip('already_running');
      this.scheduleNext();
      return;
    }
    try {
      await this.execute('scheduled');
    } catch {
      // Handled and recorded in execute
    } finally {
      this.scheduleNext();
    }
  }

  recordSkip(reason = 'already_running') {
    this.lastSkippedAt = new Date().toISOString();
    this.skipCount += 1;
  }

  triggerManual() {
    if (this.isBusy()) {
      return { started: false, reason: 'already_running' };
    }
    const promise = this.execute('manual');
    return { started: true, promise };
  }

  async execute(trigger = 'manual') {
    if (this.inFlight) {
      return this.inFlightPromise;
    }

    this.inFlight = true;
    const startedAt = new Date().toISOString();
    this.lastRunAt = startedAt;

    this.inFlightPromise = (async () => {
      try {
        const { syncState, publishResult } = await this.executeSync({ trigger });
        const finishedAt = new Date().toISOString();
        const status = deriveOverallStatus(syncState, publishResult);
        this.lastOutcome = {
          status,
          startedAt,
          finishedAt,
          trigger,
          sources: summarizeSources(syncState),
          publishStatus: publishResult?.status || null,
          publishRevision: publishResult?.revision || null,
          reason: publishResult?.reason || null,
        };
        return { syncState, publishResult, outcome: this.lastOutcome };
      } catch (error) {
        const finishedAt = new Date().toISOString();
        this.lastOutcome = {
          status: 'failed',
          startedAt,
          finishedAt,
          trigger,
          reason: 'sync_failed',
        };
        throw error;
      } finally {
        this.inFlight = false;
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  getStatus() {
    const status = {
      enabled: this.enabled,
      running: this.isBusy(),
      mode: this.mode,
      intervalMs: this.intervalMs,
      cron: this.cronExpression,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastRun: this.lastRunAt,
      nextRun: this.nextRunAt,
      lastOutcome: this.lastOutcome,
      lastSkippedAt: this.lastSkippedAt,
      skipCount: this.skipCount,
    };
    if (this.configError) {
      status.configError = this.configError;
    }
    return status;
  }

  initFromPersisted(syncState, publishReceipt) {
    if (syncState?.finishedAt) {
      this.lastRunAt = syncState.startedAt || syncState.finishedAt;
      this.lastOutcome = {
        status: deriveOverallStatus(syncState, publishReceipt),
        startedAt: syncState.startedAt || null,
        finishedAt: syncState.finishedAt,
        trigger: 'persisted',
        sources: summarizeSources(syncState),
        publishStatus: publishReceipt?.status || null,
        publishRevision: publishReceipt?.revision || null,
        reason: publishReceipt?.reason || null,
      };
    }
  }
}

module.exports = {
  SyncScheduler,
  parseInterval,
  parseCron,
  matchesCron,
  computeNextCronRun,
  deriveOverallStatus,
  summarizeSources,
};
