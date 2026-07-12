import { authorizeApiRequest } from '@/lib/api-auth'
import { createDecision, getDecisions } from '@/lib/convex-data'
import { detectCrisis, validateDecisionInput } from '@/lib/mind'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  try {
    return Response.json({ decisions: await getDecisions(20) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  let input: ReturnType<typeof validateDecisionInput>
  try {
    input = validateDecisionInput(await request.json())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    return Response.json({ error: message }, { status: 400 })
  }

  const handoff = detectCrisis(input.decision)
  const toStore = handoff
    ? { ...input, status: 'deferred' as const, outcome: 'crisis_handoff' }
    : input

  try {
    const id = await createDecision(toStore)
    return Response.json({ id, decision: toStore, handoff })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
