import { describe, expect, it } from 'vitest'
import {
  CRISIS_HANDOFF,
  detectCrisis,
  diagnoseMindCheckIn,
  validateDecisionInput,
  validateMindCheckIn,
} from '@/lib/mind'

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

describe('validateMindCheckIn', () => {
  it('accepts a complete check-in with all optional text fields', () => {
    expect(
      validateMindCheckIn({
        energy: 2,
        positiveEmotion: 2,
        stateWord: 'tired',
        activeSelf: 'operator',
        shipIntent: 'Close Telegram bugs',
        hedgedDecision: 'Whether to continue Cloudflare',
      }),
    ).toMatchObject({ energy: 2, positiveEmotion: 2 })
  })

  it('rejects energy outside 1-5 or non-integer', () => {
    for (const value of [0, 6, 1.5, '3']) {
      expect(() =>
        validateMindCheckIn({
          energy: value,
          positiveEmotion: 3,
          stateWord: 'steady',
          activeSelf: 'operator',
        }),
      ).toThrow(/energy/i)
    }
  })

  it('rejects positiveEmotion outside 1-5 or non-integer', () => {
    for (const value of [0, 6, 2.5, '4']) {
      expect(() =>
        validateMindCheckIn({
          energy: 3,
          positiveEmotion: value,
          stateWord: 'steady',
          activeSelf: 'operator',
        }),
      ).toThrow(/positive/i)
    }
  })

  it('accepts each allowed activeSelf identity', () => {
    for (const identity of ['operator', 'athlete', 'father', 'writer'] as const) {
      expect(
        validateMindCheckIn({
          energy: 3,
          positiveEmotion: 3,
          stateWord: 'steady',
          activeSelf: identity,
        }).activeSelf,
      ).toBe(identity)
    }
  })

  it('rejects any activeSelf outside the allowed identities', () => {
    for (const value of ['manager', '', null, undefined, 'Operator']) {
      expect(() =>
        validateMindCheckIn({
          energy: 3,
          positiveEmotion: 3,
          stateWord: 'steady',
          activeSelf: value,
        }),
      ).toThrow(/activeSelf/i)
    }
  })

  it('trims optional text fields and drops them when empty', () => {
    const result = validateMindCheckIn({
      energy: 3,
      positiveEmotion: 3,
      stateWord: '  steady  ',
      activeSelf: 'operator',
      shipIntent: '  Close Telegram bugs  ',
      hedgedDecision: '   ',
    })
    expect(result.stateWord).toBe('steady')
    expect(result.shipIntent).toBe('Close Telegram bugs')
    expect(result).not.toHaveProperty('hedgedDecision')
  })

  it('rejects text fields longer than 500 characters', () => {
    const long = 'x'.repeat(501)
    expect(() =>
      validateMindCheckIn({
        energy: 3,
        positiveEmotion: 3,
        stateWord: long,
        activeSelf: 'operator',
      }),
    ).toThrow(/stateWord/i)
    expect(() =>
      validateMindCheckIn({
        energy: 3,
        positiveEmotion: 3,
        stateWord: 'steady',
        activeSelf: 'operator',
        shipIntent: long,
      }),
    ).toThrow(/shipIntent/i)
    expect(() =>
      validateMindCheckIn({
        energy: 3,
        positiveEmotion: 3,
        stateWord: 'steady',
        activeSelf: 'operator',
        hedgedDecision: long,
      }),
    ).toThrow(/hedgedDecision/i)
  })

  it('requires stateWord as a non-empty string', () => {
    for (const value of ['', '   ', null, undefined, 7]) {
      expect(() =>
        validateMindCheckIn({
          energy: 3,
          positiveEmotion: 3,
          stateWord: value,
          activeSelf: 'operator',
        }),
      ).toThrow(/stateWord/i)
    }
  })

  it('accepts selectedChoice A or B and drops when omitted', () => {
    const base = {
      energy: 3,
      positiveEmotion: 3,
      stateWord: 'steady',
      activeSelf: 'operator' as const,
    }
    expect(validateMindCheckIn({ ...base, selectedChoice: 'A' }).selectedChoice).toBe('A')
    expect(validateMindCheckIn({ ...base, selectedChoice: 'B' }).selectedChoice).toBe('B')
    expect(validateMindCheckIn(base)).not.toHaveProperty('selectedChoice')
  })

  it('rejects any selectedChoice other than A or B', () => {
    for (const value of ['a', 'C', '', 1, true]) {
      expect(() =>
        validateMindCheckIn({
          energy: 3,
          positiveEmotion: 3,
          stateWord: 'steady',
          activeSelf: 'operator',
          selectedChoice: value,
        }),
      ).toThrow(/selectedChoice/i)
    }
  })
})

describe('diagnoseMindCheckIn', () => {
  const patterns = [
    { name: 'low/low', energy: 2, positiveEmotion: 2 },
    { name: 'low-energy/high-positive', energy: 2, positiveEmotion: 4 },
    { name: 'high-energy/low-positive', energy: 4, positiveEmotion: 2 },
    { name: 'high/high', energy: 4, positiveEmotion: 4 },
  ] as const

  it.each(patterns)('$name frame is non-clinical with exactly two A/B choices and a question', ({ energy, positiveEmotion }) => {
    const frame = diagnoseMindCheckIn(
      validateMindCheckIn({
        energy,
        positiveEmotion,
        stateWord: 'steady',
        activeSelf: 'operator',
        shipIntent: 'Close Telegram bugs',
        hedgedDecision: 'Whether to continue Cloudflare',
      }),
    )
    expect(frame.choices).toHaveLength(2)
    expect(frame.choices.map(choice => choice.id)).toEqual(['A', 'B'])
    for (const choice of frame.choices) {
      expect(choice.label).toBeTruthy()
      expect(choice.tradeoff).toBeTruthy()
    }
    expect(frame.question).toMatch(/\?$/)
    expect(frame.question).toMatch(/A or B/)
    const body = `${frame.diagnosis} ${frame.choices[0].label} ${frame.choices[0].tradeoff} ${frame.choices[1].label} ${frame.choices[1].tradeoff}`
    expect(body).not.toMatch(/\bmust\b|\byou should\b|\bstop for today\b/i)
    expect(frame.diagnosis.toLowerCase()).not.toMatch(/depression|anxiety disorder|burnout|recovery readiness/)
  })

  it('low/low frames a scope reduction against a short reset', () => {
    const frame = diagnoseMindCheckIn(
      validateMindCheckIn({
        energy: 1,
        positiveEmotion: 2,
        stateWord: 'depleted',
        activeSelf: 'operator',
        shipIntent: 'Close Telegram bugs',
      }),
    )
    expect(frame.choices[0].label.toLowerCase()).toMatch(/scope|smallest|slice/)
    expect(frame.choices[1].label.toLowerCase()).toMatch(/reset|sleep|walk|recover/)
  })

  it('is deterministic for identical inputs', () => {
    const input = validateMindCheckIn({
      energy: 3,
      positiveEmotion: 3,
      stateWord: 'steady',
      activeSelf: 'operator',
    })
    expect(diagnoseMindCheckIn(input)).toEqual(diagnoseMindCheckIn(input))
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
