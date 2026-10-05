'use strict';

const { projectSnapshot } = require('./projection');

const SOURCE_NAMES = ['newton', 'rishiverse', 'gmail', 'radar'];
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 700_000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProjectedSnapshot(value) {
  if (!isRecord(value)) return false;
  const required = ['schemaVersion', 'revision', 'runId', 'publishedAt', 'sources', 'academic', 'radar', 'menu'];
  if (Object.keys(value).some((key) => !required.includes(key))) return false;
  if (value.schemaVersion !== 1 ||
      typeof value.revision !== 'string' || !value.revision || value.revision.length > 100 ||
      typeof value.runId !== 'string' || !value.runId || value.runId.length > 100 ||
      typeof value.publishedAt !== 'string' || Number.isNaN(Date.parse(value.publishedAt))) return false;
  if (!isRecord(value.sources) ||
      !['newton', 'rishiverse', 'gmail', 'radar', 'menu'].every((key) =>
        isRecord(value.sources[key]) && typeof value.sources[key].status === 'string')) return false;
  if (!isRecord(value.academic) || !isRecord(value.academic.attendance) ||
      !Array.isArray(value.academic.subjects) || value.academic.subjects.length > 100 ||
      !Array.isArray(value.academic.schedule) || value.academic.schedule.length > 14 ||
      !Array.isArray(value.academic.emails) || value.academic.emails.length > 12) return false;
  if (!isRecord(value.radar) || !Array.isArray(value.radar.opportunities) ||
      value.radar.opportunities.length > 50) return false;
  if (!isRecord(value.menu) || !isRecord(value.menu.menu)) return false;
  return true;
}

async function collectSnapshotInput({ getAcademic, getRadar, getMenu, getSyncState, metadata }) {
  for (const [name, getter] of Object.entries({ getAcademic, getRadar, getMenu, getSyncState })) {
    if (typeof getter !== 'function')
      throw new TypeError(`Mobile snapshot collector requires ${name}.`);
  }
  const [academic, radar, menu, state] = await Promise.all([
    getAcademic(),
    getRadar(),
    getMenu(),
    getSyncState(),
  ]);
  if (!state || typeof state !== 'object' || !state.sources || typeof state.sources !== 'object')
    throw new TypeError('Mobile snapshot collector requires sync source status.');

  const sources = {};
  for (const name of SOURCE_NAMES) {
    const source = state.sources[name];
    if (source && typeof source === 'object' && typeof source.status === 'string') {
      sources[name] = { status: source.status };
      if (typeof source.updatedAt === 'string') sources[name].updatedAt = source.updatedAt;
    }
  }
  const menuStatus = menu?.status || 'success';
  sources.menu = { status: menuStatus };
  if (menuStatus === 'success' && typeof menu?.fetchedAt === 'string')
    sources.menu.updatedAt = menu.fetchedAt;

  return {
    metadata,
    academic,
    radar,
    menu,
    syncResult: { sources },
  };
}

function configuredEndpoint(env) {
  const endpoint =
    typeof env.CONVEX_MOBILE_PUBLISH_URL === 'string' ? env.CONVEX_MOBILE_PUBLISH_URL.trim() : '';
  const token =
    typeof env.CONVEX_MOBILE_PUBLISH_TOKEN === 'string'
      ? env.CONVEX_MOBILE_PUBLISH_TOKEN.trim()
      : '';
  if (!endpoint || !token) return { status: 'not_configured' };
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { status: 'failed', reason: 'invalid_configuration' };
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.convex.site') ||
    url.pathname !== '/mobile/snapshot' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return { status: 'failed', reason: 'invalid_configuration' };
  return { status: 'configured', url, token };
}

async function publishMobileSnapshot(input, options = {}) {
  let snapshot;
  try {
    snapshot = projectSnapshot(input);
  } catch {
    return { status: 'failed', reason: 'invalid_snapshot' };
  }
  return publishProjectedSnapshot(snapshot, options);
}

async function publishProjectedSnapshot(snapshot, options = {}) {
  if (!isProjectedSnapshot(snapshot))
    return { status: 'failed', reason: 'invalid_snapshot' };
  const body = JSON.stringify(snapshot);
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES)
    return { status: 'failed', reason: 'snapshot_too_large' };
  const env = options.env || process.env;
  const endpoint = configuredEndpoint(env);
  if (endpoint.status !== 'configured') return endpoint;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { status: 'failed', reason: 'transport_unavailable' };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const response = await fetchImpl(endpoint.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (!response.ok)
      return { status: 'failed', reason: 'http_error', httpStatus: response.status };
    return { status: 'published', revision: snapshot.revision };
  } catch {
    return { status: 'failed', reason: 'transport_error' };
  }
}

module.exports = { collectSnapshotInput, publishMobileSnapshot, publishProjectedSnapshot, isProjectedSnapshot };
