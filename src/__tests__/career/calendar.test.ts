import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/google-auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

const base = new Date('2026-07-12T09:00:00Z')
const h = (n: number) => new Date(base.getTime() + n * 60 * 60 * 1000).toISOString()

const EVENTS = [
  { id: 'e1', summary: 'Standup', start: { dateTime: h(0) }, end: { dateTime: h(1) } },
  { id: 'e2', summary: 'Deep Work', start: { dateTime: h(0.5) }, end: { dateTime: h(2) } }, // overlaps e1
  { id: 'e3', summary: 'Lunch', start: { dateTime: h(3) }, end: { dateTime: h(4) } },
]

beforeEach(() => {
  vi.resetModules()
  global.fetch = vi.fn()
})

describe('listUpcomingEvents', () => {
  it('returns events sorted by start time', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: EVENTS }),
    } as unknown as Response)

    const { listUpcomingEvents } = await import('@/lib/calendar')
    const events = await listUpcomingEvents()
    expect(events).toHaveLength(3)
    expect(events[0].id).toBe('e1')
  })

  it('returns empty array when no events', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response)

    const { listUpcomingEvents } = await import('@/lib/calendar')
    expect(await listUpcomingEvents()).toEqual([])
  })
})

describe('listUpcomingEvents 48h control window', () => {
  it('passes both timeMin and timeMax to the calendar API when provided', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response)

    const now = new Date('2026-07-12T09:00:00Z')
    const timeMin = new Date(now.getTime() - 48 * 3_600_000)
    const timeMax = new Date(now.getTime() + 48 * 3_600_000)

    const { listUpcomingEvents } = await import('@/lib/calendar')
    await listUpcomingEvents(50, timeMin, timeMax)

    const calledUrl = fetchMock.mock.calls[0][0] as string
    const parsed = new URL(calledUrl)
    expect(parsed.searchParams.get('timeMin')).toBe(timeMin.toISOString())
    expect(parsed.searchParams.get('timeMax')).toBe(timeMax.toISOString())
  })
})

describe('detectConflicts', () => {
  it('identifies overlapping events', async () => {
    const { detectConflicts } = await import('@/lib/calendar')
    const conflicts = detectConflicts(EVENTS)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].a.id).toBe('e1')
    expect(conflicts[0].b.id).toBe('e2')
  })

  it('returns no conflicts for non-overlapping events', async () => {
    const { detectConflicts } = await import('@/lib/calendar')
    const nonOverlap = [EVENTS[0], EVENTS[2]]
    expect(detectConflicts(nonOverlap)).toHaveLength(0)
  })
})
