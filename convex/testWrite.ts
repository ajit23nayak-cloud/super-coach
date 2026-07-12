import { mutation } from './_generated/server'
import { v } from 'convex/values'

export const insert = mutation({
  args: { message: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert('testPings', {
      message: args.message,
      timestamp: Date.now(),
    })
  },
})
