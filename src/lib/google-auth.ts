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

async function refresh(token: GoogleToken): Promise<GoogleToken> {
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

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  const updated: GoogleToken = {
    ...token,
    access_token: data.access_token,
    token: data.access_token,
    expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }

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
  return updated
}

export async function getAccessToken(): Promise<string> {
  let token = readToken()
  if (isExpired(token)) {
    token = await refresh(token)
  }
  const accessToken = token.access_token ?? token.token
  if (!accessToken) {
    throw new Error('google_token.json has no access token field')
  }
  return accessToken
}
