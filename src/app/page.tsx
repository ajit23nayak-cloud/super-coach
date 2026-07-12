'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Mode = 'Body' | 'Mind' | 'Career' | 'Super'
type Metric = { value: number; at: string | null } | null
type BodyData = {
  snapshot: {
    hr: Metric
    hrv: Metric
    rhr: Metric
    sleep: { durationMinutes: number | null; score: number | null; at: string | null }
    receivedAt: number | null
  }
  rows: number
}
type Decision = {
  _id: string
  createdAt: number
  decision: string
  status: string
  linkedMood?: string
}
type MindData = { decisions: Decision[] }
type InboxItem = { messageId: string; from: string; subject: string; date: string }
type CalEvent = { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }
type CareerData = { inboxItems: InboxItem[]; events: CalEvent[]; conflicts: Array<{ a: CalEvent; b: CalEvent }> }
type AgentRun = { _id: string; agent: string; createdAt: number; latencyMs?: number; status?: string }
type RunsData = { runs: AgentRun[] }

const modes: Mode[] = ['Body', 'Mind', 'Career', 'Super']

function fmtTime(value: string | number | null) {
  if (!value) return 'No reading'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function metric(metric: Metric, unit: string) {
  return metric ? `${metric.value} ${unit}` : 'No reading'
}

export default function Home() {
  const [active, setActive] = useState<Mode>('Body')
  const [body, setBody] = useState<BodyData | null>(null)
  const [mind, setMind] = useState<MindData | null>(null)
  const [career, setCareer] = useState<CareerData | null>(null)
  const [runs, setRuns] = useState<RunsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState('')
  const [handoff, setHandoff] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const responses = await Promise.all([
        fetch('/api/body', { cache: 'no-store' }),
        fetch('/api/mind', { cache: 'no-store' }),
        fetch('/api/career', { cache: 'no-store' }),
      ])
      const payloads = await Promise.all(responses.map(response => response.json()))
      const failed = responses.findIndex(response => !response.ok)
      if (failed >= 0) throw new Error(payloads[failed]?.error ?? 'A mode failed to load')
      setBody(payloads[0])
      setMind(payloads[1])
      setCareer(payloads[2])
      try {
        const runsResponse = await fetch('/api/runs', { cache: 'no-store' })
        setRuns(runsResponse.ok ? await runsResponse.json() : { runs: [] })
      } catch {
        setRuns({ runs: [] })
      }
      setLastRefreshed(Date.now())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load live data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  async function saveDecision(event: FormEvent) {
    event.preventDefault()
    if (!decision.trim()) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/mind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, status: 'open', linkedMood: 'check-in' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Decision was not saved')
      if (typeof payload.handoff === 'string' && payload.handoff) {
        setHandoff(payload.handoff)
      } else {
        setHandoff(null)
      }
      setDecision('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Decision was not saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LIVE CONTROL SURFACE</p>
          <h1>Super Coach</h1>
          <p className="subtitle">Body, mind, and career evidence. One orchestrated move.</p>
        </div>
        <div className="system-state" aria-label="System status">
          <span className="status-dot" />
          <div><strong>Hermes online</strong><small>GPT-5.6 Sol · Telegram connected</small></div>
        </div>
      </header>

      <nav className="mode-nav" aria-label="Coach modes">
        {modes.map(mode => (
          <button key={mode} className={active === mode ? 'active' : ''} onClick={() => setActive(mode)}>
            <span>{mode}</span>
            <small>{mode === 'Super' ? 'Orchestrate' : 'Specialist'}</small>
          </button>
        ))}
      </nav>

      <div className="utility-row">
        <p>{loading ? 'Refreshing live sources…' : lastRefreshed ? `Last refresh ${fmtTime(lastRefreshed)}` : 'Not refreshed'}</p>
        <button className="text-button" onClick={() => void refresh()} disabled={loading}>Refresh evidence</button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}

      {active === 'Body' && (
        <section className="panel" aria-labelledby="body-title">
          <div className="panel-heading"><div><p className="kicker">GABIT RING · CONVEX</p><h2 id="body-title">Body signal</h2></div><span className="badge">{body?.rows ?? 0} source rows</span></div>
          <div className="metric-grid">
            <MetricCard label="Heart rate" value={metric(body?.snapshot.hr ?? null, 'bpm')} at={body?.snapshot.hr?.at ?? null} />
            <MetricCard label="HRV" value={metric(body?.snapshot.hrv ?? null, 'ms')} at={body?.snapshot.hrv?.at ?? null} />
            <MetricCard label="Resting HR" value={metric(body?.snapshot.rhr ?? null, 'bpm')} at={body?.snapshot.rhr?.at ?? null} />
            <MetricCard label="Sleep" value={body?.snapshot.sleep.durationMinutes == null ? 'No reading' : `${body.snapshot.sleep.durationMinutes} min`} at={body?.snapshot.sleep.at ?? null} />
          </div>
          <div className="coach-line"><strong>Coach line</strong><p>{body?.snapshot.sleep.durationMinutes != null && body.snapshot.sleep.durationMinutes < 360 ? 'The latest sleep payload is under six hours. Protect one recovery block before adding another commitment.' : 'No strong recovery warning is supported by the latest payload.'}</p></div>
        </section>
      )}

      {active === 'Mind' && (
        <section className="panel" aria-labelledby="mind-title">
          <div className="panel-heading"><div><p className="kicker">CHECK-IN · DECISION LOG</p><h2 id="mind-title">Mind signal</h2></div><span className="badge">{mind?.decisions.length ?? 0} decisions</span></div>
          <div className="question-list">
            <p><span>01</span>In a word, what state are you in, and which version of you is running today: operator, athlete, father, or writer?</p>
            <p><span>02</span>What is the one thing you will ship today, not plan, ship, and the decision you have been hedging that you will make now?</p>
          </div>
          <form className="decision-form" onSubmit={saveDecision}>
            <label htmlFor="decision">Log the decision</label>
            <div><input id="decision" value={decision} onChange={event => setDecision(event.target.value)} placeholder="The decision I will make now" /><button disabled={saving || !decision.trim()}>{saving ? 'Saving…' : 'Save decision'}</button></div>
          </form>
          {handoff && <div className="crisis-handoff" role="alert"><strong>Immediate support</strong><p>{handoff}</p></div>}
          <div className="list">
            {(mind?.decisions ?? []).slice(0, 5).map(item => <article key={item._id}><span className={`state ${item.status}`}>{item.status}</span><div><strong>{item.decision}</strong><small>{fmtTime(item.createdAt)}{item.linkedMood ? ` · ${item.linkedMood}` : ''}</small></div></article>)}
          </div>
        </section>
      )}

      {active === 'Career' && (
        <section className="panel" aria-labelledby="career-title">
          <div className="panel-heading"><div><p className="kicker">GMAIL · CALENDAR</p><h2 id="career-title">Career signal</h2></div><span className="badge">Draft only until confirmed</span></div>
          <div className="split">
            <div><h3>Inbox requiring review</h3><div className="list">{(career?.inboxItems ?? []).slice(0, 6).map(item => <article key={item.messageId}><span className="source">MAIL</span><div><strong>{item.subject || 'No subject'}</strong><small>{item.from} · {fmtTime(item.date)}</small></div></article>)}</div></div>
            <div><h3>Calendar conflicts</h3>{career?.conflicts.length ? <div className="list">{career.conflicts.map(({ a, b }) => <article key={`${a.id}-${b.id}`}><span className="source conflict">CLASH</span><div><strong>{a.summary || 'Untitled'} overlaps {b.summary || 'Untitled'}</strong><small>{fmtTime(a.start.dateTime ?? a.start.date ?? null)}</small></div></article>)}</div> : <p className="empty">No conflict in the loaded window.</p>}</div>
          </div>
        </section>
      )}

      {active === 'Super' && (
        <section className="panel super-panel" aria-labelledby="super-title">
          <div className="panel-heading"><div><p className="kicker">PARALLEL ORCHESTRATION</p><h2 id="super-title">Super mode</h2></div><span className="badge accent">One batch · three agents</span></div>
          <p className="super-copy">Super does not summarize each domain independently. It launches Body, Mind, and Career in one parallel Hermes delegation batch, waits for all three, and produces a cross-domain insight only when the evidence supports one.</p>
          <div className="readiness">
            <Ready label="Body" ready={Boolean(body)} detail={body ? `${body.rows} Convex rows read` : 'Waiting for health data'} />
            <Ready label="Mind" ready={Boolean(mind)} detail={mind ? `${mind.decisions.length} decisions read` : 'Waiting for decision log'} />
            <Ready label="Career" ready={Boolean(career)} detail={career ? `${career.inboxItems.length} mails, ${career.events.length} events` : 'Waiting for Workspace'} />
          </div>
          <div className="trace">
            <h3>Latest delegation trace</h3>
            {(runs?.runs ?? []).slice(0, 4).map(run => (
              <article key={run._id}>
                <span className={run.status === 'passed' ? 'ready-dot ready' : 'ready-dot'} />
                <strong>{run.agent}</strong>
                <small>{run.latencyMs == null ? 'Latency unavailable' : `${(run.latencyMs / 1000).toFixed(2)}s`} · {run.status ?? 'unknown'}</small>
              </article>
            ))}
          </div>
          <div className="telegram-callout"><div><strong>Run the orchestration in Telegram</strong><p>Tap Super in the persistent four-button menu. Hermes will launch the three sub-agents and return the evidenced synthesis in that conversation.</p></div><span>Menu message 103</span></div>
        </section>
      )}
    </main>
  )
}

function MetricCard({ label, value, at }: { label: string; value: string; at: string | null }) {
  return <article className="metric"><p>{label}</p><strong>{value}</strong><small>{fmtTime(at)}</small></article>
}

function Ready({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return <article><span className={ready ? 'ready-dot ready' : 'ready-dot'} /><div><strong>{label}</strong><small>{detail}</small></div></article>
}
