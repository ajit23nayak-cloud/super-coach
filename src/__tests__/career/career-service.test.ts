import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gmail', () => ({
  listMessages: vi.fn(),
  getMessage: vi.fn(),
  createDraftReply: vi.fn(),
}))
vi.mock('@/lib/calendar', () => ({
  listUpcomingEvents: vi.fn(),
  detectConflicts: vi.fn(),
}))

import * as gmailMod from '@/lib/gmail'
import * as calMod from '@/lib/calendar'

const THREAD_ID = 'thread-001'
const MSG_HEADERS = [
  { name: 'From', value: 'boss@example.com' },
  { name: 'Subject', value: 'Urgent: Northwind proposal' },
  { name: 'Date', value: 'Sat, 12 Jul 2026 08:00:00 +0000' },
  { name: 'Message-ID', value: '<boss-001@mail.example.com>' },
]

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('getCareerBriefing', () => {
  it('returns inbox items and calendar conflicts', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([{ id: 'msg-001', threadId: THREAD_ID }])
    vi.mocked(gmailMod.getMessage).mockResolvedValue({
      id: 'msg-001',
      threadId: THREAD_ID,
      payload: { headers: MSG_HEADERS, body: { size: 100 }, parts: [] },
    } as unknown as Awaited<ReturnType<typeof gmailMod.getMessage>>)

    const base = new Date('2026-07-12T09:00:00Z')
    const h = (n: number) => new Date(base.getTime() + n * 3_600_000).toISOString()
    const events = [
      { id: 'e1', summary: 'Standup', start: { dateTime: h(0) }, end: { dateTime: h(1) } },
      { id: 'e2', summary: 'Deep Work', start: { dateTime: h(0.5) }, end: { dateTime: h(2) } },
    ]
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue(events as never)
    vi.mocked(calMod.detectConflicts).mockReturnValue([{ a: events[0], b: events[1] }] as never)

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing()

    expect(briefing.inboxItems).toHaveLength(1)
    expect(briefing.inboxItems[0].subject).toBe('Urgent: Northwind proposal')
    expect(briefing.inboxItems[0].from).toBe('boss@example.com')
    expect(briefing.conflicts).toHaveLength(1)
    expect(briefing.conflicts[0].a.id).toBe('e1')
  })

  it('handles empty inbox and no conflicts', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([])
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing()

    expect(briefing.inboxItems).toEqual([])
    expect(briefing.conflicts).toEqual([])
  })
})

describe('control window metadata', () => {
  it('includes explicit 48h Gmail window and ±48h calendar window with timezone', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([])
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const now = new Date('2026-07-12T09:00:00.000Z')
    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(now)

    expect(briefing.controlWindow.timezone).toBe('Asia/Kolkata')
    expect(briefing.controlWindow.now).toBe('2026-07-12T09:00:00.000Z')
    expect(briefing.controlWindow.gmailAfter).toBe('2026-07-10T09:00:00.000Z')
    expect(briefing.controlWindow.gmailBefore).toBe('2026-07-12T09:00:00.000Z')
    expect(briefing.controlWindow.calendarTimeMin).toBe('2026-07-10T09:00:00.000Z')
    expect(briefing.controlWindow.calendarTimeMax).toBe('2026-07-14T09:00:00.000Z')
  })

  it('passes the exact 48h-ago cutoff to Gmail and ±48h to Calendar', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([])
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const now = new Date('2026-07-12T09:00:00.000Z')
    const { getCareerBriefing } = await import('@/lib/career-service')
    await getCareerBriefing(now)

    const gmailArgs = vi.mocked(gmailMod.listMessages).mock.calls[0]
    const gmailAfter = gmailArgs[1] as Date
    expect(gmailAfter).toBeInstanceOf(Date)
    expect(gmailAfter.getTime()).toBe(now.getTime() - 48 * 3_600_000)

    const calArgs = vi.mocked(calMod.listUpcomingEvents).mock.calls[0]
    const calMin = calArgs[1] as Date
    const calMax = calArgs[2] as Date
    expect(calMin.getTime()).toBe(now.getTime() - 48 * 3_600_000)
    expect(calMax.getTime()).toBe(now.getTime() + 48 * 3_600_000)
  })
})

function buildMsg(id: string, subject: string, from: string) {
  return {
    id,
    threadId: `t-${id}`,
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'Date', value: 'Sat, 11 Jul 2026 08:00:00 +0000' },
        { name: 'Message-ID', value: `<${id}@mail>` },
      ],
      body: { size: 0 },
      parts: [],
    },
  }
}

describe('deterministic relative-importance ranking', () => {
  it('ranks investor MIS above OpenAI credits and job alerts', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([
      { id: 'm-inv', threadId: 't-inv' },
      { id: 'm-cred', threadId: 't-cred' },
      { id: 'm-job', threadId: 't-job' },
    ])
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => {
      if (id === 'm-inv') return buildMsg('m-inv', 'Investor MIS Q3 update', 'ir@fund.com') as never
      if (id === 'm-cred') return buildMsg('m-cred', 'OpenAI credits expiring soon', 'billing@openai.com') as never
      return buildMsg('m-job', 'Job alert: new roles matching your profile', 'jobs@linkedin.com') as never
    })
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const ids = briefing.ranked.map(r => r.id)
    const invIdx = ids.indexOf('m-inv')
    const credIdx = ids.indexOf('m-cred')
    const jobIdx = ids.indexOf('m-job')

    expect(invIdx).toBeGreaterThanOrEqual(0)
    expect(invIdx).toBeLessThan(credIdx)
    expect(invIdx).toBeLessThan(jobIdx)
  })

  it('surfaces Air India flight tomorrow near the top with travel reason', async () => {
    const now = new Date('2026-07-12T09:00:00Z')
    const tomorrow = new Date(now.getTime() + 24 * 3_600_000).toISOString()
    const later = new Date(now.getTime() + 25 * 3_600_000).toISOString()

    vi.mocked(gmailMod.listMessages).mockResolvedValue([
      { id: 'm-cred', threadId: 't-cred' },
      { id: 'm-job', threadId: 't-job' },
    ])
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => (
      id === 'm-cred'
        ? buildMsg('m-cred', 'OpenAI credits expiring soon', 'billing@openai.com') as never
        : buildMsg('m-job', 'Job alert: new roles', 'jobs@linkedin.com') as never
    ))
    const events = [
      { id: 'ev-air', summary: 'Air India flight AI 505 BLR-BOM', start: { dateTime: tomorrow }, end: { dateTime: later } },
    ]
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue(events as never)
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(now)

    expect(briefing.ranked.length).toBeGreaterThan(0)
    expect(briefing.ranked[0].id).toBe('ev-air')
    expect(briefing.ranked[0].reasons).toContain('travel')
    expect(briefing.ranked[0].isTravel).toBe(true)
    expect(briefing.ranked[0].when).toBe(tomorrow)
  })

  it('surfaces travel from email subject containing e-ticket / flight / booking', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([
      { id: 'm-tk', threadId: 't-tk' },
      { id: 'm-fl', threadId: 't-fl' },
      { id: 'm-bk', threadId: 't-bk' },
    ])
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => {
      if (id === 'm-tk') return buildMsg('m-tk', 'Your e-ticket confirmation', 'noreply@airindia.in') as never
      if (id === 'm-fl') return buildMsg('m-fl', 'Flight schedule change', 'ops@indigo.in') as never
      return buildMsg('m-bk', 'Hotel booking receipt', 'stays@booking.com') as never
    })
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    for (const id of ['m-tk', 'm-fl', 'm-bk']) {
      const item = briefing.ranked.find(r => r.id === id)
      expect(item?.reasons).toContain('travel')
      expect(item?.isTravel).toBe(true)
    }
  })
})

describe('attentionChoice', () => {
  it('asks a question comparing the highest-consequence topic against a named lower-priority item, not an absolute instruction', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([
      { id: 'm-inv', threadId: 't-inv' },
      { id: 'm-cred', threadId: 't-cred' },
    ])
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => (
      id === 'm-inv'
        ? buildMsg('m-inv', 'Investor MIS Q3 update', 'ir@fund.com') as never
        : buildMsg('m-cred', 'OpenAI credits expiring soon', 'billing@openai.com') as never
    ))
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    expect(briefing.attentionChoice).not.toBeNull()
    const ac = briefing.attentionChoice!
    expect(ac.primary.id).toBe('m-inv')
    expect(ac.primary.title).toMatch(/Investor MIS/i)
    expect(ac.comparison.id).toBe('m-cred')
    expect(ac.comparison.title).toMatch(/OpenAI credits/i)
    expect(ac.question).toMatch(/\?$/)
    expect(ac.question).toMatch(/Investor MIS/i)
    expect(ac.question).toMatch(/OpenAI credits/i)
    // must not be an absolute instruction
    expect(ac.question).not.toMatch(/^(Do|Go|Open|Handle|Reply|Deep-dive|Focus|Start) /)
  })

  it('is null when there is nothing to compare', async () => {
    vi.mocked(gmailMod.listMessages).mockResolvedValue([])
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))
    expect(briefing.attentionChoice).toBeNull()
  })
})

function buildLabeledMsg(id: string, subject: string, from: string, labelIds: string[]) {
  return {
    id,
    threadId: `t-${id}`,
    labelIds,
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'Date', value: 'Sat, 11 Jul 2026 08:00:00 +0000' },
        { name: 'Message-ID', value: `<${id}@mail>` },
      ],
      body: { size: 0 },
      parts: [],
    },
  }
}

describe('multi-label fetching with source, labelIds and dedupe', () => {
  it('fetches INBOX, SENT and DRAFT with cap 100 per label and carries source + labelIds', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => {
      if (labelId === 'INBOX') return [{ id: 'in-1', threadId: 't1' }]
      if (labelId === 'SENT') return [{ id: 'sn-1', threadId: 't2' }]
      if (labelId === 'DRAFT') return [{ id: 'dr-1', threadId: 't3' }]
      return []
    })
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => {
      if (id === 'in-1') return buildLabeledMsg('in-1', 'Hi', 'a@b.com', ['INBOX', 'IMPORTANT']) as never
      if (id === 'sn-1') return buildLabeledMsg('sn-1', 'Re: proposal', 'ajit@me.com', ['SENT']) as never
      return buildLabeledMsg('dr-1', 'draft body', 'ajit@me.com', ['DRAFT']) as never
    })
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const bySource = new Map(briefing.inboxItems.map(i => [i.source, i]))
    expect(bySource.get('INBOX')?.labelIds).toEqual(['INBOX', 'IMPORTANT'])
    expect(bySource.get('SENT')?.labelIds).toEqual(['SENT'])
    expect(bySource.get('DRAFT')?.labelIds).toEqual(['DRAFT'])

    const calls = vi.mocked(gmailMod.listMessages).mock.calls
    for (const label of ['INBOX', 'SENT', 'DRAFT']) {
      const call = calls.find(c => c[3] === label)
      expect(call, `expected a listMessages call for ${label}`).toBeDefined()
      expect(call![0]).toBe(100)
    }
  })

  it('dedupes messages that appear under more than one label by message id', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => {
      if (labelId === 'INBOX') return [{ id: 'shared', threadId: 't-shared' }]
      if (labelId === 'SENT') return [{ id: 'shared', threadId: 't-shared' }]
      return []
    })
    vi.mocked(gmailMod.getMessage).mockResolvedValue(
      buildLabeledMsg('shared', 'shared subject', 'a@b.com', ['INBOX', 'SENT']) as never,
    )
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const shared = briefing.inboxItems.filter(i => i.messageId === 'shared')
    expect(shared).toHaveLength(1)
    expect(vi.mocked(gmailMod.getMessage).mock.calls).toHaveLength(1)
  })
})

describe('DRAFT scoring guard', () => {
  it('never applies commitment score to a DRAFT item', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'DRAFT' ? [{ id: 'd-commit', threadId: 't-d' }] : []))
    vi.mocked(gmailMod.getMessage).mockResolvedValue(
      buildLabeledMsg(
        'd-commit',
        'Will send action item follow-up shortly',
        'ajit@me.com',
        ['DRAFT'],
      ) as never,
    )
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const draft = briefing.ranked.find(r => r.id === 'd-commit')
    expect(draft).toBeDefined()
    expect(draft!.reasons).not.toContain('commitment')
  })
})

describe('noise cannot cancel a high-consequence signal', () => {
  it('does not penalize an investor MIS subject that also mentions unsubscribe/noreply noise', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'mis', threadId: 't-mis' },
          { id: 'creds', threadId: 't-creds' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => (
      id === 'mis'
        ? buildLabeledMsg(
            'mis',
            'Investor MIS Q3 update — click to unsubscribe from noreply list',
            'ir@fund.com',
            ['INBOX'],
          ) as never
        : buildLabeledMsg('creds', 'OpenAI credits expiring soon', 'billing@openai.com', ['INBOX']) as never
    ))
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const mis = briefing.ranked.find(r => r.id === 'mis')!
    const creds = briefing.ranked.find(r => r.id === 'creds')!
    expect(mis.reasons).toContain('investor-consequence')
    expect(mis.reasons).not.toContain('noise')
    expect(mis.score).toBeGreaterThan(0)
    expect(mis.score).toBeGreaterThan(creds.score)
  })

  it('does not penalize a travel subject that also mentions a noise word like noreply', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX' ? [{ id: 'trip', threadId: 't-trip' }] : []))
    vi.mocked(gmailMod.getMessage).mockResolvedValue(
      buildLabeledMsg(
        'trip',
        'Your e-ticket confirmation (sent from a noreply address)',
        'noreply@airindia.in',
        ['INBOX'],
      ) as never,
    )
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const trip = briefing.ranked.find(r => r.id === 'trip')!
    expect(trip.reasons).toContain('travel')
    expect(trip.reasons).not.toContain('noise')
    expect(trip.score).toBeGreaterThan(0)
  })
})

describe('tightened travel matching', () => {
  it('does not classify a generic meeting booking as travel', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX' ? [{ id: 'mtg', threadId: 't-mtg' }] : []))
    vi.mocked(gmailMod.getMessage).mockResolvedValue(
      buildLabeledMsg('mtg', 'Meeting booking with Sanjay', 'sanjay@work.com', ['INBOX']) as never,
    )
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const mtg = briefing.ranked.find(r => r.id === 'mtg')!
    expect(mtg.reasons).not.toContain('travel')
    expect(mtg.isTravel).toBe(false)
  })
})

describe('attentionChoice only against real low-priority items', () => {
  it('is null when the second-place item is not a real low-priority (score > 0)', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'mis-1', threadId: 't1' },
          { id: 'mis-2', threadId: 't2' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => (
      id === 'mis-1'
        ? buildLabeledMsg('mis-1', 'Investor MIS Q3 update', 'ir1@fund.com', ['INBOX']) as never
        : buildLabeledMsg('mis-2', 'Investor MIS Q2 update', 'ir2@fund.com', ['INBOX']) as never
    ))
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    expect(briefing.attentionChoice).toBeNull()
  })
})

describe('marketing (CATEGORY_PROMOTIONS) vs real operational travel', () => {
  it('ranks a confirmed e-ticket item above a CATEGORY_PROMOTIONS Flight Bookings marketing subject', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'ticket', threadId: 't-ticket' },
          { id: 'promo', threadId: 't-promo' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => (
      id === 'ticket'
        ? buildLabeledMsg(
            'ticket',
            'Your Air India e-ticket confirmation',
            'noreply@airindia.in',
            ['INBOX', 'CATEGORY_UPDATES'],
          ) as never
        : buildLabeledMsg(
            'promo',
            'Introducing Flight Bookings on WhatsApp',
            'promo@whatsapp.com',
            ['INBOX', 'CATEGORY_PROMOTIONS'],
          ) as never
    ))
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    const ticket = briefing.ranked.find(r => r.id === 'ticket')!
    const promo = briefing.ranked.find(r => r.id === 'promo')!

    expect(ticket.reasons).toContain('travel')
    expect(ticket.isTravel).toBe(true)
    expect(promo.reasons).not.toContain('travel')
    expect(promo.isTravel).toBe(false)
    expect(promo.score).toBeLessThanOrEqual(0)
    expect(ticket.score).toBeGreaterThan(promo.score)
    expect(briefing.ranked[0].id).toBe('ticket')
  })
})

describe('attentionChoice comparator relevance', () => {
  it('prefers an OpenAI credits comparator over an unrelated generic newsletter', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'mis', threadId: 't-mis' },
          { id: 'creds', threadId: 't-creds' },
          { id: 'news', threadId: 't-news' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => {
      if (id === 'mis') return buildLabeledMsg('mis', 'Investor MIS Q3 update', 'ir@fund.com', ['INBOX']) as never
      if (id === 'creds') return buildLabeledMsg('creds', 'OpenAI credits expiring soon', 'billing@openai.com', ['INBOX']) as never
      return buildLabeledMsg('news', 'Weekly product newsletter — unsubscribe here', 'news@blog.com', ['INBOX']) as never
    })
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    expect(briefing.attentionChoice).not.toBeNull()
    expect(briefing.attentionChoice!.primary.id).toBe('mis')
    expect(briefing.attentionChoice!.comparison.id).toBe('creds')
  })

  it('prefers a job alert comparator over an unrelated generic newsletter', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'mis', threadId: 't-mis' },
          { id: 'news', threadId: 't-news' },
          { id: 'job', threadId: 't-job' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => {
      if (id === 'mis') return buildLabeledMsg('mis', 'Investor MIS Q3 update', 'ir@fund.com', ['INBOX']) as never
      if (id === 'job') return buildLabeledMsg('job', 'Job alert: new roles matching your profile', 'jobs@linkedin.com', ['INBOX']) as never
      return buildLabeledMsg('news', 'Weekly newsletter — unsubscribe here', 'news@blog.com', ['INBOX']) as never
    })
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    expect(briefing.attentionChoice).not.toBeNull()
    expect(briefing.attentionChoice!.comparison.id).toBe('job')
  })

  it('prefers an API spend / balance alert comparator over a generic newsletter', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'mis', threadId: 't-mis' },
          { id: 'news', threadId: 't-news' },
          { id: 'spend', threadId: 't-spend' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => {
      if (id === 'mis') return buildLabeledMsg('mis', 'Investor MIS Q3 update', 'ir@fund.com', ['INBOX']) as never
      if (id === 'spend') return buildLabeledMsg('spend', 'API spend alert: monthly balance threshold reached', 'billing@openai.com', ['INBOX']) as never
      return buildLabeledMsg('news', 'Weekly newsletter — unsubscribe here', 'news@blog.com', ['INBOX']) as never
    })
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    expect(briefing.attentionChoice).not.toBeNull()
    expect(briefing.attentionChoice!.comparison.id).toBe('spend')
  })

  it('returns null when the only low-priority comparator is a generic newsletter', async () => {
    vi.mocked(gmailMod.listMessages).mockImplementation(async (
      _max?: number,
      _after?: Date,
      _before?: Date,
      labelId?: string,
    ) => (labelId === 'INBOX'
      ? [
          { id: 'mis', threadId: 't-mis' },
          { id: 'news', threadId: 't-news' },
        ]
      : []))
    vi.mocked(gmailMod.getMessage).mockImplementation(async (id: string) => (
      id === 'mis'
        ? buildLabeledMsg('mis', 'Investor MIS Q3 update', 'ir@fund.com', ['INBOX']) as never
        : buildLabeledMsg('news', 'Weekly product newsletter — unsubscribe here', 'news@blog.com', ['INBOX']) as never
    ))
    vi.mocked(calMod.listUpcomingEvents).mockResolvedValue([])
    vi.mocked(calMod.detectConflicts).mockReturnValue([])

    const { getCareerBriefing } = await import('@/lib/career-service')
    const briefing = await getCareerBriefing(new Date('2026-07-12T09:00:00Z'))

    expect(briefing.attentionChoice).toBeNull()
  })
})

describe('saveDraftReply', () => {
  it('delegates to createDraftReply and returns draft id', async () => {
    vi.mocked(gmailMod.createDraftReply).mockResolvedValue({ id: 'draft-99', message: { threadId: THREAD_ID } } as never)

    const { saveDraftReply } = await import('@/lib/career-service')
    const result = await saveDraftReply('msg-001', 'Here is my reply.')

    expect(gmailMod.createDraftReply).toHaveBeenCalledWith('msg-001', 'Here is my reply.')
    expect(result.id).toBe('draft-99')
  })
})
