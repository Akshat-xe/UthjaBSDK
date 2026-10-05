import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();
const MAX_BODY_BYTES = 700_000;
const encoder = new TextEncoder();

function tokenMatches(request: Request, expected: string | undefined): boolean {
  if (!expected || expected.length < 32) return false;
  const authorization = request.headers.get('authorization') || '';
  const given = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const left = encoder.encode(given);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSnapshotV1(value: unknown): value is {
  schemaVersion: 1;
  revision: string;
  runId: string;
  publishedAt: string;
  sources: Record<string, unknown>;
} {
  if (!isRecord(value)) return false;
  const input = value;
  const required = ['schemaVersion', 'revision', 'runId', 'publishedAt', 'sources', 'academic', 'radar', 'menu'];
  if (Object.keys(input).some((key) => !required.includes(key))) return false;
  const academic = input.academic;
  const radar = input.radar;
  const menu = input.menu;
  const sources = input.sources;
  if (!isRecord(sources)) return false;
  return (
    input.schemaVersion === 1 &&
    typeof input.revision === 'string' &&
    input.revision.length > 0 &&
    input.revision.length <= 100 &&
    typeof input.runId === 'string' &&
    input.runId.length > 0 &&
    input.runId.length <= 100 &&
    typeof input.publishedAt === 'string' &&
    !Number.isNaN(Date.parse(input.publishedAt)) &&
    ['newton', 'rishiverse', 'gmail', 'radar', 'menu'].every((key) => {
      const source = sources[key];
      return isRecord(source) && typeof source.status === 'string';
    }) &&
    isRecord(academic) &&
    isRecord(academic.attendance) &&
    Array.isArray(academic.subjects) && academic.subjects.length <= 100 &&
    Array.isArray(academic.schedule) && academic.schedule.length <= 14 &&
    Array.isArray(academic.emails) && academic.emails.length <= 12 &&
    isRecord(radar) && Array.isArray(radar.opportunities) && radar.opportunities.length <= 50 &&
    isRecord(menu) && isRecord(menu.menu)
  );
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

http.route({
  path: '/mobile/snapshot',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!tokenMatches(request, process.env.MOBILE_PUBLISH_TOKEN))
      return jsonError(401, 'Unauthorized');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return jsonError(415, 'JSON required');
    let body: string | null;
    try {
      body = await readLimitedBody(request);
    } catch {
      return jsonError(400, 'Invalid UTF-8 body');
    }
    if (body === null) return jsonError(413, 'Snapshot too large');
    const bytes = encoder.encode(body);
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(body);
    } catch {
      return jsonError(400, 'Invalid JSON');
    }
    if (!isSnapshotV1(snapshot)) return jsonError(400, 'Invalid snapshot');
    const sha256 = toHex(await crypto.subtle.digest('SHA-256', bytes));
    try {
      const result = await ctx.runMutation(internal.mobileSnapshots.publish, {
        revision: snapshot.revision,
        runId: snapshot.runId,
        publishedAt: new Date(snapshot.publishedAt).toISOString(),
        sha256,
        payloadJson: body,
      });
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return jsonError(409, 'Revision conflict or stale snapshot');
    }
  }),
});

http.route({
  path: '/mobile/snapshot',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!tokenMatches(request, process.env.MOBILE_READ_TOKEN))
      return jsonError(401, 'Unauthorized');
    const current = await ctx.runQuery(internal.mobileSnapshots.readCurrent, {});
    if (!current) return jsonError(404, 'No snapshot published');
    const etag = `"${current.sha256}"`;
    if (request.headers.get('if-none-match') === etag)
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'no-store' },
      });
    return new Response(current.payloadJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ETag: etag,
        'X-Snapshot-SHA256': current.sha256,
      },
    });
  }),
});

export default http;
