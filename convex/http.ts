import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'

const http = httpRouter()
const encoder = new TextEncoder()

async function secretMatches(supplied: string | null, expected: string | undefined): Promise<boolean> {
  if (!supplied || !expected) return false
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i]
  return difference === 0
}

async function authorized(
  request: Request,
  envName: 'HEALTH_WEBHOOK_SECRET' | 'SUPER_COACH_DATA_SECRET',
  allowQuerySecret = false,
) {
  const url = new URL(request.url)
  const supplied = request.headers.get('x-webhook-secret')
    ?? request.headers.get('authorization')?.replace(/^Bearer /, '')
    ?? (allowQuerySecret ? url.searchParams.get('secret') : null)
  return secretMatches(supplied, process.env[envName])
}

http.route({
  path: '/health',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'HEALTH_WEBHOOK_SECRET', true))) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 1_000_000) return Response.json({ ok: false, error: 'Payload too large' }, { status: 413 })
    const payload = await request.json()
    await ctx.runMutation(internal.health.record, { payload })
    return Response.json({ ok: true })
  }),
})

http.route({
  path: '/data/health',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
    return Response.json(await ctx.runQuery(internal.health.recent, { limit }))
  }),
})

http.route({
  path: '/data/decisions',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
    return Response.json(await ctx.runQuery(internal.decisions.list, { limit }))
  }),
})

http.route({
  path: '/data/decisions',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const input = await request.json()
    const id = await ctx.runMutation(internal.decisions.create, input)
    return Response.json({ id })
  }),
})

http.route({
  path: '/data/mind-check-ins',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
    return Response.json(await ctx.runQuery(internal.mindCheckIns.list, { limit }))
  }),
})

http.route({
  path: '/data/mind-check-ins',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 100_000) {
      return Response.json({ error: 'Payload too large' }, { status: 413 })
    }
    const input = await request.json()
    const id = await ctx.runMutation(internal.mindCheckIns.create, input)
    return Response.json({ id })
  }),
})

http.route({
  path: '/data/mind-check-ins',
  method: 'DELETE',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 1_000) {
      return Response.json({ error: 'Payload too large' }, { status: 413 })
    }
    let body: { confirm?: unknown } = {}
    try {
      body = (await request.json()) as { confirm?: unknown }
    } catch {
      return Response.json({ error: 'confirm must be true' }, { status: 400 })
    }
    if (body?.confirm !== true) {
      return Response.json({ error: 'confirm must be true' }, { status: 400 })
    }
    const cleared = await ctx.runMutation(internal.mindCheckIns.clearAll, {})
    return Response.json({ cleared })
  }),
})

http.route({
  path: '/data/runs',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    const rows = await ctx.runQuery(internal.agentRuns.list, { limit })
    return Response.json(rows.map(row => ({
      _id: row._id,
      agent: row.agent,
      createdAt: row.createdAt,
      latencyMs: row.latencyMs,
      status: row.status,
    })))
  }),
})

http.route({
  path: '/data/runs',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!(await authorized(request, 'SUPER_COACH_DATA_SECRET'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const input = await request.json()
    const id = await ctx.runMutation(internal.agentRuns.append, input)
    return Response.json({ id })
  }),
})

export default http
