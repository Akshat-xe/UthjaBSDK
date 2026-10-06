import { v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';

const REQUEST_TTL_MS = 15 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 30 * 1000;

async function expireOldRequests(ctx: MutationCtx, now: number) {
  const requests = await ctx.db.query('mobileSyncRequests').collect();
  for (const request of requests) {
    if (request.expiresAt <= now) {
      await ctx.db.delete(request._id);
    }
  }
}

function publicRequest(request: Doc<'mobileSyncRequests'>) {
  return {
    requestId: request._id,
    state: request.state,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    expiresAt: request.expiresAt,
    ...(request.claimedAt === undefined ? {} : { claimedAt: request.claimedAt }),
  };
}

export const create = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    await expireOldRequests(ctx, now);

    const pending = await ctx.db
      .query('mobileSyncRequests')
      .withIndex('by_state_created_at', (q) => q.eq('state', 'pending'))
      .order('desc')
      .first();
    const running = await ctx.db
      .query('mobileSyncRequests')
      .withIndex('by_state_created_at', (q) => q.eq('state', 'running'))
      .order('desc')
      .first();
    const active = [pending, running]
      .filter((request) => request !== null)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (active) return { request: publicRequest(active), deduplicated: true };

    const latest = await ctx.db
      .query('mobileSyncRequests')
      .withIndex('by_created_at')
      .order('desc')
      .first();
    if (latest && now - latest.createdAt < REQUEST_COOLDOWN_MS) {
      return { error: 'rate_limited', retryAfterMs: REQUEST_COOLDOWN_MS - (now - latest.createdAt) };
    }

    const requestId = await ctx.db.insert('mobileSyncRequests', {
      state: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + REQUEST_TTL_MS,
    });
    return {
      request: {
        requestId,
        state: 'pending',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + REQUEST_TTL_MS,
      },
      deduplicated: false,
    };
  },
});

export const claimNext = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    await expireOldRequests(ctx, now);
    const oldest = await ctx.db
      .query('mobileSyncRequests')
      .withIndex('by_state_created_at', (q) => q.eq('state', 'pending'))
      .first();
    if (!oldest) return null;
    await ctx.db.patch(oldest._id, { state: 'running', claimedAt: now, updatedAt: now });
    return publicRequest({ ...oldest, state: 'running', claimedAt: now, updatedAt: now });
  },
});

export const readStatus = internalMutation({
  args: { requestId: v.id('mobileSyncRequests') },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) return null;
    const now = Date.now();
    if (request.expiresAt <= now && request.state !== 'expired') {
      await ctx.db.patch(requestId, { state: 'expired', updatedAt: now });
      return publicRequest({ ...request, state: 'expired', updatedAt: now });
    }
    return publicRequest(request);
  },
});

export const complete = internalMutation({
  args: {
    requestId: v.id('mobileSyncRequests'),
    state: v.union(v.literal('completed'), v.literal('failed')),
  },
  handler: async (ctx, { requestId, state }) => {
    const request = await ctx.db.get(requestId);
    if (!request) return { error: 'not_found' as const };
    const now = Date.now();
    if (request.expiresAt <= now || request.state === 'expired') {
      if (request.state !== 'expired') {
        await ctx.db.patch(requestId, { state: 'expired', updatedAt: now });
      }
      return { error: 'expired' as const };
    }
    if (request.state !== 'running') return { error: 'not_claimed' as const };
    await ctx.db.patch(requestId, { state, updatedAt: now });
    return { request: publicRequest({ ...request, state, updatedAt: now }) };
  },
});
