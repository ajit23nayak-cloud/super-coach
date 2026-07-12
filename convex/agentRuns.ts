import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'

export const append = internalMutation({
  args: {
    agent: v.string(), input: v.optional(v.any()), output: v.optional(v.any()),
    tokens: v.optional(v.number()), costUsd: v.optional(v.number()),
    latencyMs: v.optional(v.number()), status: v.optional(v.string()), error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.agent.trim() || args.agent.length > 64) throw new Error('Agent must be 1-64 characters')
    return ctx.db.insert('agentRuns', { createdAt: Date.now(), ...args })
  },
})

export const list = internalQuery({
  args: { limit: v.optional(v.number()), agent: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100)
    if (args.agent !== undefined) {
      return ctx.db.query('agentRuns').withIndex('by_agent', q => q.eq('agent', args.agent!)).order('desc').take(limit)
    }
    return ctx.db.query('agentRuns').withIndex('by_createdAt').order('desc').take(limit)
  },
})
