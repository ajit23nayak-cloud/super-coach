import { describe, expect, it } from 'vitest'
import { normalizeHealthReadings } from '@/lib/health-normalizer'

const row = {
  receivedAt: new Date('2026-07-11T18:37:01Z').getTime(),
  payload: {
    timestamp: '2026-07-11T18:37:00Z',
    heart_rate: [
      { bpm: 73, time: '2026-07-11T15:10:35Z' },
      { bpm: 77, time: '2026-07-11T15:15:35Z' },
    ],
    resting_heart_rate: [
      { bpm: 53, time: '2026-07-10T18:30:00Z' },
    ],
    heart_rate_variability_rmssd: [
      { millis: 42.5, time: '2026-07-11T03:20:00Z' },
    ],
    sleep: [
      { duration_seconds: 720, session_end_time: '2026-07-10T21:43:01Z' },
      { duration_seconds: 1500, session_end_time: '2026-07-10T22:08:01Z' },
      { duration_seconds: 2700, session_end_time: '2026-07-11T03:20:00Z', score: 78 },
    ],
  },
}

describe('normalizeHealthReadings', () => {
  it('extracts the observed HC Webhook array payload', () => {
    const snapshot = normalizeHealthReadings([row])
    expect(snapshot.hr).toEqual({ value: 77, at: '2026-07-11T15:15:35Z' })
    expect(snapshot.rhr).toEqual({ value: 53, at: '2026-07-10T18:30:00Z' })
    expect(snapshot.hrv).toEqual({ value: 42.5, at: '2026-07-11T03:20:00Z' })
    expect(snapshot.sleep).toEqual({
      durationMinutes: 45,
      score: 78,
      at: '2026-07-11T03:20:00Z',
    })
    expect(snapshot.receivedAt).toBe(row.receivedAt)
  })

  it('returns null for missing HRV without inventing a value', () => {
    const withoutHrv = {
      ...row,
      payload: { ...row.payload, heart_rate_variability_rmssd: undefined },
    }
    expect(normalizeHealthReadings([withoutHrv]).hrv).toBeNull()
  })

  it('prefers the complete recent sleep snapshot over a newer partial payload', () => {
    const complete = {
      receivedAt: row.receivedAt,
      payload: {
        sleep: [
          { duration_seconds: 3600, session_end_time: '2026-07-11T01:00:00Z' },
          { duration_seconds: 3600, session_end_time: '2026-07-11T02:00:00Z' },
          { duration_seconds: 3600, session_end_time: '2026-07-11T03:00:00Z', score: 80 },
        ],
      },
    }
    const partial = {
      receivedAt: row.receivedAt + 1000,
      payload: { sleep: [{ duration_seconds: 900, session_end_time: '2026-07-11T03:00:00Z' }] },
    }
    const verification = { receivedAt: row.receivedAt + 2000, payload: { test: true } }
    const snapshot = normalizeHealthReadings([complete, partial, verification])
    expect(snapshot.sleep.durationMinutes).toBe(180)
    expect(snapshot.sleep.score).toBe(80)
    expect(snapshot.receivedAt).toBe(partial.receivedAt)
  })

  it('normalizes HC Webhook heart_rate_variability rmssd_millis', () => {
    const hrvRow = {
      receivedAt: row.receivedAt + 3000,
      payload: {
        heart_rate_variability: [
          { rmssd_millis: 76, time: '2026-07-12T01:59:30Z' },
        ],
      },
    }
    expect(normalizeHealthReadings([hrvRow]).hrv).toEqual({
      value: 76,
      at: '2026-07-12T01:59:30Z',
    })
  })

  it('uses the newest row and safely handles empty input', () => {
    expect(normalizeHealthReadings([])).toEqual({
      hr: null,
      hrv: null,
      rhr: null,
      sleep: { durationMinutes: null, score: null, at: null },
      steps: null,
      receivedAt: null,
    })
    const older = { ...row, receivedAt: row.receivedAt - 1000 }
    const newer = {
      ...row,
      receivedAt: row.receivedAt + 1000,
      payload: { ...row.payload, heart_rate: [{ bpm: 80, time: '2026-07-11T16:00:00Z' }] },
    }
    expect(normalizeHealthReadings([older, newer]).hr?.value).toBe(80)
  })

  it('picks the latest steps interval by end_time and never sums cumulative snapshots', () => {
    const morning = {
      receivedAt: new Date('2026-07-11T10:05:00Z').getTime(),
      payload: {
        steps: [
          { count: 1000, start_time: '2026-07-11T00:00:00Z', end_time: '2026-07-11T10:00:00Z' },
        ],
      },
    }
    const noon = {
      receivedAt: new Date('2026-07-11T12:05:00Z').getTime(),
      payload: {
        steps: [
          { count: 1500, start_time: '2026-07-11T00:00:00Z', end_time: '2026-07-11T12:00:00Z' },
        ],
      },
    }
    const snapshot = normalizeHealthReadings([morning, noon])
    expect(snapshot.steps).toEqual({
      count: 1500,
      start: '2026-07-11T00:00:00Z',
      at: '2026-07-11T12:00:00Z',
    })
  })

  it('picks the current-day steps interval over a prior-day interval in the same payload', () => {
    const combined = {
      receivedAt: new Date('2026-07-11T10:05:00Z').getTime(),
      payload: {
        steps: [
          { count: 7200, start_time: '2026-07-10T00:00:00Z', end_time: '2026-07-10T23:59:59Z' },
          { count: 1200, start_time: '2026-07-11T00:00:00Z', end_time: '2026-07-11T10:00:00Z' },
        ],
      },
    }
    const snapshot = normalizeHealthReadings([combined])
    expect(snapshot.steps?.count).toBe(1200)
    expect(snapshot.steps?.at).toBe('2026-07-11T10:00:00Z')
  })

  it('accepts a steps-only webhook row as usable health data', () => {
    const stepsOnly = {
      receivedAt: new Date('2026-07-11T10:05:00Z').getTime(),
      payload: {
        steps: [
          { count: 4200, start_time: '2026-07-11T00:00:00Z', end_time: '2026-07-11T10:00:00Z' },
        ],
      },
    }
    const snapshot = normalizeHealthReadings([stepsOnly])
    expect(snapshot.receivedAt).toBe(stepsOnly.receivedAt)
    expect(snapshot.steps?.count).toBe(4200)
  })

  it('ignores step intervals with missing or invalid fields', () => {
    const junk = {
      receivedAt: new Date('2026-07-11T10:05:00Z').getTime(),
      payload: {
        steps: [
          { count: 'nope', start_time: '2026-07-11T00:00:00Z', end_time: '2026-07-11T10:00:00Z' },
          { count: 900, start_time: 'not-a-time', end_time: '2026-07-11T09:00:00Z' },
        ],
      },
    }
    expect(normalizeHealthReadings([junk]).steps).toBeNull()
  })
})
