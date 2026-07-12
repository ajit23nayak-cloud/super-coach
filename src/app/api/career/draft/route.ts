import { saveDraftReply } from '@/lib/career-service'
import { authorizeApiRequest } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).messageId !== 'string' ||
    typeof (body as Record<string, unknown>).draftBody !== 'string'
  ) {
    return Response.json(
      { error: 'Body must include { messageId: string, draftBody: string }' },
      { status: 400 },
    )
  }

  const { messageId, draftBody } = body as { messageId: string; draftBody: string }

  try {
    const draft = await saveDraftReply(messageId, draftBody)
    return Response.json({ draftId: draft.id, threadId: draft.message.threadId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
