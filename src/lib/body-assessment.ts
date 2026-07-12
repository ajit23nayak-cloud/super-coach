import type { HealthSnapshot } from './health-normalizer'

export type Dimension = 'movement' | 'recovery' | 'cardiovascular' | 'data'
export type Confidence = 'high' | 'medium' | 'low'

export interface Recommendation {
  dimension: Dimension
  evidence: string
  recommendation: string
  confidence: Confidence
}

export interface StepGoal {
  goal: number
  current: number
  percentComplete: number
  remaining: number
  asOf: string
}

export interface BodyAssessment {
  stepGoal: StepGoal | null
  recommendations: Recommendation[]
}

function sameLocalDay(a: string, b: Date): boolean {
  const left = new Date(a)
  if (Number.isNaN(left.getTime())) return false
  return (
    left.getUTCFullYear() === b.getUTCFullYear()
    && left.getUTCMonth() === b.getUTCMonth()
    && left.getUTCDate() === b.getUTCDate()
  )
}

function movementRec(snapshot: HealthSnapshot, goal: number, now: Date): Recommendation | null {
  const steps = snapshot.steps
  if (!steps) return null
  const percent = Math.min(100, Math.round((steps.count / goal) * 100))
  const remaining = Math.max(0, goal - steps.count)
  const evidence = `${steps.count} steps toward ${goal} goal (${percent}%) as of ${steps.at}`

  const currentDay = sameLocalDay(steps.at, now) && sameLocalDay(steps.start, now)
  let recommendation: string
  if (remaining === 0) {
    recommendation = `Step goal met. Keep light movement through the rest of the day.`
  } else if (currentDay) {
    const elapsedMs = Date.parse(steps.at) - Date.parse(steps.start)
    const hoursElapsed = elapsedMs / 3_600_000
    const pace = hoursElapsed > 0 ? Math.round(steps.count / hoursElapsed) : 0
    recommendation = `${remaining} steps left. Current pace is about ${pace} per hour; a 20–30 min walk covers roughly 2000–3000 steps.`
  } else {
    recommendation = `${remaining} steps short of goal on this interval. Plan a walking block today to close the gap.`
  }

  return {
    dimension: 'movement',
    evidence,
    recommendation,
    confidence: 'high',
  }
}

function recoveryRec(snapshot: HealthSnapshot): Recommendation | null {
  const { durationMinutes, at, score } = snapshot.sleep
  if (durationMinutes === null || at === null) return null
  const hours = (durationMinutes / 60).toFixed(1)
  const scorePart = score !== null ? `, score ${score}` : ''
  const evidence = `${durationMinutes} min sleep (${hours}h${scorePart}) ending ${at}`
  const recommendation = durationMinutes < 420
    ? `Sleep is under 7h on this session. Protect an earlier wind-down tonight and skip late caffeine.`
    : `Sleep session logged. Keep consistent wake and wind-down times to protect the next session.`
  return {
    dimension: 'recovery',
    evidence,
    recommendation,
    confidence: 'high',
  }
}

function cardioRec(snapshot: HealthSnapshot): Recommendation | null {
  const hrv = snapshot.hrv
  const rhr = snapshot.rhr
  if (!hrv && !rhr) return null
  const parts: string[] = []
  if (hrv) parts.push(`HRV ${hrv.value} ms at ${hrv.at ?? 'unknown time'}`)
  if (rhr) parts.push(`RHR ${rhr.value} bpm at ${rhr.at ?? 'unknown time'}`)
  const evidence = `${parts.join('; ')} — no personal baseline stored yet`
  const recommendation = `Log a few more days to build a personal baseline before interpreting these numbers; single readings are context, not a verdict.`
  return {
    dimension: 'cardiovascular',
    evidence,
    recommendation,
    confidence: 'medium',
  }
}

function dataQualityRec(snapshot: HealthSnapshot): Recommendation {
  const missing: string[] = []
  if (!snapshot.hrv) missing.push('HRV')
  if (!snapshot.rhr) missing.push('RHR')
  if (!snapshot.steps) missing.push('steps')
  if (snapshot.sleep.durationMinutes === null) missing.push('sleep')
  if (missing.length === 0) missing.push('recent readings')
  const evidence = `Missing signals in the latest webhook payload: ${missing.join(', ')}`
  const recommendation = `Confirm the Gabit ring is syncing to Health Connect and the webhook has fired today so cardiovascular and movement context is available.`
  return {
    dimension: 'data',
    evidence,
    recommendation,
    confidence: 'low',
  }
}

export function buildBodyAssessment(
  snapshot: HealthSnapshot,
  now: Date = new Date(),
  stepGoal = 10000,
): BodyAssessment {
  const goal = Math.max(1, Math.trunc(stepGoal))
  const stepGoalSummary: StepGoal | null = snapshot.steps
    ? {
        goal,
        current: snapshot.steps.count,
        percentComplete: Math.min(100, Math.round((snapshot.steps.count / goal) * 100)),
        remaining: Math.max(0, goal - snapshot.steps.count),
        asOf: snapshot.steps.at,
      }
    : null

  const recommendations: Recommendation[] = []
  const movement = movementRec(snapshot, goal, now)
  if (movement) recommendations.push(movement)
  const recovery = recoveryRec(snapshot)
  if (recovery) recommendations.push(recovery)
  const cardio = cardioRec(snapshot)
  if (cardio) {
    recommendations.push(cardio)
  } else {
    recommendations.push(dataQualityRec(snapshot))
  }

  if (!movement || !recovery) {
    const already = new Set(recommendations.map(r => r.dimension))
    if (!already.has('data')) recommendations.push(dataQualityRec(snapshot))
  }

  return { stepGoal: stepGoalSummary, recommendations }
}
