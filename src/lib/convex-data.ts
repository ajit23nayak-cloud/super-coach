import 'server-only'

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!cloud) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  return cloud.replace(/\.convex\.cloud\/?$/, '.convex.site')
}

function dataSecret(): string {
  const secret = process.env.SUPER_COACH_DATA_SECRET
  if (!secret) throw new Error('SUPER_COACH_DATA_SECRET is not configured')
  return secret
}

async function dataFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${siteUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${dataSecret()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}

export async function getHealthRows(limit = 20): Promise<Array<{ receivedAt: number; payload: unknown }>> {
  const response = await dataFetch(`/data/health?limit=${encodeURIComponent(limit)}`)
  if (!response.ok) throw new Error(`Convex health read failed: ${response.status}`)
  return response.json()
}

export async function getDecisions(limit = 20): Promise<unknown[]> {
  const response = await dataFetch(`/data/decisions?limit=${encodeURIComponent(limit)}`)
  if (!response.ok) throw new Error(`Convex decision read failed: ${response.status}`)
  return response.json()
}

export interface AgentRunInput {
  agent: string
  input?: unknown
  output?: unknown
  tokens?: number
  costUsd?: number
  latencyMs?: number
  status?: string
  error?: string
}

export async function getRuns(limit = 50): Promise<unknown[]> {
  const response = await dataFetch(`/data/runs?limit=${encodeURIComponent(limit)}`)
  if (!response.ok) throw new Error(`Convex run read failed: ${response.status}`)
  return response.json()
}

export async function createRun(input: AgentRunInput): Promise<string> {
  const response = await dataFetch('/data/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(`Convex run write failed: ${response.status}`)
  const payload = (await response.json()) as { id: string }
  return payload.id
}

export async function createDecision(input: {
  decision: string
  status: 'open' | 'made' | 'deferred'
  outcome?: string
  linkedMood?: string
}): Promise<string> {
  const response = await dataFetch('/data/decisions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(`Convex decision write failed: ${response.status}`)
  const payload = (await response.json()) as { id: string }
  return payload.id
}
