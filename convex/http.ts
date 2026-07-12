import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { api } from './_generated/api'

const http = httpRouter()

http.route({
  path: '/health',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.HEALTH_WEBHOOK_SECRET
    const url = new URL(request.url)
    const supplied = request.headers.get('x-webhook-secret') ?? url.searchParams.get('secret')

    if (!expected) {
      return Response.json({ ok: false, error: 'Webhook authentication is not configured' }, { status: 503 })
    }
    if (!supplied || supplied !== expected) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    await ctx.runMutation(api.health.record, { payload })
    return Response.json({ ok: true })
  }),
})

export default http
