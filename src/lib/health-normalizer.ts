export interface HealthReadingRow {
  receivedAt: number
  payload: unknown
}

export interface Metric {
  value: number
  at: string | null
}

export interface StepInterval {
  count: number
  start: string
  at: string
}

export interface HealthSnapshot {
  hr: Metric | null
  hrv: Metric | null
  rhr: Metric | null
  sleep: { durationMinutes: number | null; score: number | null; at: string | null }
  steps: StepInterval | null
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

function latestMetric(items: RecordLike[], valueKeys: string[]): Metric | null {
  const candidates = items.flatMap(item => {
    const value = valueKeys.map(key => number(item[key])).find(v => v !== null) ?? null
    const at = time(item.time)
    return value === null ? [] : [{ value, at }]
  })
  return candidates.sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''))[0] ?? null
}

function sleepSnapshot(payload: RecordLike): HealthSnapshot['sleep'] {
  const entries = records(payload, 'sleep')
    .map(item => ({ item, end: time(item.session_end_time), duration: number(item.duration_seconds) }))
    .filter((entry): entry is { item: RecordLike; end: string; duration: number } =>
      entry.end !== null && entry.duration !== null,
    )
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end))

  const latest = entries.at(-1)
  if (!latest) return { durationMinutes: null, score: null, at: null }

  const session = [latest]
  let sessionStart = Date.parse(latest.end) - latest.duration * 1000
  for (let index = entries.length - 2; index >= 0; index -= 1) {
    const candidate = entries[index]
    const candidateEnd = Date.parse(candidate.end)
    const gap = sessionStart - candidateEnd
    if (gap < 0 || gap > 2 * 60 * 60 * 1000) break
    session.push(candidate)
    sessionStart = candidateEnd - candidate.duration * 1000
  }

  const durationSeconds = session.reduce((sum, entry) => sum + entry.duration, 0)
  const score = session.map(entry => number(entry.item.score)).find(value => value !== null) ?? null
  return { durationMinutes: Math.round(durationSeconds / 60), score, at: latest.end }
}

function hasHealthData(payload: RecordLike): boolean {
  return [
    'heart_rate',
    'resting_heart_rate',
    'heart_rate_variability',
    'heart_rate_variability_rmssd',
    'hrv',
    'sleep',
    'steps',
  ].some(key => records(payload, key).length > 0)
}

function latestStepInterval(items: RecordLike[]): StepInterval | null {
  const intervals = items.flatMap(item => {
    const count = number(item.count)
    const start = time(item.start_time)
    const at = time(item.end_time)
    return count === null || start === null || at === null ? [] : [{ count, start, at }]
  })
  return intervals.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null
}

export function normalizeHealthReadings(rows: HealthReadingRow[]): HealthSnapshot {
  const usable = rows
    .map(row => ({ row, payload: object(row.payload) }))
    .filter((entry): entry is { row: HealthReadingRow; payload: RecordLike } =>
      entry.payload !== null && hasHealthData(entry.payload),
    )
  const newest = [...usable].sort((a, b) => b.row.receivedAt - a.row.receivedAt)[0]
  if (!newest) {
    return {
      hr: null,
      hrv: null,
      rhr: null,
      sleep: { durationMinutes: null, score: null, at: null },
      steps: null,
      receivedAt: null,
    }
  }

  const hr = latestMetric(usable.flatMap(entry => records(entry.payload, 'heart_rate')), ['bpm', 'beatsPerMinute'])
  const rhr = latestMetric(usable.flatMap(entry => records(entry.payload, 'resting_heart_rate')), ['bpm', 'beatsPerMinute'])
  const hrv = latestMetric(
    usable.flatMap(entry => [
      ...records(entry.payload, 'heart_rate_variability'),
      ...records(entry.payload, 'heart_rate_variability_rmssd'),
      ...records(entry.payload, 'hrv'),
    ]),
    ['rmssd_millis', 'millis', 'value', 'rmssd', 'heartRateVariabilityMillis'],
  )

  const sleepCandidates = usable
    .map(entry => sleepSnapshot(entry.payload))
    .filter(candidate => candidate.at !== null && candidate.durationMinutes !== null)
  const latestSleepEnd = Math.max(...sleepCandidates.map(candidate => Date.parse(candidate.at!)), -Infinity)
  const sleep = sleepCandidates
    .filter(candidate => Date.parse(candidate.at!) >= latestSleepEnd - 6 * 60 * 60 * 1000)
    .sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))[0]
    ?? { durationMinutes: null, score: null, at: null }

  const steps = latestStepInterval(usable.flatMap(entry => records(entry.payload, 'steps')))

  return { hr, hrv, rhr, sleep, steps, receivedAt: newest.row.receivedAt }
}
