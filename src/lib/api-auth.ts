import { timingSafeEqual } from 'node:crypto'

function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function authorizeApiRequest(request: Request): Response | null {
  const hostname = new URL(request.url).hostname
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  const localBypassEnabled = process.env.SUPER_COACH_DEV_LOOPBACK_BYPASS === '1'
  if (process.env.NODE_ENV !== 'production' && localBypassEnabled && isLoopback) return null

  const expected = process.env.SUPER_COACH_API_TOKEN
  const authorization = request.headers.get('authorization') ?? ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''

  if (!expected || !provided || !equalSecret(expected, provided)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
