import { describe, expect, it } from 'vitest'
import {
  isDiagnoseReady,
  buildDiagnosePayload,
  buildSelectionPayload,
  type MindFormState,
} from '@/lib/mind-form'

const filled: MindFormState = {
  energy: 3,
  positiveEmotion: 4,
  stateWord: 'steady',
  activeSelf: 'operator',
  shipIntent: 'Close Telegram bugs',
  hedgedDecision: 'Whether to continue Cloudflare',
}

describe('isDiagnoseReady', () => {
  it('is true only when every required slot is filled', () => {
    expect(isDiagnoseReady(filled)).toBe(true)
  })

  it('is false when energy is null', () => {
    expect(isDiagnoseReady({ ...filled, energy: null })).toBe(false)
  })

  it('is false when positiveEmotion is null', () => {
    expect(isDiagnoseReady({ ...filled, positiveEmotion: null })).toBe(false)
  })

  it('is false when stateWord is blank or whitespace only', () => {
    expect(isDiagnoseReady({ ...filled, stateWord: '' })).toBe(false)
    expect(isDiagnoseReady({ ...filled, stateWord: '   ' })).toBe(false)
  })

  it('is false when activeSelf is not chosen', () => {
    expect(isDiagnoseReady({ ...filled, activeSelf: null })).toBe(false)
  })

  it('is false when shipIntent is blank', () => {
    expect(isDiagnoseReady({ ...filled, shipIntent: '   ' })).toBe(false)
  })

  it('is false when hedgedDecision is blank', () => {
    expect(isDiagnoseReady({ ...filled, hedgedDecision: '' })).toBe(false)
  })

  it('rejects energy outside 1-5 or non-integer', () => {
    expect(isDiagnoseReady({ ...filled, energy: 0 })).toBe(false)
    expect(isDiagnoseReady({ ...filled, energy: 6 })).toBe(false)
    expect(isDiagnoseReady({ ...filled, energy: 2.5 })).toBe(false)
  })
})

describe('buildDiagnosePayload', () => {
  it('trims text and never sends selectedChoice', () => {
    const payload = buildDiagnosePayload({
      ...filled,
      stateWord: '  steady  ',
      shipIntent: '  Close Telegram bugs  ',
      hedgedDecision: '  Whether to continue Cloudflare  ',
    })
    expect(payload).toEqual({
      energy: 3,
      positiveEmotion: 4,
      stateWord: 'steady',
      activeSelf: 'operator',
      shipIntent: 'Close Telegram bugs',
      hedgedDecision: 'Whether to continue Cloudflare',
    })
    expect(payload).not.toHaveProperty('selectedChoice')
  })

  it('throws when the form is not ready', () => {
    expect(() => buildDiagnosePayload({ ...filled, energy: null })).toThrow(/complete/i)
  })
})

describe('buildSelectionPayload', () => {
  it('reuses the same server inputs and appends selectedChoice', () => {
    const payload = buildSelectionPayload(filled, 'A')
    expect(payload).toEqual({
      energy: 3,
      positiveEmotion: 4,
      stateWord: 'steady',
      activeSelf: 'operator',
      shipIntent: 'Close Telegram bugs',
      hedgedDecision: 'Whether to continue Cloudflare',
      selectedChoice: 'A',
    })
  })

  it('supports selectedChoice B', () => {
    expect(buildSelectionPayload(filled, 'B').selectedChoice).toBe('B')
  })

  it('rejects any selectedChoice other than A or B', () => {
    // @ts-expect-error deliberately wrong to prove runtime guard
    expect(() => buildSelectionPayload(filled, 'C')).toThrow(/A or B/i)
  })

  it('throws when the form is not complete', () => {
    expect(() => buildSelectionPayload({ ...filled, stateWord: '' }, 'A')).toThrow(/complete/i)
  })
})
