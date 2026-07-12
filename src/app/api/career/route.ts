import { getCareerBriefing } from '@/lib/career-service'
import { authorizeApiRequest } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  try {
    const briefing = await getCareerBriefing()
    return Response.json(briefing)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
