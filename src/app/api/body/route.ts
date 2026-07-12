import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../convex/_generated/api'
import { normalizeHealthReadings } from '@/lib/health-normalizer'
import { authorizeApiRequest } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    return Response.json({ error: 'NEXT_PUBLIC_CONVEX_URL is not configured' }, { status: 500 })
  }

  try {
    const client = new ConvexHttpClient(url)
    const rows = await client.query(api.health.recent, { limit: 20 })
    return Response.json({ snapshot: normalizeHealthReadings(rows), rows: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
