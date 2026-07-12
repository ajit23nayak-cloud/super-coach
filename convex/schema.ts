import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// If you already have a convex/schema.ts with other tables, do NOT replace it.
// Instead, add the healthReadings line below into your existing defineSchema({...}).
export default defineSchema({
  healthReadings: defineTable({
    receivedAt: v.number(),
    payload: v.any(),
  }),
});
