import { describe, expect, it } from 'vitest'
import { parseMindCheckInPersistence } from '@/lib/mind'

describe('parseMindCheckInPersistence', () => {
  const validRow = {
    energy: 3,
    positiveEmotion: 4,
    stateWord: 'steady',
    activeSelf: 'operator',
    shipIntent: 'Close Telegram bugs',
    hedgedDecision: 'Whether to continue Cloudflare',
    selectedChoice: 'A',
    diagnosis: 'plain-language diagnosis',
    choiceA: 'first option label with tradeoff',
    choiceB: 'second option label with tradeoff',
  }

  it('accepts a fully populated persistence payload', () => {
    const parsed = parseMindCheckInPersistence(validRow)
    expect(parsed.energy).toBe(3)
    expect(parsed.positiveEmotion).toBe(4)
    expect(parsed.selectedChoice).toBe('A')
    expect(parsed.diagnosis).toBe('plain-language diagnosis')
    expect(parsed.choiceA).toBe('first option label with tradeoff')
    expect(parsed.choiceB).toBe('second option label with tradeoff')
  })

  it('rejects scores outside 1-5', () => {
    for (const value of [0, 6, 1.5, '3', null]) {
      expect(() => parseMindCheckInPersistence({ ...validRow, energy: value })).toThrow(/energy/i)
      expect(() => parseMindCheckInPersistence({ ...validRow, positiveEmotion: value })).toThrow(/positive/i)
    }
  })

  it('requires selectedChoice to be exactly A or B', () => {
    expect(() => parseMindCheckInPersistence({ ...validRow, selectedChoice: undefined })).toThrow(/selectedChoice/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, selectedChoice: 'C' })).toThrow(/selectedChoice/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, selectedChoice: 'a' })).toThrow(/selectedChoice/i)
  })

  it('rejects invalid identity', () => {
    for (const value of ['manager', 'Operator', '', null]) {
      expect(() => parseMindCheckInPersistence({ ...validRow, activeSelf: value })).toThrow(/activeSelf/i)
    }
  })

  it('rejects oversized text fields', () => {
    const long = 'x'.repeat(501)
    expect(() => parseMindCheckInPersistence({ ...validRow, stateWord: long })).toThrow(/stateWord/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, shipIntent: long })).toThrow(/shipIntent/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, hedgedDecision: long })).toThrow(/hedgedDecision/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, diagnosis: long.repeat(5) })).toThrow(/diagnosis/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, choiceA: long.repeat(5) })).toThrow(/choiceA/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, choiceB: long.repeat(5) })).toThrow(/choiceB/i)
  })

  it('drops optional fields when empty rather than persisting empty strings', () => {
    const parsed = parseMindCheckInPersistence({
      ...validRow,
      shipIntent: '   ',
      hedgedDecision: undefined,
    })
    expect(parsed).not.toHaveProperty('shipIntent')
    expect(parsed).not.toHaveProperty('hedgedDecision')
  })

  it('requires diagnosis, choiceA, and choiceB', () => {
    expect(() => parseMindCheckInPersistence({ ...validRow, diagnosis: '' })).toThrow(/diagnosis/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, choiceA: '   ' })).toThrow(/choiceA/i)
    expect(() => parseMindCheckInPersistence({ ...validRow, choiceB: undefined })).toThrow(/choiceB/i)
  })
})
