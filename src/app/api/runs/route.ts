import { authorizeApiRequest } from '@/lib/api-auth'
import { createRun, getRuns, type AgentRunInput } from '@/lib/convex-data'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized
  try {
    return Response.json({ runs: await getRuns(50) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized
  try {
    const input = (await request.json()) as AgentRunInput
    if (!input.agent || typeof input.agent !== 'string') {
      return Response.json({ error: 'Agent is required' }, { status: 400 })
    }
    for (const key of ['tokens', 'costUsd', 'latencyMs'] as const) {
      const value = input[key]
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        return Response.json({ error: `${key} must be a finite non-negative number` }, { status: 400 })
      }
    }
    return Response.json({ id: await createRun(input) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
