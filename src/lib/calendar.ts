import 'server-only'
import { getAccessToken } from './google-auth'

const BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

export interface Conflict {
  a: CalendarEvent
  b: CalendarEvent
}

async function authedFetch(url: string): Promise<Response> {
  const token = await getAccessToken()
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function listUpcomingEvents(
  maxResults = 20,
  timeMin: Date = new Date(),
  timeMax?: Date,
): Promise<CalendarEvent[]> {
  const url = new URL(`${BASE}/calendars/primary/events`)
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('timeMin', timeMin.toISOString())
  if (timeMax) url.searchParams.set('timeMax', timeMax.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  const res = await authedFetch(url.toString())
  if (!res.ok) throw new Error(`listUpcomingEvents failed: ${res.status}`)
  const data = (await res.json()) as { items?: CalendarEvent[] }
  return (data.items ?? []).sort(
    (a, b) =>
      new Date(a.start.dateTime ?? a.start.date ?? 0).getTime() -
      new Date(b.start.dateTime ?? b.start.date ?? 0).getTime(),
  )
}

export function detectConflicts(events: CalendarEvent[]): Conflict[] {
  const conflicts: Conflict[] = []
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]
      const b = events[j]
      const aStart = new Date(a.start.dateTime ?? a.start.date ?? 0).getTime()
      const aEnd = new Date(a.end.dateTime ?? a.end.date ?? 0).getTime()
      const bStart = new Date(b.start.dateTime ?? b.start.date ?? 0).getTime()
      const bEnd = new Date(b.end.dateTime ?? b.end.date ?? 0).getTime()
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({ a, b })
      }
    }
  }
  return conflicts
}
