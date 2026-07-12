import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const append = mutation({
  args: {
    agent: v.string(),
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    tokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentRuns", {
      createdAt: Date.now(),
      ...args,
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    agent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    if (args.agent !== undefined) {
      const agent = args.agent;
      return await ctx.db
        .query("agentRuns")
        .withIndex("by_agent", (q) => q.eq("agent", agent))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
  },
});
