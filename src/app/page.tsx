'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { ActiveSelf, MindChoiceFrame, SelectedChoice } from '@/lib/mind'
import {
  buildDiagnosePayload,
  buildSelectionPayload,
  isDiagnoseReady,
  type DiagnosePayload,
  type MindFormState,
} from '@/lib/mind-form'
import { bearerHeaders, isUnauthorized, readToken, writeToken } from '@/lib/client-auth'

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
type StoredCheckIn = {
  _id?: string
  id?: string
  createdAt?: number
  energy: number
  positiveEmotion: number
  stateWord: string
  activeSelf: ActiveSelf
  shipIntent?: string
  hedgedDecision?: string
  diagnosis: string
  choiceA: string
  choiceB: string
  selectedChoice: SelectedChoice
}
type CheckInsData = { checkIns: StoredCheckIn[] }
type ErrorPayload = { error?: string }
type DecisionResponse = ErrorPayload & { handoff?: string }

const ACTIVE_SELVES: readonly ActiveSelf[] = ['operator', 'athlete', 'father', 'writer']
const SCORES: readonly number[] = [1, 2, 3, 4, 5]
const ENERGY_LABELS: Record<number, string> = { 1: 'depleted', 5: 'highly energized' }
const POSITIVE_LABELS: Record<number, string> = { 1: 'none or very low', 5: 'strong' }
const EMPTY_FORM: MindFormState = {
  energy: null,
  positiveEmotion: null,
  stateWord: '',
  activeSelf: null,
  shipIntent: '',
  hedgedDecision: '',
}

const modes: Mode[] = ['Body', 'Mind', 'Career', 'Super']

function fmtTime(value: string | number | null) {
  if (!value) return 'No reading'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function metric(metric: Metric, unit: string) {
  return metric ? `${metric.value} ${unit}` : 'No reading'
}

function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export default function Home() {
  const [active, setActive] = useState<Mode>('Body')
  const [body, setBody] = useState<BodyData | null>(null)
  const [mind, setMind] = useState<MindData | null>(null)
  const [career, setCareer] = useState<CareerData | null>(null)
  const [runs, setRuns] = useState<RunsData | null>(null)
  const [checkIns, setCheckIns] = useState<StoredCheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState('')
  const [handoff, setHandoff] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [checkInForm, setCheckInForm] = useState<MindFormState>(EMPTY_FORM)
  const [frame, setFrame] = useState<MindChoiceFrame | null>(null)
  const [diagnosedInputs, setDiagnosedInputs] = useState<DiagnosePayload | null>(null)
  const [checkInHandoff, setCheckInHandoff] = useState<string | null>(null)
  const [checkInError, setCheckInError] = useState<string | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [committing, setCommitting] = useState<SelectedChoice | null>(null)
  const [resetting, setResetting] = useState(false)
  const [token, setToken] = useState<string | null>(() => readToken(sessionStore()))
  const [tokenDraft, setTokenDraft] = useState('')
  const [needsToken, setNeedsToken] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const updateForm = useCallback(<K extends keyof MindFormState>(key: K, value: MindFormState[K]) => {
    setCheckInForm(prev => ({ ...prev, [key]: value }))
    setFrame(null)
    setDiagnosedInputs(null)
    setCheckInHandoff(null)
    setCheckInError(null)
  }, [])

  const refresh = useCallback(async (activeToken: string | null, silent: boolean = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const headers = bearerHeaders(activeToken)
      const responses = await Promise.all([
        fetch('/api/body', { cache: 'no-store', headers }),
        fetch('/api/mind', { cache: 'no-store', headers }),
        fetch('/api/career', { cache: 'no-store', headers }),
      ])
      const primaryUnauthorized = responses.some(response => isUnauthorized(response.status))
      if (primaryUnauthorized) {
        writeToken(sessionStore(), null)
        setToken(null)
        setNeedsToken(true)
        setAuthError(activeToken ? 'That access token was not accepted.' : 'An access token is required.')
        return
      }
      const payloads = await Promise.all([
        readJson<BodyData & ErrorPayload>(responses[0]),
        readJson<MindData & ErrorPayload>(responses[1]),
        readJson<CareerData & ErrorPayload>(responses[2]),
      ])
      const failed = responses.findIndex(response => !response.ok)
      if (failed >= 0) throw new Error(payloads[failed]?.error ?? 'A mode failed to load')
      setBody(payloads[0])
      setMind(payloads[1])
      setCareer(payloads[2])
      setNeedsToken(false)
      setAuthError(null)
      try {
        const runsResponse = await fetch('/api/runs', { cache: 'no-store', headers })
        setRuns(runsResponse.ok ? await readJson<RunsData>(runsResponse) : { runs: [] })
      } catch {
        setRuns({ runs: [] })
      }
      try {
        const checkInsResponse = await fetch('/api/mind/check-in', { cache: 'no-store', headers })
        if (checkInsResponse.ok) {
          const payload = (await checkInsResponse.json()) as CheckInsData
          setCheckIns(Array.isArray(payload.checkIns) ? payload.checkIns : [])
        } else {
          setCheckIns([])
        }
      } catch {
        setCheckIns([])
      }
      setLastRefreshed(Date.now())
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : 'Unable to load live data')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(readToken(sessionStore())), 0)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh(readToken(sessionStore()), true)
      }
    }, 4000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [refresh])

  async function submitToken(event: FormEvent) {
    event.preventDefault()
    const next = tokenDraft.trim()
    if (!next) return
    writeToken(sessionStore(), next)
    setToken(next)
    setTokenDraft('')
    setAuthError(null)
    await refresh(next)
  }

  async function saveDecision(event: FormEvent) {
    event.preventDefault()
    if (!decision.trim()) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/mind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
        body: JSON.stringify({ decision, status: 'open', linkedMood: 'check-in' }),
      })
      if (isUnauthorized(response.status)) {
        writeToken(sessionStore(), null)
        setToken(null)
        setNeedsToken(true)
        setAuthError('That access token was not accepted.')
        return
      }
      const payload = await readJson<DecisionResponse>(response)
      if (!response.ok) throw new Error(payload.error ?? 'Decision was not saved')
      if (typeof payload.handoff === 'string' && payload.handoff) {
        setHandoff(payload.handoff)
      } else {
        setHandoff(null)
      }
      setDecision('')
      await refresh(token)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Decision was not saved')
    } finally {
      setSaving(false)
    }
  }

  async function diagnose(event: FormEvent) {
    event.preventDefault()
    if (!isDiagnoseReady(checkInForm)) return
    setCheckInError(null)
    setFrame(null)
    setCheckInHandoff(null)
    setDiagnosing(true)
    try {
      const payload = buildDiagnosePayload(checkInForm)
      const response = await fetch('/api/mind/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as {
        frame?: MindChoiceFrame
        handoff?: string
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? 'Check-in was not diagnosed')
      if (typeof data.handoff === 'string' && data.handoff) {
        setCheckInHandoff(data.handoff)
        setFrame(null)
        setDiagnosedInputs(null)
        return
      }
      if (data.frame) {
        setFrame(data.frame)
        setDiagnosedInputs(payload)
      }
    } catch (caught) {
      setCheckInError(caught instanceof Error ? caught.message : 'Check-in was not diagnosed')
    } finally {
      setDiagnosing(false)
    }
  }

  async function commitChoice(choice: SelectedChoice) {
    if (!diagnosedInputs) return
    setCheckInError(null)
    setCommitting(choice)
    try {
      const response = await fetch('/api/mind/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
        body: JSON.stringify(buildSelectionPayload(
          { ...diagnosedInputs, energy: diagnosedInputs.energy, positiveEmotion: diagnosedInputs.positiveEmotion },
          choice,
        )),
      })
      const data = (await response.json()) as {
        stored?: boolean
        handoff?: string
        frame?: MindChoiceFrame
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? 'Check-in was not persisted')
      if (typeof data.handoff === 'string' && data.handoff) {
        setCheckInHandoff(data.handoff)
        setFrame(null)
        setDiagnosedInputs(null)
        return
      }
      if (data.stored) {
        setFrame(null)
        setDiagnosedInputs(null)
        setCheckInForm(EMPTY_FORM)
        await refresh(token)
      }
    } catch (caught) {
      setCheckInError(caught instanceof Error ? caught.message : 'Check-in was not persisted')
    } finally {
      setCommitting(null)
    }
  }

  async function resetCheckIns() {
    if (typeof window === 'undefined') return
    const confirmed = window.confirm('Clear all structured check-ins? Decisions are not affected.')
    if (!confirmed) return
    setCheckInError(null)
    setResetting(true)
    try {
      const response = await fetch('/api/mind/check-in', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
        body: JSON.stringify({ confirm: true }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Reset failed')
      setFrame(null)
      setDiagnosedInputs(null)
      setCheckInHandoff(null)
      await refresh(token)
    } catch (caught) {
      setCheckInError(caught instanceof Error ? caught.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  if (needsToken) {
    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">LIVE CONTROL SURFACE</p>
            <h1>Super Coach</h1>
            <p className="subtitle">Access is limited to judges with a shared token.</p>
          </div>
        </header>
        <section className="panel access-panel" aria-labelledby="access-title">
          <div className="panel-heading">
            <div>
              <p className="kicker">JUDGE ACCESS</p>
              <h2 id="access-title">Enter access token</h2>
            </div>
          </div>
          <form className="access-form" onSubmit={submitToken} autoComplete="off">
            <label htmlFor="access-token">Access token</label>
            <div>
              <input
                id="access-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                value={tokenDraft}
                onChange={event => setTokenDraft(event.target.value)}
                aria-invalid={Boolean(authError)}
                aria-describedby={authError ? 'access-error' : undefined}
                placeholder="Paste the token you were given"
              />
              <button disabled={loading || !tokenDraft.trim()}>{loading ? 'Checking…' : 'Unlock dashboard'}</button>
            </div>
            {authError && <p id="access-error" className="error" role="alert">{authError}</p>}
            <p className="access-note">The token stays in this browser tab only. Close the tab to forget it.</p>
          </form>
        </section>
      </main>
    )
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
        <button className="text-button" onClick={() => void refresh(token)} disabled={loading}>Refresh evidence</button>
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
          <div className="panel-heading">
            <div>
              <p className="kicker">CHECK-IN · DECISION LOG</p>
              <h2 id="mind-title">Mind signal</h2>
            </div>
            <span className="badge">{mind?.decisions.length ?? 0} decisions · {checkIns.length} check-ins</span>
          </div>

          {checkInHandoff ? (
            <div className="crisis-handoff" role="alert">
              <strong>Immediate support</strong>
              <p>{checkInHandoff}</p>
            </div>
          ) : (
            <form className="mind-check-in" onSubmit={diagnose} aria-label="Mind check-in">
              <ScoreField
                legend="Energy"
                helper="1 depleted / 5 highly energized"
                name="energy"
                value={checkInForm.energy}
                onChange={value => updateForm('energy', value)}
                labels={ENERGY_LABELS}
              />
              <ScoreField
                legend="Positive emotion"
                helper="1 none or very low / 5 strong"
                name="positive-emotion"
                value={checkInForm.positiveEmotion}
                onChange={value => updateForm('positiveEmotion', value)}
                labels={POSITIVE_LABELS}
              />
              <div className="mind-field">
                <label htmlFor="state-word">State word</label>
                <input
                  id="state-word"
                  type="text"
                  value={checkInForm.stateWord}
                  onChange={event => updateForm('stateWord', event.target.value)}
                  placeholder="One word for how you feel"
                  maxLength={500}
                />
              </div>
              <fieldset className="mind-field mind-choice">
                <legend>Active self</legend>
                <div className="chip-row" role="radiogroup" aria-label="Active self">
                  {ACTIVE_SELVES.map(identity => (
                    <label key={identity} className={`chip ${checkInForm.activeSelf === identity ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="active-self"
                        value={identity}
                        checked={checkInForm.activeSelf === identity}
                        onChange={() => updateForm('activeSelf', identity)}
                      />
                      <span>{identity}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mind-field">
                <label htmlFor="ship-intent">Ship intention</label>
                <input
                  id="ship-intent"
                  type="text"
                  value={checkInForm.shipIntent}
                  onChange={event => updateForm('shipIntent', event.target.value)}
                  placeholder="The one thing you will ship today"
                  maxLength={500}
                />
              </div>
              <div className="mind-field">
                <label htmlFor="hedged-decision">Avoided decision</label>
                <input
                  id="hedged-decision"
                  type="text"
                  value={checkInForm.hedgedDecision}
                  onChange={event => updateForm('hedgedDecision', event.target.value)}
                  placeholder="The decision you have been avoiding"
                  maxLength={500}
                />
              </div>
              <div className="mind-actions">
                <button type="submit" disabled={diagnosing || !isDiagnoseReady(checkInForm)}>
                  {diagnosing ? 'Diagnosing…' : 'Diagnose'}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void resetCheckIns()}
                  disabled={resetting}
                >
                  {resetting ? 'Clearing…' : 'Reset check-ins'}
                </button>
              </div>
            </form>
          )}

          {checkInError && <div className="error" role="alert">{checkInError}</div>}

          {!checkInHandoff && frame && (
            <div className="mind-frame" aria-live="polite">
              <p className="mind-diagnosis">{frame.diagnosis}</p>
              <p className="mind-question"><strong>{frame.question}</strong></p>
              <div className="mind-options">
                {frame.choices.map(choice => (
                  <article key={choice.id} className="mind-option">
                    <span className="mind-option-id">Option {choice.id}</span>
                    <p className="mind-option-label">{choice.label}</p>
                    <p className="mind-option-tradeoff"><strong>Tradeoff:</strong> {choice.tradeoff}</p>
                    <button
                      type="button"
                      onClick={() => void commitChoice(choice.id)}
                      disabled={committing !== null}
                    >
                      {committing === choice.id ? 'Saving…' : `Choose ${choice.id}`}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          <form className="decision-form" onSubmit={saveDecision}>
            <label htmlFor="decision">Log the decision</label>
            <div>
              <input id="decision" value={decision} onChange={event => setDecision(event.target.value)} placeholder="The decision I will make now" />
              <button disabled={saving || !decision.trim()}>{saving ? 'Saving…' : 'Save decision'}</button>
            </div>
          </form>
          {handoff && <div className="crisis-handoff" role="alert"><strong>Immediate support</strong><p>{handoff}</p></div>}

          <div className="mind-columns">
            <div>
              <h3>Decision log</h3>
              <div className="list">
                {(mind?.decisions ?? []).slice(0, 5).map(item => (
                  <article key={item._id}>
                    <span className={`state ${item.status}`}>{item.status}</span>
                    <div>
                      <strong>{item.decision}</strong>
                      <small>{fmtTime(item.createdAt)}{item.linkedMood ? ` · ${item.linkedMood}` : ''}</small>
                    </div>
                  </article>
                ))}
                {(mind?.decisions ?? []).length === 0 && <p className="empty">No decisions logged yet.</p>}
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

function ScoreField({
  legend,
  helper,
  name,
  value,
  onChange,
  labels,
}: {
  legend: string
  helper: string
  name: string
  value: number | null
  onChange: (value: number) => void
  labels: Record<number, string>
}) {
  return (
    <fieldset className="mind-field mind-score">
      <legend>{legend}</legend>
      <p className="mind-helper">{helper}</p>
      <div className="score-row" role="radiogroup" aria-label={legend}>
        {SCORES.map(score => {
          const anchor = labels[score]
          const optionLabel = anchor ? `${score} ${anchor}` : `${score}`
          return (
            <label key={score} className={`score-chip ${value === score ? 'selected' : ''}`}>
              <input
                type="radio"
                name={name}
                value={score}
                checked={value === score}
                onChange={() => onChange(score)}
                aria-label={optionLabel}
              />
              <span className="score-value">{score}</span>
              {anchor && <span className="score-anchor">{anchor}</span>}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
