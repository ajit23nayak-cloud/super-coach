import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'

const mode = v.union(
  v.literal('Body'),
  v.literal('Mind'),
  v.literal('Career'),
  v.literal('Super'),
)

const MAX_TEXT_LENGTH = 4000

function requireText(value: string, name: string, max: number): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${name} is required`)
  if (trimmed.length > max) throw new Error(`${name} must be ${max} characters or fewer`)
  return trimmed
}

export const create = internalMutation({
  args: {
    mode,
    text: v.string(),
    sourceRunId: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const row = {
      createdAt: Date.now(),
      mode: args.mode,
      text: requireText(args.text, 'text', MAX_TEXT_LENGTH),
      ...(args.sourceRunId ? { sourceRunId: args.sourceRunId } : {}),
      ...(args.meta === undefined ? {} : { meta: args.meta }),
    }
    return await ctx.db.insert('insights', row)
  },
})

export const list = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 200)
    return await ctx.db
      .query('insights')
      .withIndex('by_createdAt')
      .order('desc')
      .take(limit)
  },
})

export const listByMode = internalQuery({
  args: { mode, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 200)
    return await ctx.db
      .query('insights')
      .withIndex('by_mode_createdAt', q => q.eq('mode', args.mode))
      .order('desc')
      .take(limit)
  },
})

export const clearAll = internalMutation({
  args: {},
  handler: async ctx => {
    let count = 0
    for await (const row of ctx.db.query('insights')) {
      await ctx.db.delete(row._id)
      count += 1
    }
    return count
  },
})
