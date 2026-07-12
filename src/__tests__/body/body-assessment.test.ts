import { describe, expect, it } from 'vitest'
import { buildBodyAssessment } from '@/lib/body-assessment'
import type { HealthSnapshot } from '@/lib/health-normalizer'

const fullSnapshot: HealthSnapshot = {
  hr: { value: 77, at: '2026-07-11T15:15:00Z' },
  hrv: { value: 42.5, at: '2026-07-11T03:20:00Z' },
  rhr: { value: 53, at: '2026-07-11T04:00:00Z' },
  sleep: { durationMinutes: 420, score: 78, at: '2026-07-11T06:00:00Z' },
  steps: { count: 4200, start: '2026-07-11T00:00:00Z', at: '2026-07-11T10:00:00Z' },
  receivedAt: new Date('2026-07-11T10:05:00Z').getTime(),
}

const emptySnapshot: HealthSnapshot = {
  hr: null,
  hrv: null,
  rhr: null,
  sleep: { durationMinutes: null, score: null, at: null },
  steps: null,
  receivedAt: null,
}

const now = new Date('2026-07-11T12:00:00Z')

describe('buildBodyAssessment', () => {
  it('computes 10k step-goal progress with asOf from the interval end', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    expect(assessment.stepGoal).toEqual({
      goal: 10000,
      current: 4200,
      percentComplete: 42,
      remaining: 5800,
      asOf: '2026-07-11T10:00:00Z',
    })
  })

  it('honors a custom step goal', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now, 8000)
    expect(assessment.stepGoal?.goal).toBe(8000)
    expect(assessment.stepGoal?.percentComplete).toBe(53)
    expect(assessment.stepGoal?.remaining).toBe(3800)
  })

  it('clamps step goal fields when count exceeds the goal', () => {
    const overshoot: HealthSnapshot = {
      ...fullSnapshot,
      steps: { count: 12500, start: '2026-07-11T00:00:00Z', at: '2026-07-11T20:00:00Z' },
    }
    const assessment = buildBodyAssessment(overshoot, now)
    expect(assessment.stepGoal?.percentComplete).toBe(100)
    expect(assessment.stepGoal?.remaining).toBe(0)
    expect(assessment.stepGoal?.current).toBe(12500)
  })

  it('returns null step goal when steps are missing', () => {
    const assessment = buildBodyAssessment(emptySnapshot, now)
    expect(assessment.stepGoal).toBeNull()
  })

  it('emits three non-duplicative recommendations across movement, recovery, and cardiovascular', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    const dimensions = assessment.recommendations.map(r => r.dimension)
    expect(dimensions).toContain('movement')
    expect(dimensions).toContain('recovery')
    expect(dimensions).toContain('cardiovascular')
    expect(new Set(dimensions).size).toBe(dimensions.length)
    expect(assessment.recommendations.length).toBeGreaterThanOrEqual(3)
  })

  it('cites exact step-goal progress in the movement recommendation', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    const movement = assessment.recommendations.find(r => r.dimension === 'movement')
    expect(movement).toBeDefined()
    expect(movement!.evidence).toContain('4200')
    expect(movement!.evidence).toContain('10000')
    expect(movement!.evidence).toContain('42%')
  })

  it('includes a pace implication when steps timestamps are same-day as now', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    const movement = assessment.recommendations.find(r => r.dimension === 'movement')!
    expect(movement.recommendation.toLowerCase()).toMatch(/pace|per hour|hourly/)
  })

  it('omits a pace implication when steps interval is not the current day', () => {
    const yesterday: HealthSnapshot = {
      ...fullSnapshot,
      steps: { count: 4200, start: '2026-07-10T00:00:00Z', at: '2026-07-10T23:00:00Z' },
    }
    const assessment = buildBodyAssessment(yesterday, now)
    const movement = assessment.recommendations.find(r => r.dimension === 'movement')!
    expect(movement.recommendation.toLowerCase()).not.toMatch(/pace|per hour|hourly/)
  })

  it('cites exact sleep duration and end time in the recovery recommendation', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    const recovery = assessment.recommendations.find(r => r.dimension === 'recovery')!
    expect(recovery.evidence).toContain('420')
    expect(recovery.evidence).toContain('2026-07-11T06:00:00Z')
  })

  it('cites HRV and RHR values and refuses good/bad interpretation without a personal baseline', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    const cardio = assessment.recommendations.find(r => r.dimension === 'cardiovascular')!
    expect(cardio.evidence).toContain('42.5')
    expect(cardio.evidence).toContain('53')
    const text = `${cardio.evidence} ${cardio.recommendation}`.toLowerCase()
    expect(text).toContain('baseline')
    expect(text).not.toMatch(/\b(good|bad|healthy|unhealthy|abnormal|poor|excellent)\b/)
  })

  it('replaces cardiovascular with a data-quality recommendation when HRV and RHR are missing', () => {
    const noCardio: HealthSnapshot = {
      ...fullSnapshot,
      hrv: null,
      rhr: null,
    }
    const assessment = buildBodyAssessment(noCardio, now)
    const dimensions = assessment.recommendations.map(r => r.dimension)
    expect(dimensions).not.toContain('cardiovascular')
    expect(dimensions).toContain('data')
    const data = assessment.recommendations.find(r => r.dimension === 'data')!
    expect(data.evidence.toLowerCase()).toMatch(/hrv|rhr|heart/)
    expect(assessment.recommendations.length).toBeGreaterThanOrEqual(3)
  })

  it('every recommendation has dimension, evidence, recommendation, and confidence', () => {
    const assessment = buildBodyAssessment(fullSnapshot, now)
    for (const rec of assessment.recommendations) {
      expect(rec.dimension).toBeTruthy()
      expect(rec.evidence).toBeTruthy()
      expect(rec.recommendation).toBeTruthy()
      expect(['high', 'medium', 'low']).toContain(rec.confidence)
    }
  })

  it('returns a data-quality recommendation on an empty snapshot without inventing metrics', () => {
    const assessment = buildBodyAssessment(emptySnapshot, now)
    expect(assessment.stepGoal).toBeNull()
    const dimensions = assessment.recommendations.map(r => r.dimension)
    expect(dimensions).toContain('data')
  })
})
