import { describe, expect, it, vi } from 'vitest'
import {
  agentRunErrorResponse,
  decisionErrorResponse,
  handleAgentRunRequest,
  handleDecisionRequest,
  parseAgentRunInput,
  parseAgentRunRequestBody,
  parseDecisionInput,
  parseDecisionRequestBody,
} from '../../convex/httpInput'

describe('parseDecisionInput', () => {
  it('accepts a valid decision payload', () => {
    expect(parseDecisionInput({ decision: 'Ship it', status: 'made', outcome: 'deployed', linkedMood: 'focused' })).toEqual({
      decision: 'Ship it',
      status: 'made',
      outcome: 'deployed',
      linkedMood: 'focused',
    })
  })

  it('rejects invalid or empty decision payloads', () => {
    expect(parseDecisionInput(null)).toBeNull()
    expect(parseDecisionInput({ decision: '', status: 'open' })).toBeNull()
    expect(parseDecisionInput({ decision: 'Ship it', status: 'invalid' })).toBeNull()
    expect(parseDecisionInput({ decision: 'Ship it', status: 'open', outcome: 42 })).toBeNull()
  })

  it('rejects decisions longer than the 2000 character mutation invariant', () => {
    expect(parseDecisionInput({ decision: 'a'.repeat(2001), status: 'open' })).toBeNull()
    expect(parseDecisionInput({ decision: 'a'.repeat(2000), status: 'open' })).toEqual({
      decision: 'a'.repeat(2000),
      status: 'open',
    })
  })

  it('rejects arrays and non-object values', () => {
    expect(parseDecisionInput(['x'])).toBeNull()
    expect(parseDecisionInput('nope')).toBeNull()
    expect(parseDecisionInput(42)).toBeNull()
  })
})

describe('parseDecisionRequestBody', () => {
  it('returns ok with the parsed input for a valid JSON body', () => {
    const result = parseDecisionRequestBody('{"decision":"Ship it","status":"open"}')
    expect(result).toEqual({ ok: true, input: { decision: 'Ship it', status: 'open' } })
  })

  it('flags malformed JSON as a 400-worthy error', () => {
    expect(parseDecisionRequestBody('{not json')).toEqual({ ok: false, reason: 'malformed_json' })
    expect(parseDecisionRequestBody('')).toEqual({ ok: false, reason: 'malformed_json' })
  })

  it('flags well-formed JSON with an invalid decision shape as invalid_input', () => {
    expect(parseDecisionRequestBody('{"decision":"","status":"open"}')).toEqual({ ok: false, reason: 'invalid_input' })
    expect(parseDecisionRequestBody('null')).toEqual({ ok: false, reason: 'invalid_input' })
    expect(parseDecisionRequestBody('[]')).toEqual({ ok: false, reason: 'invalid_input' })
    expect(parseDecisionRequestBody(`{"decision":"${'a'.repeat(2001)}","status":"open"}`)).toEqual({
      ok: false,
      reason: 'invalid_input',
    })
  })
})

describe('decisionErrorResponse', () => {
  it('returns 400 with a stable error message for malformed_json', async () => {
    const response = decisionErrorResponse('malformed_json')
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    expect(await response.json()).toEqual({ error: 'Malformed JSON body' })
  })

  it('returns 400 with a stable error message for invalid_input', async () => {
    const response = decisionErrorResponse('invalid_input')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid decision payload' })
  })
})

describe('handleDecisionRequest', () => {
  it('short-circuits malformed JSON with a 400 and never calls the mutation', async () => {
    const runMutation = vi.fn()
    const response = await handleDecisionRequest('{not json', runMutation)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Malformed JSON body' })
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('short-circuits invalid input with a 400 and never calls the mutation', async () => {
    const runMutation = vi.fn()
    const response = await handleDecisionRequest('{"decision":"","status":"open"}', runMutation)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid decision payload' })
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('dispatches the parsed input to the mutation and returns the resulting id', async () => {
    const runMutation = vi.fn().mockResolvedValue('decision_id_123')
    const response = await handleDecisionRequest('{"decision":"Ship it","status":"open"}', runMutation)
    expect(runMutation).toHaveBeenCalledWith({ decision: 'Ship it', status: 'open' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'decision_id_123' })
  })
})

describe('parseAgentRunInput', () => {
  it('accepts a minimal agent-only payload', () => {
    expect(parseAgentRunInput({ agent: 'super' })).toEqual({ agent: 'super' })
  })

  it('accepts a full payload and passes through input/output/scalars', () => {
    expect(parseAgentRunInput({
      agent: 'super',
      input: { prompt: 'hi' },
      output: ['a', 'b'],
      tokens: 12,
      costUsd: 0.001,
      latencyMs: 42,
      status: 'ok',
      error: 'none',
    })).toEqual({
      agent: 'super',
      input: { prompt: 'hi' },
      output: ['a', 'b'],
      tokens: 12,
      costUsd: 0.001,
      latencyMs: 42,
      status: 'ok',
      error: 'none',
    })
  })

  it('rejects non-object, empty, or overly long agent values', () => {
    expect(parseAgentRunInput(null)).toBeNull()
    expect(parseAgentRunInput([])).toBeNull()
    expect(parseAgentRunInput('super')).toBeNull()
    expect(parseAgentRunInput({})).toBeNull()
    expect(parseAgentRunInput({ agent: '' })).toBeNull()
    expect(parseAgentRunInput({ agent: '   ' })).toBeNull()
    expect(parseAgentRunInput({ agent: 'a'.repeat(65) })).toBeNull()
  })

  it('rejects wrong scalar types on optional numeric fields', () => {
    expect(parseAgentRunInput({ agent: 'super', tokens: '5' })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', costUsd: 'free' })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', latencyMs: null })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', tokens: Number.NaN })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', latencyMs: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('rejects wrong types on status and error, and enforces error length', () => {
    expect(parseAgentRunInput({ agent: 'super', status: 5 })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', error: 5 })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', error: 'x'.repeat(2001) })).toBeNull()
  })

  it('rejects input/output payloads larger than the 50000-char JSON invariant', () => {
    const big = 'x'.repeat(50_001)
    expect(parseAgentRunInput({ agent: 'super', input: big })).toBeNull()
    expect(parseAgentRunInput({ agent: 'super', output: big })).toBeNull()
  })

  it('trims agent whitespace while preserving the raw string', () => {
    expect(parseAgentRunInput({ agent: '  super  ' })).toEqual({ agent: 'super' })
  })
})

describe('parseAgentRunRequestBody', () => {
  it('flags malformed JSON', () => {
    expect(parseAgentRunRequestBody('{oops')).toEqual({ ok: false, reason: 'malformed_json' })
  })

  it('flags invalid input', () => {
    expect(parseAgentRunRequestBody('{"agent":""}')).toEqual({ ok: false, reason: 'invalid_input' })
  })

  it('returns the parsed input for a valid body', () => {
    expect(parseAgentRunRequestBody('{"agent":"super","tokens":3}')).toEqual({
      ok: true,
      input: { agent: 'super', tokens: 3 },
    })
  })
})

describe('agentRunErrorResponse', () => {
  it('returns 400 with a stable message for malformed_json', async () => {
    const response = agentRunErrorResponse('malformed_json')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Malformed JSON body' })
  })

  it('returns 400 with a stable message for invalid_input', async () => {
    const response = agentRunErrorResponse('invalid_input')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid agent run payload' })
  })
})

describe('handleAgentRunRequest', () => {
  it('short-circuits malformed JSON without touching the mutation', async () => {
    const runMutation = vi.fn()
    const response = await handleAgentRunRequest('{bad', runMutation)
    expect(response.status).toBe(400)
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('short-circuits invalid input without touching the mutation', async () => {
    const runMutation = vi.fn()
    const response = await handleAgentRunRequest('{"agent":""}', runMutation)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid agent run payload' })
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('dispatches valid input to the mutation and returns the id', async () => {
    const runMutation = vi.fn().mockResolvedValue('run_id_1')
    const response = await handleAgentRunRequest('{"agent":"super","tokens":3}', runMutation)
    expect(runMutation).toHaveBeenCalledWith({ agent: 'super', tokens: 3 })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'run_id_1' })
  })
})
