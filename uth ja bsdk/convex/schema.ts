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
});
