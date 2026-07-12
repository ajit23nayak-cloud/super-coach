import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeApiRequest } from '@/lib/api-auth'

afterEach(() => vi.unstubAllEnvs())

describe('authorizeApiRequest', () => {
  it('allows loopback requests during local development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(authorizeApiRequest(new Request('http://127.0.0.1:3000/api/body'))).toBeNull()
  })

  it('fails closed in production when no API token is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SUPER_COACH_API_TOKEN', '')
    const response = authorizeApiRequest(new Request('https://coach.example/api/body'))
    expect(response?.status).toBe(401)
  })

  it('accepts a matching production bearer token', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SUPER_COACH_API_TOKEN', 'test-access-value')
    const request = new Request('https://coach.example/api/body', {
      headers: { Authorization: 'Bearer test-access-value' },
    })
    expect(authorizeApiRequest(request)).toBeNull()
  })
})
