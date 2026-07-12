import { describe, expect, it } from 'vitest'
import { bearerHeaders, isUnauthorized, readToken, writeToken } from '@/lib/client-auth'

describe('client-auth helpers', () => {
  it('omits Authorization when no token is set', () => {
    expect(bearerHeaders(null)).toEqual({})
    expect(bearerHeaders('')).toEqual({})
  })

  it('emits a Bearer Authorization header for a non-empty token', () => {
    expect(bearerHeaders('abc123')).toEqual({ Authorization: 'Bearer abc123' })
  })

  it('detects a 401 response', () => {
    expect(isUnauthorized(401)).toBe(true)
    expect(isUnauthorized(200)).toBe(false)
    expect(isUnauthorized(500)).toBe(false)
  })

  it('reads and writes tokens through the given Storage without falling through null', () => {
    const bag = new Map<string, string>()
    const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: key => bag.get(key) ?? null,
      setItem: (key, value) => void bag.set(key, value),
      removeItem: key => void bag.delete(key),
    }
    expect(readToken(storage)).toBeNull()
    writeToken(storage, 'shhh')
    expect(readToken(storage)).toBe('shhh')
    writeToken(storage, null)
    expect(readToken(storage)).toBeNull()
    expect(readToken(null)).toBeNull()
    writeToken(null, 'ignored')
  })
})
