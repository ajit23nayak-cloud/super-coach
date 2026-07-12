import 'server-only'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'

interface GoogleToken {
  access_token?: string
  token?: string
  refresh_token: string
  token_uri?: string
  client_id: string
  client_secret: string
  scopes?: string[]
  expiry?: string        // ISO-8601, from python google-auth
  expiry_date?: number   // unix ms, from googleapis JS library
}

const FIVE_MINUTES_MS = 5 * 60 * 1000
const CLOUDFLARE_SECRET_NAMES = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
] as const

let cloudflareToken: GoogleToken | null = null

function tokenPath(): string {
  const hermesHome =
    process.env.HERMES_HOME ??
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'hermes')
      : path.join(os.homedir(), 'AppData', 'Local', 'hermes'))
  return path.join(hermesHome, 'google_token.json')
}

function isExpired(token: GoogleToken): boolean {
  if (token.expiry) {
    return Date.now() >= new Date(token.expiry).getTime() - FIVE_MINUTES_MS
  }
  if (token.expiry_date) {
    return Date.now() >= token.expiry_date - FIVE_MINUTES_MS
  }
  return false
}

function readToken(): GoogleToken {
  const p = tokenPath()
  if (!fs.existsSync(p)) {
    throw new Error(
      `google_token.json not found at ${p}. ` +
        'Set HERMES_HOME or place the file at %LOCALAPPDATA%/hermes/google_token.json.',
    )
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as GoogleToken
}

function readCloudflareCredentials(): GoogleToken | null {
  const values = CLOUDFLARE_SECRET_NAMES.map(name => process.env[name])
  const configured = values.filter(Boolean).length
  if (configured === 0) return null
  if (configured !== CLOUDFLARE_SECRET_NAMES.length) {
    throw new Error('Google OAuth Cloudflare secrets are incomplete')
  }
  return {
    client_id: values[0]!,
    client_secret: values[1]!,
    refresh_token: values[2]!,
  }
}

function accessToken(token: GoogleToken): string | null {
  return token.access_token ?? token.token ?? null
}

async function refresh(token: GoogleToken, persist: boolean): Promise<GoogleToken> {
  const tokenUri = token.token_uri ?? 'https://oauth2.googleapis.com/token'
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
    client_id: token.client_id,
    client_secret: token.client_secret,
  })

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`)

  const data = (await res.json()) as {
    access_token: string
    expires_in: number
    refresh_token?: string
  }
  const updated: GoogleToken = {
    ...token,
    access_token: data.access_token,
    token: data.access_token,
    refresh_token: data.refresh_token ?? token.refresh_token,
    expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }

  if (persist) {
    const destination = tokenPath()
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify(updated, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      })
      fs.renameSync(temporary, destination)
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true })
    }
  }
  return updated
}

export async function getAccessToken(): Promise<string> {
  const cloudflareCredentials = readCloudflareCredentials()
  if (cloudflareCredentials) {
    if (!cloudflareToken || isExpired(cloudflareToken) || !accessToken(cloudflareToken)) {
      cloudflareToken = await refresh(cloudflareCredentials, false)
    }
    return accessToken(cloudflareToken)!
  }

  let token = readToken()
  if (isExpired(token)) {
    token = await refresh(token, true)
  }
  const storedAccessToken = accessToken(token)
  if (!storedAccessToken) {
    throw new Error('google_token.json has no access token field')
  }
  return storedAccessToken
}
