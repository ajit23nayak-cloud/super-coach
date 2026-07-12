import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Health pipe: Gabit ring -> Health Connect -> HC Webhook -> /health endpoint (http.ts) -> health.record (health.ts).
  healthReadings: defineTable({
    receivedAt: v.number(),
    payload: v.any(),
  }).index("by_receivedAt", ["receivedAt"]),

  // Mind writes; Super and Career read. Powers the "ship and decide" thread across days.
  decisions: defineTable({
    createdAt: v.number(),
    mode: v.string(),
    decision: v.string(),
    status: v.union(v.literal("open"), v.literal("made"), v.literal("deferred")),
    outcome: v.optional(v.string()),
    linkedMood: v.optional(v.string()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status"]),

  // Structured Mind check-ins. Additive to `decisions`; only written after Ajit explicitly selects A or B.
  mindCheckIns: defineTable({
    createdAt: v.number(),
    energy: v.number(),
    positiveEmotion: v.number(),
    stateWord: v.string(),
    activeSelf: v.union(
      v.literal('operator'),
      v.literal('athlete'),
      v.literal('father'),
      v.literal('writer'),
    ),
    shipIntent: v.optional(v.string()),
    hedgedDecision: v.optional(v.string()),
    diagnosis: v.string(),
    choiceA: v.string(),
    choiceB: v.string(),
    selectedChoice: v.union(v.literal('A'), v.literal('B')),
  })
    .index('by_createdAt', ['createdAt'])
    .index('by_activeSelf', ['activeSelf']),

  // Observability: per-sub-agent run log (Body/Mind + Super later).
  agentRuns: defineTable({
    createdAt: v.number(),
    agent: v.string(),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    tokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_agent", ["agent"]),
});
