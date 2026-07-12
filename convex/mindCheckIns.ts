import { internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'

const activeSelf = v.union(
  v.literal('operator'),
  v.literal('athlete'),
  v.literal('father'),
  v.literal('writer'),
)
const selectedChoice = v.union(v.literal('A'), v.literal('B'))

function requireScore(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${name} must be an integer from 1 to 5`)
  }
  return value
}

function requireText(value: string, name: string, max: number): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${name} is required`)
  if (trimmed.length > max) throw new Error(`${name} must be ${max} characters or fewer`)
  return trimmed
}

function optionalText(value: string | undefined, name: string, max: number): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) throw new Error(`${name} must be ${max} characters or fewer`)
  return trimmed
}

export const create = internalMutation({
  args: {
    energy: v.number(),
    positiveEmotion: v.number(),
    stateWord: v.string(),
    activeSelf,
    shipIntent: v.optional(v.string()),
    hedgedDecision: v.optional(v.string()),
    diagnosis: v.string(),
    choiceA: v.string(),
    choiceB: v.string(),
    selectedChoice,
  },
  handler: async (ctx, args) => {
    const row: {
      createdAt: number
      energy: number
      positiveEmotion: number
      stateWord: string
      activeSelf: 'operator' | 'athlete' | 'father' | 'writer'
      shipIntent?: string
      hedgedDecision?: string
      diagnosis: string
      choiceA: string
      choiceB: string
      selectedChoice: 'A' | 'B'
    } = {
      createdAt: Date.now(),
      energy: requireScore(args.energy, 'energy'),
      positiveEmotion: requireScore(args.positiveEmotion, 'positiveEmotion'),
      stateWord: requireText(args.stateWord, 'stateWord', 500),
      activeSelf: args.activeSelf,
      diagnosis: requireText(args.diagnosis, 'diagnosis', 2000),
      choiceA: requireText(args.choiceA, 'choiceA', 2000),
      choiceB: requireText(args.choiceB, 'choiceB', 2000),
      selectedChoice: args.selectedChoice,
    }
    const shipIntent = optionalText(args.shipIntent, 'shipIntent', 500)
    if (shipIntent) row.shipIntent = shipIntent
    const hedgedDecision = optionalText(args.hedgedDecision, 'hedgedDecision', 500)
    if (hedgedDecision) row.hedgedDecision = hedgedDecision
    return ctx.db.insert('mindCheckIns', row)
  },
})

export const list = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 100)
    return ctx.db.query('mindCheckIns').withIndex('by_createdAt').order('desc').take(limit)
  },
})

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0
    for (const row of await ctx.db.query('mindCheckIns').collect()) {
      await ctx.db.delete(row._id)
      cleared += 1
    }
    return cleared
  },
})
