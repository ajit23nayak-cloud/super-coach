import { authorizeApiRequest } from '@/lib/api-auth'
import {
  clearMindCheckIns,
  createMindCheckIn,
  getMindCheckIns,
} from '@/lib/convex-data'
import {
  detectCrisis,
  diagnoseMindCheckIn,
  parseMindCheckInPersistence,
  validateMindCheckIn,
  type MindChoiceFrame,
  type ValidMindCheckIn,
} from '@/lib/mind'

export const dynamic = 'force-dynamic'

function frameToPersistence(frame: MindChoiceFrame): { diagnosis: string; choiceA: string; choiceB: string } {
  const a = frame.choices[0]
  const b = frame.choices[1]
  return {
    diagnosis: frame.diagnosis,
    choiceA: `${a.label} Tradeoff: ${a.tradeoff}`,
    choiceB: `${b.label} Tradeoff: ${b.tradeoff}`,
  }
}

function crisisText(input: ValidMindCheckIn): string {
  return [input.stateWord, input.shipIntent, input.hedgedDecision].filter(Boolean).join(' ')
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  try {
    return Response.json({ checkIns: await getMindCheckIns(20) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let input: ValidMindCheckIn
  try {
    input = validateMindCheckIn(payload as Record<string, unknown>)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    return Response.json({ error: message }, { status: 400 })
  }

  const handoff = detectCrisis(crisisText(input))
  if (handoff) return Response.json({ handoff, stored: false })

  const frame = diagnoseMindCheckIn(input)
  if (!input.selectedChoice) return Response.json({ frame, stored: false })

  try {
    const persistence = parseMindCheckInPersistence({
      energy: input.energy,
      positiveEmotion: input.positiveEmotion,
      stateWord: input.stateWord,
      activeSelf: input.activeSelf,
      shipIntent: input.shipIntent,
      hedgedDecision: input.hedgedDecision,
      selectedChoice: input.selectedChoice,
      ...frameToPersistence(frame),
    })
    const id = await createMindCheckIn(persistence)
    return Response.json({ id, frame, selectedChoice: input.selectedChoice, stored: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const unauthorized = authorizeApiRequest(request)
  if (unauthorized) return unauthorized

  let body: { confirm?: unknown }
  try {
    body = (await request.json()) as { confirm?: unknown }
  } catch {
    return Response.json({ error: 'confirm must be true' }, { status: 400 })
  }
  if (body?.confirm !== true) {
    return Response.json({ error: 'confirm must be true' }, { status: 400 })
  }

  try {
    const cleared = await clearMindCheckIns()
    return Response.json({ cleared })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
