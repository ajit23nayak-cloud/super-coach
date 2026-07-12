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
      durationMinutes: 82,
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

  it('uses the newest row and safely handles empty input', () => {
    expect(normalizeHealthReadings([])).toEqual({
      hr: null,
      hrv: null,
      rhr: null,
      sleep: { durationMinutes: null, score: null, at: null },
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
})
