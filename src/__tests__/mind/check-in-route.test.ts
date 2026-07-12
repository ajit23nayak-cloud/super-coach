import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/convex-data', () => ({
  getMindCheckIns: vi.fn(),
  createMindCheckIn: vi.fn(),
  clearMindCheckIns: vi.fn(),
}))

import * as convexData from '@/lib/convex-data'

const PROD_URL = 'https://coach.example/api/mind/check-in'

function jsonRequest(method: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(PROD_URL, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('SUPER_COACH_API_TOKEN', 'test-token')
  vi.stubEnv('SUPER_COACH_DEV_LOOPBACK_BYPASS', '')
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/mind/check-in', () => {
  const validBase = {
    energy: 2,
    positiveEmotion: 2,
    stateWord: 'tired',
    activeSelf: 'operator',
    shipIntent: 'Close Telegram bugs',
    hedgedDecision: 'Whether to continue Cloudflare',
  }

  it('rejects unauthenticated production requests with 401', async () => {
    const { POST } = await import('@/app/api/mind/check-in/route')
    const response = await POST(jsonRequest('POST', validBase))
    expect(response.status).toBe(401)
    expect(convexData.createMindCheckIn).not.toHaveBeenCalled()
  })

  it('valid scores without selectedChoice return { frame, stored:false } and never persist', async () => {
    const { POST } = await import('@/app/api/mind/check-in/route')
    const response = await POST(
      jsonRequest('POST', validBase, { authorization: 'Bearer test-token' }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { frame: { diagnosis: string; choices: unknown[]; question: string }; stored: boolean; id?: string }
    expect(body.stored).toBe(false)
    expect(body.id).toBeUndefined()
    expect(body.frame.choices).toHaveLength(2)
    expect(body.frame.question).toMatch(/A or B/)
    expect(convexData.createMindCheckIn).not.toHaveBeenCalled()
  })

  it('valid scores with selectedChoice A persist and return { frame, stored:true, id }', async () => {
    vi.mocked(convexData.createMindCheckIn).mockResolvedValue('row-123')
    const { POST } = await import('@/app/api/mind/check-in/route')
    const response = await POST(
      jsonRequest('POST', { ...validBase, selectedChoice: 'A' }, { authorization: 'Bearer test-token' }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { frame: { diagnosis: string; choices: Array<{ id: string; label: string; tradeoff: string }> }; stored: boolean; id: string; selectedChoice: string }
    expect(body.stored).toBe(true)
    expect(body.id).toBe('row-123')
    expect(body.selectedChoice).toBe('A')
    expect(convexData.createMindCheckIn).toHaveBeenCalledTimes(1)
    const call = vi.mocked(convexData.createMindCheckIn).mock.calls[0][0]
    expect(call.selectedChoice).toBe('A')
    expect(call.energy).toBe(2)
    expect(call.positiveEmotion).toBe(2)
    expect(call.diagnosis).toBe(body.frame.diagnosis)
    expect(call.choiceA).toContain(body.frame.choices[0].label)
    expect(call.choiceB).toContain(body.frame.choices[1].label)
  })

  it('recomputes the frame server-side and does not trust caller-supplied frame text', async () => {
    vi.mocked(convexData.createMindCheckIn).mockResolvedValue('row-999')
    const { POST } = await import('@/app/api/mind/check-in/route')
    const response = await POST(
      jsonRequest(
        'POST',
        {
          ...validBase,
          selectedChoice: 'B',
          diagnosis: 'attacker-supplied diagnosis',
          choiceA: 'attacker A',
          choiceB: 'attacker B',
        },
        { authorization: 'Bearer test-token' },
      ),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { frame: { diagnosis: string }; stored: boolean }
    expect(body.stored).toBe(true)
    expect(body.frame.diagnosis).not.toBe('attacker-supplied diagnosis')
    const persisted = vi.mocked(convexData.createMindCheckIn).mock.calls[0][0]
    expect(persisted.diagnosis).not.toBe('attacker-supplied diagnosis')
    expect(persisted.choiceA).not.toBe('attacker A')
    expect(persisted.choiceB).not.toBe('attacker B')
  })

  it('invalid scores return 400 without persistence', async () => {
    const { POST } = await import('@/app/api/mind/check-in/route')
    for (const value of [0, 6, 1.5, '3']) {
      const response = await POST(
        jsonRequest(
          'POST',
          { ...validBase, energy: value },
          { authorization: 'Bearer test-token' },
        ),
      )
      expect(response.status).toBe(400)
    }
    expect(convexData.createMindCheckIn).not.toHaveBeenCalled()
  })

  it('crisis text returns exact handoff with stored:false and no normal frame', async () => {
    const { POST } = await import('@/app/api/mind/check-in/route')
    const response = await POST(
      jsonRequest(
        'POST',
        {
          ...validBase,
          selectedChoice: 'A',
          stateWord: 'suicidal',
        },
        { authorization: 'Bearer test-token' },
      ),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { handoff: string; stored: boolean; frame?: unknown }
    expect(body.stored).toBe(false)
    expect(body.handoff).toContain('iCall +91-9152987821')
    expect(body.handoff).toContain('call 112')
    expect(body.frame).toBeUndefined()
    expect(convexData.createMindCheckIn).not.toHaveBeenCalled()
  })
})

describe('GET /api/mind/check-in', () => {
  it('returns 401 when unauthenticated in production', async () => {
    const { GET } = await import('@/app/api/mind/check-in/route')
    const response = await GET(new Request(PROD_URL))
    expect(response.status).toBe(401)
    expect(convexData.getMindCheckIns).not.toHaveBeenCalled()
  })

  it('lists check-ins when authenticated', async () => {
    vi.mocked(convexData.getMindCheckIns).mockResolvedValue([{ id: 'row-1' }])
    const { GET } = await import('@/app/api/mind/check-in/route')
    const response = await GET(
      new Request(PROD_URL, { headers: { authorization: 'Bearer test-token' } }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ checkIns: [{ id: 'row-1' }] })
  })
})

describe('DELETE /api/mind/check-in', () => {
  it('rejects unauthenticated production requests with 401', async () => {
    const { DELETE } = await import('@/app/api/mind/check-in/route')
    const response = await DELETE(jsonRequest('DELETE', { confirm: true }))
    expect(response.status).toBe(401)
    expect(convexData.clearMindCheckIns).not.toHaveBeenCalled()
  })

  it('requires JSON body { confirm: true }', async () => {
    const { DELETE } = await import('@/app/api/mind/check-in/route')

    const missing = await DELETE(
      new Request(PROD_URL, {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      }),
    )
    expect(missing.status).toBe(400)

    const wrong = await DELETE(
      jsonRequest('DELETE', { confirm: false }, { authorization: 'Bearer test-token' }),
    )
    expect(wrong.status).toBe(400)

    expect(convexData.clearMindCheckIns).not.toHaveBeenCalled()
  })

  it('clears only mindCheckIns when confirm:true', async () => {
    vi.mocked(convexData.clearMindCheckIns).mockResolvedValue(7)
    const { DELETE } = await import('@/app/api/mind/check-in/route')
    const response = await DELETE(
      jsonRequest('DELETE', { confirm: true }, { authorization: 'Bearer test-token' }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cleared: 7 })
    expect(convexData.clearMindCheckIns).toHaveBeenCalledTimes(1)
  })
})
