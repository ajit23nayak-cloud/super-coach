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

export async function listMessages(maxResults = 20): Promise<MessageSummary[]> {
  const url = new URL(`${BASE}/messages`)
  url.searchParams.set('labelIds', 'INBOX')
  url.searchParams.set('maxResults', String(maxResults))

  const res = await authedFetch(url.toString())
  if (!res.ok) throw new Error(`listMessages failed: ${res.status}`)
  const data = (await res.json()) as { messages?: MessageSummary[] }
  return data.messages ?? []
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const url = `${BASE}/messages/${encodeURIComponent(id)}?format=full`
  const res = await authedFetch(url)
  if (!res.ok) throw new Error(`getMessage(${id}) failed: ${res.status}`)
  return res.json() as Promise<GmailMessage>
}

function buildRawMime(params: {
  to: string
  subject: string
  body: string
  inReplyTo: string
  references: string
}): string {
  const subject = params.subject.startsWith('Re: ')
    ? params.subject
    : `Re: ${params.subject}`

  const lines: string[] = [
    `To: ${params.to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
  ]

  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`)
    const refs = params.references
      ? `${params.references} ${params.inReplyTo}`
      : params.inReplyTo
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
