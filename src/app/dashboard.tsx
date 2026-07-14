'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HealthSnapshot } from '@/lib/health-normalizer'
import type { BodyAssessment } from '@/lib/body-assessment'
import type {
  AgentRun,
  CalEvent,
  CareerData,
  Decision,
  InboxItem,
  StoredCheckIn,
} from './page'

type Mode = 'Body' | 'Mind' | 'Career' | 'Super'
type BodyData = { snapshot: HealthSnapshot; assessment: BodyAssessment; rows: number }

const modes: Mode[] = ['Body', 'Mind', 'Career', 'Super']

function fmtTime(value: string | number | null | undefined) {
  if (!value) return 'No reading'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function metricLabel(metric: { value: number; at: string | null } | null, unit: string) {
  return metric ? `${metric.value} ${unit}` : 'No reading'
}

export default function Dashboard({
  body,
  decisions,
  checkIns,
  runs,
  career,
  fetchedAt,
}: {
  body: BodyData
  decisions: Decision[]
  checkIns: StoredCheckIn[]
  runs: AgentRun[]
  career: CareerData
  fetchedAt: number
}) {
  const router = useRouter()
  const [active, setActive] = useState<Mode>('Body')

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 4000)
    return () => window.clearInterval(id)
  }, [router])

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
          <div><strong>Hermes online</strong><small>Telegram is the coach · Web mirrors</small></div>
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
        <p>Last refresh {fmtTime(fetchedAt)} · auto-refreshes every 4s</p>
        <button className="text-button" onClick={() => router.refresh()}>Refresh now</button>
      </div>

      {active === 'Body' && (
        <section className="panel" aria-labelledby="body-title">
          <div className="panel-heading">
            <div><p className="kicker">GABIT RING · CONVEX</p><h2 id="body-title">Body signal</h2></div>
            <span className="badge">{body.rows} source rows</span>
          </div>
          <div className="metric-grid">
            <MetricCard label="Heart rate" value={metricLabel(body.snapshot.hr, 'bpm')} at={body.snapshot.hr?.at ?? null} />
            <MetricCard label="HRV" value={metricLabel(body.snapshot.hrv, 'ms')} at={body.snapshot.hrv?.at ?? null} />
            <MetricCard label="Resting HR" value={metricLabel(body.snapshot.rhr, 'bpm')} at={body.snapshot.rhr?.at ?? null} />
            <MetricCard
              label="Sleep"
              value={body.snapshot.sleep.durationMinutes == null ? 'No reading' : `${body.snapshot.sleep.durationMinutes} min`}
              at={body.snapshot.sleep.at ?? null}
            />
          </div>
          <div className="coach-line">
            <strong>Coach line</strong>
            <p>
              {body.snapshot.sleep.durationMinutes != null && body.snapshot.sleep.durationMinutes < 360
                ? 'The latest sleep payload is under six hours. Protect one recovery block before adding another commitment.'
                : 'No strong recovery warning is supported by the latest payload.'}
            </p>
          </div>
        </section>
      )}

      {active === 'Mind' && (
        <section className="panel" aria-labelledby="mind-title">
          <div className="panel-heading">
            <div><p className="kicker">CHECK-IN · DECISION LOG</p><h2 id="mind-title">Mind signal</h2></div>
            <span className="badge">{decisions.length} decisions · {checkIns.length} check-ins</span>
          </div>

          <p className="mind-helper" style={{ marginBottom: 20 }}>
            Interactive check-ins happen in Telegram. This page mirrors what Telegram has written to Convex — new
            entries appear here within seconds.
          </p>

          <div className="mind-columns">
            <div>
              <h3>Decision log</h3>
              <div className="list">
                {decisions.slice(0, 5).map(item => (
                  <article key={item._id}>
                    <span className={`state ${item.status}`}>{item.status}</span>
                    <div>
                      <strong>{item.decision}</strong>
                      <small>{fmtTime(item.createdAt)}{item.linkedMood ? ` · ${item.linkedMood}` : ''}</small>
                    </div>
                  </article>
                ))}
                {decisions.length === 0 && <p className="empty">No decisions logged yet.</p>}
              </div>
            </div>
            <div>
              <h3>Recent check-ins</h3>
              <div className="list">
                {checkIns.slice(0, 5).map((item, index) => (
                  <article key={item._id ?? item.id ?? index}>
                    <span className="state">{item.selectedChoice}</span>
                    <div>
                      <strong>{item.stateWord} · {item.activeSelf} · E{item.energy}/P{item.positiveEmotion}</strong>
                      <small>{item.createdAt ? fmtTime(item.createdAt) : ''}</small>
                    </div>
                  </article>
                ))}
                {checkIns.length === 0 && <p className="empty">No check-ins yet.</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      {active === 'Career' && (
        <section className="panel" aria-labelledby="career-title">
          <div className="panel-heading">
            <div><p className="kicker">GMAIL · CALENDAR</p><h2 id="career-title">Career signal</h2></div>
            <span className="badge">Read-only mirror</span>
          </div>
          <div className="split">
            <div>
              <h3>Inbox requiring review</h3>
              <div className="list">
                {career.inboxItems.slice(0, 6).map((item: InboxItem) => (
                  <article key={item.messageId}>
                    <span className="source">MAIL</span>
                    <div>
                      <strong>{item.subject || 'No subject'}</strong>
                      <small>{item.from} · {fmtTime(item.date)}</small>
                    </div>
                  </article>
                ))}
                {career.inboxItems.length === 0 && (
                  <p className="empty">No inbox data. Career sweep runs in Telegram.</p>
                )}
              </div>
            </div>
            <div>
              <h3>Calendar conflicts</h3>
              {career.conflicts.length ? (
                <div className="list">
                  {career.conflicts.map(({ a, b }: { a: CalEvent; b: CalEvent }) => (
                    <article key={`${a.id}-${b.id}`}>
                      <span className="source conflict">CLASH</span>
                      <div>
                        <strong>{a.summary || 'Untitled'} overlaps {b.summary || 'Untitled'}</strong>
                        <small>{fmtTime(a.start.dateTime ?? a.start.date ?? null)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty">No conflict in the loaded window.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {active === 'Super' && (
        <section className="panel super-panel" aria-labelledby="super-title">
          <div className="panel-heading">
            <div><p className="kicker">PARALLEL ORCHESTRATION</p><h2 id="super-title">Super mode</h2></div>
            <span className="badge accent">One batch · three agents</span>
          </div>
          <p className="super-copy">
            Super does not summarize each domain independently. It launches Body, Mind, and Career in one parallel
            Hermes delegation batch, waits for all three, and produces a cross-domain insight only when the evidence
            supports one.
          </p>
          <div className="readiness">
            <Ready label="Body" ready={body.rows > 0} detail={`${body.rows} Convex rows read`} />
            <Ready label="Mind" ready={decisions.length > 0} detail={`${decisions.length} decisions read`} />
            <Ready label="Career" ready={career.inboxItems.length > 0} detail={`${career.inboxItems.length} mails, ${career.events.length} events`} />
          </div>
          <div className="trace">
            <h3>Latest delegation trace</h3>
            {runs.slice(0, 4).map(run => (
              <article key={run._id}>
                <span className={run.status === 'passed' ? 'ready-dot ready' : 'ready-dot'} />
                <strong>{run.agent}</strong>
                <small>
                  {run.latencyMs == null ? 'Latency unavailable' : `${(run.latencyMs / 1000).toFixed(2)}s`} · {run.status ?? 'unknown'}
                </small>
              </article>
            ))}
          </div>
          <div className="telegram-callout">
            <div>
              <strong>Run the orchestration in Telegram</strong>
              <p>Tap Super in the persistent four-button menu. Hermes launches the three sub-agents and returns the evidenced synthesis in that conversation. This page mirrors what gets written.</p>
            </div>
            <span>Menu message 103</span>
          </div>
        </section>
      )}
    </main>
  )
}

function MetricCard({ label, value, at }: { label: string; value: string; at: string | null }) {
  return (
    <article className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{fmtTime(at)}</small>
    </article>
  )
}

function Ready({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <article>
      <span className={ready ? 'ready-dot ready' : 'ready-dot'} />
      <div><strong>{label}</strong><small>{detail}</small></div>
    </article>
  )
}
