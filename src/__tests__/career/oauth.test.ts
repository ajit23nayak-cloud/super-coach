import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'

vi.mock('node:fs')

const NOW_MS = 1_700_000_000_000
const FUTURE_EXPIRY = new Date(NOW_MS + 60 * 60 * 1000).toISOString() // 1 hr from "now"
const PAST_EXPIRY = new Date(NOW_MS - 60 * 1000).toISOString()        // 1 min ago

const BASE_TOKEN = {
  access_token: 'valid-access',
  refresh_token: 'rt-abc',
  token_uri: 'https://oauth2.googleapis.com/token',
  client_id: 'cid',
  client_secret: 'csec',
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  expiry: FUTURE_EXPIRY,
}

function mockTokenFile(data: object) {
  vi.mocked(fs.existsSync).mockReturnValue(true)
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data))
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
  vi.resetModules()
  vi.setSystemTime(new Date(NOW_MS))
})

describe('getAccessToken', () => {
  it('returns stored token when not expired', async () => {
    mockTokenFile(BASE_TOKEN)
    const { getAccessToken } = await import('@/lib/google-auth')
    const token = await getAccessToken()
    expect(token).toBe('valid-access')
  })

  it('reads the real Hermes token field', async () => {
    const hermesToken = { ...BASE_TOKEN, access_token: undefined, token: 'hermes-access' }
    mockTokenFile(hermesToken)
    vi.resetModules()
    const { getAccessToken } = await import('@/lib/google-auth')
    await expect(getAccessToken()).resolves.toBe('hermes-access')
  })

  it('refreshes and returns new token when expired', async () => {
    mockTokenFile({ ...BASE_TOKEN, access_token: 'old-access', expiry: PAST_EXPIRY })

    const mockWriteFileSync = vi.mocked(fs.writeFileSync)

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        expires_in: 3600,
      }),
    }) as unknown as typeof fetch

    vi.resetModules()
    const { getAccessToken } = await import('@/lib/google-auth')
    const token = await getAccessToken()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(token).toBe('new-access')
    expect(mockWriteFileSync).toHaveBeenCalled()
  })

  it('throws if token file is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.resetModules()
    const { getAccessToken } = await import('@/lib/google-auth')
    await expect(getAccessToken()).rejects.toThrow(/google_token/)
  })

  it('uses complete Cloudflare credentials without reading or writing the local token file', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cloudflare-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cloudflare-client-secret')
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'cloudflare-refresh-token')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'cloudflare-access', expires_in: 3600 }),
    }) as unknown as typeof fetch

    const { getAccessToken } = await import('@/lib/google-auth')

    await expect(getAccessToken()).resolves.toBe('cloudflare-access')
    expect(fs.existsSync).not.toHaveBeenCalled()
    expect(fs.readFileSync).not.toHaveBeenCalled()
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })

  it('reuses a Cloudflare access token until it approaches expiry', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cloudflare-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cloudflare-client-secret')
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'cloudflare-refresh-token')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'cloudflare-access', expires_in: 3600 }),
    }) as unknown as typeof fetch

    const { getAccessToken } = await import('@/lib/google-auth')

    await expect(getAccessToken()).resolves.toBe('cloudflare-access')
    await expect(getAccessToken()).resolves.toBe('cloudflare-access')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('fails closed when Cloudflare credentials are only partially configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cloudflare-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'cloudflare-refresh-token')

    const { getAccessToken } = await import('@/lib/google-auth')

    await expect(getAccessToken()).rejects.toThrow('Google OAuth Cloudflare secrets are incomplete')
    expect(fs.existsSync).not.toHaveBeenCalled()
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })
})
