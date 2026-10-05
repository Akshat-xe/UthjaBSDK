import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const publish = internalMutation({
  args: {
    revision: v.string(),
    runId: v.string(),
    publishedAt: v.string(),
    sha256: v.string(),
    payloadJson: v.string(),
  },
  handler: async (ctx, input) => {
    const head = await ctx.db
      .query('mobileHeads')
      .withIndex('by_key', (q) => q.eq('key', 'primary'))
      .unique();
    const previous = await ctx.db
      .query('mobileSnapshots')
      .withIndex('by_revision', (q) => q.eq('revision', input.revision))
      .unique();
    if (previous) {
      if (previous.sha256 !== input.sha256 || previous.runId !== input.runId) {
        throw new Error('Revision conflict');
      }
      if (head?.revision !== previous.revision) throw new Error('Snapshot is not current');
      for (const old of await ctx.db.query('mobileSnapshots').collect()) {
        if (old._id !== previous._id) await ctx.db.delete(old._id);
      }
      return { revision: previous.revision, sha256: previous.sha256, reused: true };
    }
    if (head) {
      const current = await ctx.db
        .query('mobileSnapshots')
        .withIndex('by_revision', (q) => q.eq('revision', head.revision))
        .unique();
      if (current && current.publishedAt >= input.publishedAt) {
        throw new Error('Snapshot is older than the current revision');
      }
    }

    const currentId = await ctx.db.insert('mobileSnapshots', input);
    if (head) await ctx.db.patch(head._id, { revision: input.revision });
    else await ctx.db.insert('mobileHeads', { key: 'primary', revision: input.revision });
    for (const old of await ctx.db.query('mobileSnapshots').collect()) {
      if (old._id !== currentId) await ctx.db.delete(old._id);
    }
    return { revision: input.revision, sha256: input.sha256, reused: false };
  },
});

export const readCurrent = internalQuery({
  args: {},
  handler: async (ctx) => {
    const head = await ctx.db
      .query('mobileHeads')
      .withIndex('by_key', (q) => q.eq('key', 'primary'))
      .unique();
    if (!head) return null;
    return ctx.db
      .query('mobileSnapshots')
      .withIndex('by_revision', (q) => q.eq('revision', head.revision))
      .unique();
  },
});

export const auditSnapshotCount = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query('mobileSnapshots').collect()).length,
});
