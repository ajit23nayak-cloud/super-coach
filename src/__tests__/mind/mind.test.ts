import { describe, expect, it } from 'vitest'
import { CRISIS_HANDOFF, detectCrisis, validateDecisionInput } from '@/lib/mind'

describe('validateDecisionInput', () => {
  it('accepts a complete decision', () => {
    expect(validateDecisionInput({ decision: 'Submit Super Coach today', status: 'open', linkedMood: 'focused' })).toEqual({
      decision: 'Submit Super Coach today',
      status: 'open',
      linkedMood: 'focused',
    })
  })

  it('rejects empty decisions and invalid status', () => {
    expect(() => validateDecisionInput({ decision: '   ', status: 'open' })).toThrow(/decision/i)
    expect(() => validateDecisionInput({ decision: 'Ship', status: 'unknown' })).toThrow(/status/i)
  })
})

describe('detectCrisis', () => {
  it('returns the exact handoff for explicit self-harm intent', () => {
    expect(detectCrisis('I intend to harm myself tonight')).toBe(CRISIS_HANDOFF)
    expect(CRISIS_HANDOFF).toContain('call 112')
  })

  it('does not classify ordinary stress as a crisis', () => {
    expect(detectCrisis('I am stressed about the buildathon deadline')).toBeNull()
  })
})
