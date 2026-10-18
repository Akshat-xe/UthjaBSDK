import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { parseUnstopPage } from './radarUnstop';

const MAX_RESPONSE_BYTES = 600_000;
const MAX_PAGES = 2;

async function fetchPage(page: number): Promise<unknown> {
  const url = `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&page=${page}&per_page=20`;
  const response = await fetch(url, {
    redirect: 'manual', signal: AbortSignal.timeout(12_000),
    headers: { Accept: 'application/json', 'User-Agent': 'UthJaBSDK-Radar/1.0' },
  });
  if (!response.ok || response.status >= 300 ||
    !response.headers.get('content-type')?.includes('application/json'))
    throw new Error(`Unstop listing unavailable: HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES)
    throw new Error('Unstop listing response exceeds size limit');
  if (!response.body) throw new Error('Unstop listing response is empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Unstop listing response exceeds size limit');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = [];
    for (let page = 1; page <= MAX_PAGES; page++)
      rows.push(...parseUnstopPage(await fetchPage(page), now));
    // Empty results are likely a source/schema failure; retain the previous good feed.
    if (!rows.length) throw new Error('Unstop returned no open listings');
    const opportunities = [...new Map(rows.map((row) => [row.id, row])).values()].slice(0, 50);
    const fetchedAt = new Date(now).toISOString();
    const payloadJson = JSON.stringify({ schemaVersion: 1, source: 'unstop', fetchedAt, opportunities });
    if (new TextEncoder().encode(payloadJson).byteLength > 200_000)
      throw new Error('Projected Radar feed exceeds size limit');
    await ctx.runMutation(internal.radarCloud.save, { fetchedAt, payloadJson });
    return { fetchedAt, count: opportunities.length };
  },
});

export const save = internalMutation({
  args: { fetchedAt: v.string(), payloadJson: v.string() },
  handler: async (ctx, input) => {
    const current = await ctx.db.query('publicRadarFeeds')
      .withIndex('by_key', (q) => q.eq('key', 'unstop')).unique();
    if (current) {
      if (current.fetchedAt >= input.fetchedAt) return;
      await ctx.db.patch(current._id, input);
    } else await ctx.db.insert('publicRadarFeeds', { key: 'unstop', ...input });
  },
});

export const readCurrent = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query('publicRadarFeeds')
    .withIndex('by_key', (q) => q.eq('key', 'unstop')).unique(),
});
