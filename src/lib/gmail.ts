import 'server-only'
import { getAccessToken } from './google-auth'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface MessageSummary {
  id: string
  threadId: string
}

export interface MessageHeader {
  name: string
  value: string
}

export interface MessagePart {
  headers: MessageHeader[]
  body: { data?: string; size: number }
  parts?: MessagePart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  payload: MessagePart
}

export interface GmailDraft {
  id: string
  message: { threadId: string }
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

function header(msg: GmailMessage, name: string): string {
  return (
    msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  )
}

export async function listMessages(
  maxResults = 20,
  after?: Date,
  before?: Date,
  labelId = 'INBOX',
): Promise<MessageSummary[]> {
  const qParts: string[] = []
  if (after) qParts.push(`after:${Math.floor(after.getTime() / 1000)}`)
  if (before) qParts.push(`before:${Math.floor(before.getTime() / 1000)}`)
  const q = qParts.join(' ')

  const results: MessageSummary[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${BASE}/messages`)
    url.searchParams.set('labelIds', labelId)
    const remaining = maxResults - results.length
    url.searchParams.set('maxResults', String(Math.max(1, Math.min(remaining, 500))))
    if (q) url.searchParams.set('q', q)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await authedFetch(url.toString())
    if (!res.ok) throw new Error(`listMessages failed: ${res.status}`)
    const data = (await res.json()) as {
      messages?: MessageSummary[]
      nextPageToken?: string
    }
    const page = data.messages ?? []
    for (const m of page) {
      results.push(m)
      if (results.length >= maxResults) break
    }
    pageToken = data.nextPageToken
    if (results.length >= maxResults) break
    if (page.length === 0) break
  } while (pageToken)

  return results.slice(0, maxResults)
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const url = `${BASE}/messages/${encodeURIComponent(id)}?format=full`
  const res = await authedFetch(url)
  if (!res.ok) throw new Error(`getMessage(${id}) failed: ${res.status}`)
  return res.json() as Promise<GmailMessage>
}

function sanitizeHeader(value: string, name: string, required = false): string {
  const sanitized = value.replace(/[\r\n]+/g, ' ').trim()
  if (required && !sanitized) throw new Error(`${name} header is missing`)
  return sanitized
}

function buildRawMime(params: {
  to: string
  subject: string
  body: string
  inReplyTo: string
  references: string
}): string {
  const cleanTo = sanitizeHeader(params.to, 'To', true)
  const cleanSubject = sanitizeHeader(params.subject, 'Subject')
  const subject = cleanSubject.toLowerCase().startsWith('re:')
    ? cleanSubject
    : `Re: ${cleanSubject}`
  const inReplyTo = sanitizeHeader(params.inReplyTo, 'In-Reply-To')
  const references = sanitizeHeader(params.references, 'References')

  const lines: string[] = [
    `To: ${cleanTo}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
  ]

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`)
    const refs = references
      ? `${references} ${inReplyTo}`
      : inReplyTo
    lines.push(`References: ${refs}`)
  }

  const mime = lines.join('\r\n') + '\r\n\r\n' + params.body
  return Buffer.from(mime).toString('base64url')
}

export async function createDraftReply(
  originalMessageId: string,
  body: string,
): Promise<GmailDraft> {
  const original = await getMessage(originalMessageId)

  const to = header(original, 'Reply-To') || header(original, 'From')
  const subject = header(original, 'Subject')
  const inReplyTo = header(original, 'Message-ID')
  const references = header(original, 'References')

  const raw = buildRawMime({ to, subject, body, inReplyTo, references })

  const res = await authedFetch(`${BASE}/drafts`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        raw,
        threadId: original.threadId,
      },
    }),
  })

  if (!res.ok) throw new Error(`createDraftReply failed: ${res.status}`)
  return res.json() as Promise<GmailDraft>
}
