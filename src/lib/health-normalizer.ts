export interface HealthReadingRow {
  receivedAt: number
  payload: unknown
}

export interface Metric {
  value: number
  at: string | null
}

export interface HealthSnapshot {
  hr: Metric | null
  hrv: Metric | null
  rhr: Metric | null
  sleep: { durationMinutes: number | null; score: number | null; at: string | null }
  receivedAt: number | null
}

type RecordLike = Record<string, unknown>

function object(value: unknown): RecordLike | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : null
}

function records(payload: RecordLike, key: string): RecordLike[] {
  const value = payload[key]
  return Array.isArray(value) ? value.map(object).filter((v): v is RecordLike => v !== null) : []
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function time(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

function latestMetric(
  items: RecordLike[],
  valueKeys: string[],
  timeKeys: string[],
): Metric | null {
  const candidates = items.flatMap(item => {
    const value = valueKeys.map(key => number(item[key])).find(v => v !== null) ?? null
    const at = timeKeys.map(key => time(item[key])).find(v => v !== null) ?? null
    return value === null ? [] : [{ value, at }]
  })
  return candidates.sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''))[0] ?? null
}

export function normalizeHealthReadings(rows: HealthReadingRow[]): HealthSnapshot {
  const newest = [...rows].sort((a, b) => b.receivedAt - a.receivedAt)[0]
  if (!newest) {
    return {
      hr: null,
      hrv: null,
      rhr: null,
      sleep: { durationMinutes: null, score: null, at: null },
      receivedAt: null,
    }
  }

  const payload = object(newest.payload) ?? {}
  const hr = latestMetric(records(payload, 'heart_rate'), ['bpm', 'beatsPerMinute'], ['time'])
  const rhr = latestMetric(
    records(payload, 'resting_heart_rate'),
    ['bpm', 'beatsPerMinute'],
    ['time'],
  )
  const hrvItems = [
    ...records(payload, 'heart_rate_variability_rmssd'),
    ...records(payload, 'hrv'),
  ]
  const hrv = latestMetric(
    hrvItems,
    ['millis', 'value', 'rmssd', 'heartRateVariabilityMillis'],
    ['time'],
  )

  const sleepItems = records(payload, 'sleep')
  const durationSeconds = sleepItems
    .map(item => number(item.duration_seconds))
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0)
  const latestSleep = [...sleepItems].sort(
    (a, b) => Date.parse(time(b.session_end_time) ?? '') - Date.parse(time(a.session_end_time) ?? ''),
  )[0]

  return {
    hr,
    hrv,
    rhr,
    sleep: {
      durationMinutes: durationSeconds > 0 ? Math.round(durationSeconds / 60) : null,
      score: latestSleep ? number(latestSleep.score) : null,
      at: latestSleep ? time(latestSleep.session_end_time) : null,
    },
    receivedAt: newest.receivedAt,
  }
}
