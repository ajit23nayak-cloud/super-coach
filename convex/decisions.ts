import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const status = v.union(v.literal('open'), v.literal('made'), v.literal('deferred'))

export const create = mutation({
  args: {
    decision: v.string(),
    status,
    outcome: v.optional(v.string()),
    linkedMood: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const decision = args.decision.trim()
    if (!decision) throw new Error('Decision is required')
    return ctx.db.insert('decisions', {
      createdAt: Date.now(),
      mode: 'Mind',
      decision,
      status: args.status,
      outcome: args.outcome,
      linkedMood: args.linkedMood,
    })
  },
})

export const list = query({
  args: { status: v.optional(status), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 100)
    if (args.status) {
      return ctx.db.query('decisions').withIndex('by_status', q => q.eq('status', args.status!)).order('desc').take(limit)
    }
    return ctx.db.query('decisions').withIndex('by_createdAt').order('desc').take(limit)
  },
})

export const update = mutation({
  args: {
    id: v.id('decisions'),
    status,
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status, outcome: args.outcome })
    return args.id
  },
})
