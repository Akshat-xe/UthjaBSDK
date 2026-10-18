import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  mobileSnapshots: defineTable({
    revision: v.string(),
    runId: v.string(),
    publishedAt: v.string(),
    sha256: v.string(),
    payloadJson: v.string(),
  }).index('by_revision', ['revision']),
  mobileHeads: defineTable({
    key: v.string(),
    revision: v.string(),
  }).index('by_key', ['key']),
  mobileSyncRequests: defineTable({
    state: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('expired'),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
  })
    .index('by_created_at', ['createdAt'])
    .index('by_state_created_at', ['state', 'createdAt']),
  // Single private owner. A future multi-user version needs authenticated owner IDs.
  phoneActionStates: defineTable({
    ownerKey: v.string(),
    revision: v.number(),
    payloadJson: v.string(),
    updatedAt: v.number(),
  }).index('by_owner', ['ownerKey']),
  phoneActionMutations: defineTable({
    ownerKey: v.string(),
    mutationId: v.string(),
    expectedRevision: v.union(v.number(), v.null()),
    payloadSha256: v.string(),
    revision: v.number(),
  }).index('by_owner_mutation', ['ownerKey', 'mutationId']),
  // Independent, public-source feed. Never stores academic/private snapshots or Copilot output.
  publicRadarFeeds: defineTable({
    key: v.string(),
    fetchedAt: v.string(),
    payloadJson: v.string(),
  }).index('by_key', ['key']),
});
