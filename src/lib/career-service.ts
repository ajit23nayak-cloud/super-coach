import 'server-only'
import { listMessages, getMessage, createDraftReply, type GmailDraft } from './gmail'
import { listUpcomingEvents, detectConflicts, type CalendarEvent, type Conflict } from './calendar'

export interface InboxItem {
  messageId: string
  threadId: string
  from: string
  subject: string
  date: string
  messageIdHeader: string
}

export interface CareerBriefing {
  inboxItems: InboxItem[]
  events: CalendarEvent[]
  conflicts: Conflict[]
}

function headerVal(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export async function getCareerBriefing(): Promise<CareerBriefing> {
  const [summaries, events] = await Promise.all([listMessages(20), listUpcomingEvents(20)])

  const messages = await Promise.all(summaries.map(s => getMessage(s.id)))

  const inboxItems: InboxItem[] = messages.map(msg => ({
    messageId: msg.id,
    threadId: msg.threadId,
    from: headerVal(msg.payload.headers, 'From'),
    subject: headerVal(msg.payload.headers, 'Subject'),
    date: headerVal(msg.payload.headers, 'Date'),
    messageIdHeader: headerVal(msg.payload.headers, 'Message-ID'),
  }))

  const conflicts = detectConflicts(events)

  return { inboxItems, events, conflicts }
}

export async function saveDraftReply(
  messageId: string,
  body: string,
): Promise<GmailDraft> {
  return createDraftReply(messageId, body)
}
