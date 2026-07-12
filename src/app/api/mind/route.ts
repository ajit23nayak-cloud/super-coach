import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../convex/_generated/api'
import { authorizeApiRequest } from '@/lib/api-auth'
import { detectCrisis, validateDecisionInput } from '@/lib/mind'

export const dynamic = 'force-dynamic'

function client(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  return new ConvexHttpClient(url)
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  try {
    const decisions = await client().query(api.decisions.list, { limit: 20 })
    return Response.json({ decisions })
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
    const id = await client().mutation(api.decisions.create, toStore)
    return Response.json({ id, decision: toStore, handoff })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
