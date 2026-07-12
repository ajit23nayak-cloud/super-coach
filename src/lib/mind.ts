export const CRISIS_HANDOFF =
  "I'm not the right support for this and I don't want to be. In India: iCall +91-9152987821 (Mon–Sat, 8am–10pm) or Vandrevala Foundation 1860-2662-345 (24/7). If you're in immediate danger, call 112. I'll stay here and I'll wait for you."

export type DecisionStatus = 'open' | 'made' | 'deferred'

export interface DecisionInput {
  decision?: unknown
  status?: unknown
  outcome?: unknown
  linkedMood?: unknown
}

export function validateDecisionInput(input: DecisionInput): {
  decision: string
  status: DecisionStatus
  outcome?: string
  linkedMood?: string
} {
  const decision = typeof input.decision === 'string' ? input.decision.trim() : ''
  if (!decision) throw new Error('Decision is required')
  if (input.status !== 'open' && input.status !== 'made' && input.status !== 'deferred') {
    throw new Error('Status must be open, made, or deferred')
  }
  const result: {
    decision: string
    status: DecisionStatus
    outcome?: string
    linkedMood?: string
  } = { decision, status: input.status }
  if (typeof input.outcome === 'string' && input.outcome.trim()) result.outcome = input.outcome.trim()
  if (typeof input.linkedMood === 'string' && input.linkedMood.trim()) {
    result.linkedMood = input.linkedMood.trim()
  }
  return result
}

const CRISIS_PATTERNS = [
  /\b(?:kill|hurt|harm) myself\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\b(?:end|take) my (?:own )?life\b/i,
  /\bself[- ]harm\b/i,
  /\bimmediate danger\b/i,
]

export function detectCrisis(text: string): string | null {
  return CRISIS_PATTERNS.some(pattern => pattern.test(text)) ? CRISIS_HANDOFF : null
}
