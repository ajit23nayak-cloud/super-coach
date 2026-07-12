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

describe('saveDraftReply', () => {
  it('delegates to createDraftReply and returns draft id', async () => {
    vi.mocked(gmailMod.createDraftReply).mockResolvedValue({ id: 'draft-99', message: { threadId: THREAD_ID } } as never)

    const { saveDraftReply } = await import('@/lib/career-service')
    const result = await saveDraftReply('msg-001', 'Here is my reply.')

    expect(gmailMod.createDraftReply).toHaveBeenCalledWith('msg-001', 'Here is my reply.')
    expect(result.id).toBe('draft-99')
  })
})
