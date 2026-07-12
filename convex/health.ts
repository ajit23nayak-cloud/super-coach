import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

export const record = mutation({
  args: { payload: v.any() },
  handler: async (ctx, args) =>
    ctx.db.insert('healthReadings', { receivedAt: Date.now(), payload: args.payload }),
})

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 200)
    return ctx.db
      .query('healthReadings')
      .withIndex('by_receivedAt')
      .order('desc')
      .take(limit)
  },
})
