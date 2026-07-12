export type DecisionInput = {
  decision: string
  status: 'open' | 'made' | 'deferred'
  outcome?: string
  linkedMood?: string
}

export type DecisionRequestBodyResult =
  | { ok: true; input: DecisionInput }
  | { ok: false; reason: 'malformed_json' | 'invalid_input' }

const MAX_DECISION_LENGTH = 2000

export function parseDecisionInput(value: unknown): DecisionInput | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const decision = typeof input.decision === 'string' ? input.decision.trim() : ''
  const status = input.status
  if (!decision || decision.length > MAX_DECISION_LENGTH) return null
  if (status !== 'open' && status !== 'made' && status !== 'deferred') return null
  if (input.outcome !== undefined && typeof input.outcome !== 'string') return null
  if (input.linkedMood !== undefined && typeof input.linkedMood !== 'string') return null

  return {
    decision,
    status,
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    ...(input.linkedMood === undefined ? {} : { linkedMood: input.linkedMood }),
  }
}

export function parseDecisionRequestBody(rawText: string): DecisionRequestBodyResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { ok: false, reason: 'malformed_json' }
  }
  const input = parseDecisionInput(parsed)
  if (!input) return { ok: false, reason: 'invalid_input' }
  return { ok: true, input }
}

const DECISION_ERROR_MESSAGES: Record<'malformed_json' | 'invalid_input', string> = {
  malformed_json: 'Malformed JSON body',
  invalid_input: 'Invalid decision payload',
}

export function decisionErrorResponse(reason: 'malformed_json' | 'invalid_input'): Response {
  return Response.json({ error: DECISION_ERROR_MESSAGES[reason] }, { status: 400 })
}

export type DecisionMutationRunner = (input: DecisionInput) => Promise<unknown>

export async function handleDecisionRequest(
  rawText: string,
  runMutation: DecisionMutationRunner,
): Promise<Response> {
  const parsed = parseDecisionRequestBody(rawText)
  if (!parsed.ok) return decisionErrorResponse(parsed.reason)
  const id = await runMutation(parsed.input)
  return Response.json({ id })
}

export type AgentRunInput = {
  agent: string
  input?: unknown
  output?: unknown
  tokens?: number
  costUsd?: number
  latencyMs?: number
  status?: string
  error?: string
}

export type AgentRunRequestBodyResult =
  | { ok: true; input: AgentRunInput }
  | { ok: false; reason: 'malformed_json' | 'invalid_input' }

const MAX_AGENT_LENGTH = 64
const MAX_ERROR_LENGTH = 2000
const MAX_RUN_PAYLOAD_LENGTH = 50_000

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function serializedWithinLimit(value: unknown): boolean {
  try {
    return JSON.stringify(value).length <= MAX_RUN_PAYLOAD_LENGTH
  } catch {
    return false
  }
}

export function parseAgentRunInput(value: unknown): AgentRunInput | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  if (typeof raw.agent !== 'string') return null
  const agent = raw.agent.trim()
  if (!agent || agent.length > MAX_AGENT_LENGTH) return null

  for (const key of ['tokens', 'costUsd', 'latencyMs'] as const) {
    if (raw[key] !== undefined && !isFiniteNumber(raw[key])) return null
  }
  for (const key of ['status', 'error'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') return null
  }
  if (typeof raw.error === 'string' && raw.error.length > MAX_ERROR_LENGTH) return null
  for (const key of ['input', 'output'] as const) {
    if (raw[key] !== undefined && !serializedWithinLimit(raw[key])) return null
  }

  const result: AgentRunInput = { agent }
  if (raw.input !== undefined) result.input = raw.input
  if (raw.output !== undefined) result.output = raw.output
  if (raw.tokens !== undefined) result.tokens = raw.tokens as number
  if (raw.costUsd !== undefined) result.costUsd = raw.costUsd as number
  if (raw.latencyMs !== undefined) result.latencyMs = raw.latencyMs as number
  if (raw.status !== undefined) result.status = raw.status as string
  if (raw.error !== undefined) result.error = raw.error as string
  return result
}

export function parseAgentRunRequestBody(rawText: string): AgentRunRequestBodyResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { ok: false, reason: 'malformed_json' }
  }
  const input = parseAgentRunInput(parsed)
  if (!input) return { ok: false, reason: 'invalid_input' }
  return { ok: true, input }
}

const AGENT_RUN_ERROR_MESSAGES: Record<'malformed_json' | 'invalid_input', string> = {
  malformed_json: 'Malformed JSON body',
  invalid_input: 'Invalid agent run payload',
}

export function agentRunErrorResponse(reason: 'malformed_json' | 'invalid_input'): Response {
  return Response.json({ error: AGENT_RUN_ERROR_MESSAGES[reason] }, { status: 400 })
}

export type AgentRunMutationRunner = (input: AgentRunInput) => Promise<unknown>

export async function handleAgentRunRequest(
  rawText: string,
  runMutation: AgentRunMutationRunner,
): Promise<Response> {
  const parsed = parseAgentRunRequestBody(rawText)
  if (!parsed.ok) return agentRunErrorResponse(parsed.reason)
  const id = await runMutation(parsed.input)
  return Response.json({ id })
}
