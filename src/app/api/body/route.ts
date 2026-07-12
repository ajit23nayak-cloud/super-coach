import { authorizeApiRequest } from '@/lib/api-auth'
import { getHealthRows } from '@/lib/convex-data'
import { normalizeHealthReadings } from '@/lib/health-normalizer'
import { buildBodyAssessment } from '@/lib/body-assessment'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  try {
    const rows = await getHealthRows(20)
    const snapshot = normalizeHealthReadings(rows)
    const assessment = buildBodyAssessment(snapshot)
    return Response.json({ snapshot, assessment, rows: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
