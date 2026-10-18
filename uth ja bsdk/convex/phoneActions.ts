import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { MAX_ACTION_BODY_BYTES, validPhoneActionState } from './phoneActionValidation';

const OWNER_KEY = 'primary';

export const readCurrent = internalQuery({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query('phoneActionStates')
      .withIndex('by_owner', (q) => q.eq('ownerKey', OWNER_KEY)).unique();
    return state ? { revision: state.revision, payloadJson: state.payloadJson } : null;
  },
});

export const put = internalMutation({
  args: {
    expectedRevision: v.union(v.number(), v.null()),
    mutationId: v.string(),
    payloadJson: v.string(),
    payloadSha256: v.string(),
  },
  handler: async (ctx, input) => {
    if ((input.expectedRevision !== null &&
      (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)) ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(input.mutationId) ||
      !/^[a-f0-9]{64}$/.test(input.payloadSha256) ||
      new TextEncoder().encode(input.payloadJson).byteLength > MAX_ACTION_BODY_BYTES) {
      return { error: 'invalid_action_state' as const };
    }
    let payload: unknown;
    try { payload = JSON.parse(input.payloadJson); } catch { return { error: 'invalid_action_state' as const }; }
    if (!validPhoneActionState(payload)) return { error: 'invalid_action_state' as const };

    const earlier = await ctx.db.query('phoneActionMutations')
      .withIndex('by_owner_mutation', (q) => q.eq('ownerKey', OWNER_KEY)
        .eq('mutationId', input.mutationId)).unique();
    if (earlier) {
      if (earlier.payloadSha256 !== input.payloadSha256 ||
          earlier.expectedRevision !== input.expectedRevision) {
        return { error: 'mutation_id_conflict' as const };
      }
      return { revision: earlier.revision, mutationId: input.mutationId, reused: true };
    }

    const current = await ctx.db.query('phoneActionStates')
      .withIndex('by_owner', (q) => q.eq('ownerKey', OWNER_KEY)).unique();
    if ((current?.revision ?? null) !== input.expectedRevision) {
      return { error: 'revision_conflict' as const, revision: current?.revision ?? null };
    }
    const revision = (current?.revision ?? 0) + 1;
    if (current) {
      await ctx.db.patch(current._id, { revision, payloadJson: input.payloadJson, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('phoneActionStates', {
        ownerKey: OWNER_KEY, revision, payloadJson: input.payloadJson, updatedAt: Date.now(),
      });
    }
    await ctx.db.insert('phoneActionMutations', {
      ownerKey: OWNER_KEY, mutationId: input.mutationId,
      expectedRevision: input.expectedRevision, payloadSha256: input.payloadSha256, revision,
    });
    return { revision, mutationId: input.mutationId, reused: false };
  },
});
