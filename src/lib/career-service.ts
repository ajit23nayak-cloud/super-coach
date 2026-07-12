import 'server-only'
import { listMessages, getMessage, createDraftReply, type GmailDraft } from './gmail'
import { listUpcomingEvents, detectConflicts, type CalendarEvent, type Conflict } from './calendar'

export type MailSource = 'INBOX' | 'SENT' | 'DRAFT'

export interface InboxItem {
  messageId: string
  threadId: string
  from: string
  subject: string
  date: string
  messageIdHeader: string
  source: MailSource
  labelIds: string[]
}

export interface ControlWindow {
  timezone: string
  now: string
  gmailAfter: string
  gmailBefore: string
  calendarTimeMin: string
  calendarTimeMax: string
}

export interface RankedItem {
  kind: 'inbox' | 'event'
  id: string
  title: string
  when: string
  reasons: string[]
  score: number
  isTravel: boolean
}

export interface AttentionChoice {
  question: string
  primary: { id: string; title: string }
  comparison: { id: string; title: string }
}

export interface CareerBriefing {
  controlWindow: ControlWindow
  inboxItems: InboxItem[]
  events: CalendarEvent[]
  conflicts: Conflict[]
  ranked: RankedItem[]
  attentionChoice: AttentionChoice | null
}

const HOUR_MS = 3_600_000
const WINDOW_MS = 48 * HOUR_MS
const PER_LABEL_CAP = 100
const LABELS: readonly MailSource[] = ['INBOX', 'SENT', 'DRAFT']

function headerVal(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

const TRAVEL_RE =
  /(?:\b(?:e[- ]?ticket|flight|boarding\s+pass|itinerary|pnr)\b|\b(?:hotel|flight|travel|trip|airline|air|train|cab|taxi)\s+booking\b|\bbooking\s+(?:confirmation|receipt|reference)\b)/i
const INVESTOR_RE = /\b(investor|mis|board\s+update|quarterly|shareholder|due\s+diligence|cap\s+table)\b/i
const DEADLINE_RE = /\b(deadline|due\s+(by|today|tomorrow)|urgent|asap)\b/i
const COMMITMENT_RE = /\b(commit(ment|ted)?|promised|action\s+item|follow[- ]?up|will\s+send|will\s+share)\b/i
const NOISE_RE = /\b(openai\s+credits?|job\s+alert|newsletter|unsubscribe|no[- ]?reply|noreply)\b/i
const ATTENTION_COMPARATOR_RE =
  /\b(openai\s+credits?|api\s+(?:spend|usage|balance|cost)|(?:credit|account|api)\s+balance|balance\s+alert|job\s+alert)\b/i

function scoreText(
  text: string,
  opts: { isDraft?: boolean; isPromotions?: boolean } = {},
): { score: number; reasons: string[]; isTravel: boolean } {
  if (opts.isPromotions) {
    return { score: -100, reasons: ['promotions'], isTravel: false }
  }
  const reasons: string[] = []
  let score = 0

  const hasInvestor = INVESTOR_RE.test(text)
  const hasTravel = TRAVEL_RE.test(text)

  if (hasInvestor) {
    score += 100
    reasons.push('investor-consequence')
  }
  if (hasTravel) {
    score += 90
    reasons.push('travel')
  }
  if (DEADLINE_RE.test(text)) {
    score += 85
    reasons.push('deadline')
  }
  if (COMMITMENT_RE.test(text) && !opts.isDraft) {
    score += 75
    reasons.push('commitment')
  }

  const hasHighConsequence = hasInvestor || hasTravel
  if (!hasHighConsequence && NOISE_RE.test(text)) {
    score -= 100
    reasons.push('noise')
  }

  return { score, reasons, isTravel: hasTravel }
}

function proximityBonus(whenMs: number, nowMs: number): number {
  const delta = whenMs - nowMs
  if (delta < 0) return 0
  if (delta <= 24 * HOUR_MS) return 30
  if (delta <= 48 * HOUR_MS) return 15
  return 0
}

function rankItems(
  inboxItems: InboxItem[],
  events: CalendarEvent[],
  nowMs: number,
): RankedItem[] {
  const ranked: RankedItem[] = []

  for (const it of inboxItems) {
    const parsed = Date.parse(it.date)
    const whenMs = Number.isFinite(parsed) ? parsed : nowMs
    const { score, reasons, isTravel } = scoreText(it.subject, {
      isDraft: it.source === 'DRAFT',
      isPromotions: it.labelIds.includes('CATEGORY_PROMOTIONS'),
    })
    ranked.push({
      kind: 'inbox',
      id: it.messageId,
      title: it.subject,
      when: new Date(whenMs).toISOString(),
      reasons,
      score: score + proximityBonus(whenMs, nowMs),
      isTravel,
    })
  }

  for (const ev of events) {
    const startIso = ev.start.dateTime ?? ev.start.date ?? ''
    const whenMs = startIso ? Date.parse(startIso) : nowMs
    const summary = ev.summary ?? ''
    const { score, reasons, isTravel } = scoreText(summary)
    ranked.push({
      kind: 'event',
      id: ev.id,
      title: summary,
      when: startIso || new Date(whenMs).toISOString(),
      reasons,
      score: score + proximityBonus(whenMs, nowMs),
      isTravel,
    })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const at = Date.parse(a.when)
    const bt = Date.parse(b.when)
    if (at !== bt) return at - bt
    return a.id.localeCompare(b.id)
  })

  return ranked
}

function buildAttentionChoice(ranked: RankedItem[]): AttentionChoice | null {
  if (ranked.length < 2) return null
  const primary = ranked[0]
  if (primary.score <= 0) return null
  const comparison = ranked.find(
    r => r.score <= 0 && r.id !== primary.id && ATTENTION_COMPARATOR_RE.test(r.title),
  )
  if (!comparison) return null
  return {
    primary: { id: primary.id, title: primary.title },
    comparison: { id: comparison.id, title: comparison.title },
    question: `Should you deep-dive "${primary.title}" now, or would you rather clear "${comparison.title}" first?`,
  }
}

export async function getCareerBriefing(now: Date = new Date()): Promise<CareerBriefing> {
  const nowMs = now.getTime()
  const gmailAfter = new Date(nowMs - WINDOW_MS)
  const gmailBefore = now
  const calendarTimeMin = new Date(nowMs - WINDOW_MS)
  const calendarTimeMax = new Date(nowMs + WINDOW_MS)

  const controlWindow: ControlWindow = {
    timezone: 'Asia/Kolkata',
    now: now.toISOString(),
    gmailAfter: gmailAfter.toISOString(),
    gmailBefore: gmailBefore.toISOString(),
    calendarTimeMin: calendarTimeMin.toISOString(),
    calendarTimeMax: calendarTimeMax.toISOString(),
  }

  const [perLabel, events] = await Promise.all([
    Promise.all(
      LABELS.map(label =>
        listMessages(PER_LABEL_CAP, gmailAfter, gmailBefore, label).then(msgs => ({
          label,
          msgs,
        })),
      ),
    ),
    listUpcomingEvents(20, calendarTimeMin, calendarTimeMax),
  ])

  const seen = new Set<string>()
  const dedupedSummaries: Array<{ id: string; source: MailSource }> = []
  for (const { label, msgs } of perLabel) {
    for (const m of msgs) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      dedupedSummaries.push({ id: m.id, source: label })
    }
  }

  const messages = await Promise.all(
    dedupedSummaries.map(s => getMessage(s.id).then(msg => ({ msg, source: s.source }))),
  )

  const inboxItems: InboxItem[] = messages.map(({ msg, source }) => ({
    messageId: msg.id,
    threadId: msg.threadId,
    from: headerVal(msg.payload.headers, 'From'),
    subject: headerVal(msg.payload.headers, 'Subject'),
    date: headerVal(msg.payload.headers, 'Date'),
    messageIdHeader: headerVal(msg.payload.headers, 'Message-ID'),
    source,
    labelIds: msg.labelIds ?? [],
  }))

  const conflicts = detectConflicts(events)
  const ranked = rankItems(inboxItems, events, nowMs)
  const attentionChoice = buildAttentionChoice(ranked)

  return { controlWindow, inboxItems, events, conflicts, ranked, attentionChoice }
}

export async function saveDraftReply(
  messageId: string,
  body: string,
): Promise<GmailDraft> {
  return createDraftReply(messageId, body)
}
