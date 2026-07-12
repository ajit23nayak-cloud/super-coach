const STORAGE_KEY = 'superCoach.accessToken'

type TokenStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function bearerHeaders(token: string | null | undefined): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export function isUnauthorized(status: number): boolean {
  return status === 401
}

export function readToken(storage: TokenStore | null | undefined): string | null {
  if (!storage) return null
  const value = storage.getItem(STORAGE_KEY)
  return value && value.length > 0 ? value : null
}

export function writeToken(storage: TokenStore | null | undefined, token: string | null): void {
  if (!storage) return
  if (!token) storage.removeItem(STORAGE_KEY)
  else storage.setItem(STORAGE_KEY, token)
}
