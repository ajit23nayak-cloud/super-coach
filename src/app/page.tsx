import Dashboard from './dashboard'
import {
  getDecisions,
  getHealthRows,
  getMindCheckIns,
  getRuns,
} from '@/lib/convex-data'
import { normalizeHealthReadings } from '@/lib/health-normalizer'
import { buildBodyAssessment } from '@/lib/body-assessment'
import { getCareerBriefing } from '@/lib/career-service'
import type {
  ActiveSelf,
  SelectedChoice,
} from '@/lib/mind'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export type StoredCheckIn = {
  _id?: string
  id?: string
  createdAt?: number
  energy: number
  positiveEmotion: number
  stateWord: string
  activeSelf: ActiveSelf
  shipIntent?: string
  hedgedDecision?: string
  diagnosis: string
  choiceA: string
  choiceB: string
  selectedChoice: SelectedChoice
}

export type Decision = {
  _id: string
  createdAt: number
  decision: string
  status: string
  linkedMood?: string
}

export type AgentRun = {
  _id: string
  agent: string
  createdAt: number
  latencyMs?: number
  status?: string
}

export type InboxItem = {
  messageId: string
  from: string
  subject: string
  date: string
}

export type CalEvent = {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

export type CareerData = {
  inboxItems: InboxItem[]
  events: CalEvent[]
  conflicts: Array<{ a: CalEvent; b: CalEvent }>
}

type EmptyCareer = { inboxItems: []; events: []; conflicts: [] }

const EMPTY_CAREER: EmptyCareer = { inboxItems: [], events: [], conflicts: [] }

export default async function Home() {
  const [rows, decisionsRaw, checkInsRaw, runsRaw, careerRaw] = await Promise.all([
    getHealthRows(20).catch(() => [] as Awaited<ReturnType<typeof getHealthRows>>),
    getDecisions(20).catch(() => [] as unknown[]),
    getMindCheckIns(20).catch(() => [] as unknown[]),
    getRuns(50).catch(() => [] as unknown[]),
    getCareerBriefing().catch(() => EMPTY_CAREER),
  ])

  const snapshot = normalizeHealthReadings(rows)
  const assessment = buildBodyAssessment(snapshot)

  return (
    <Dashboard
      body={{ snapshot, assessment, rows: rows.length }}
      decisions={decisionsRaw as Decision[]}
      checkIns={checkInsRaw as StoredCheckIn[]}
      runs={runsRaw as AgentRun[]}
      career={careerRaw as CareerData}
      fetchedAt={Date.now()}
    />
  )
}
