export const CRISIS_HANDOFF =
  "I'm not the right support for this and I don't want to be. In India: iCall +91-9152987821 (Mon–Sat, 8am–10pm) or Vandrevala Foundation 1860-2662-345 (24/7). If you're in immediate danger, call 112. I'll stay here and I'll wait for you."

export type DecisionStatus = 'open' | 'made' | 'deferred'

export interface DecisionInput {
  decision?: unknown
  status?: unknown
  outcome?: unknown
  linkedMood?: unknown
}

export function validateDecisionInput(input: DecisionInput): {
  decision: string
  status: DecisionStatus
  outcome?: string
  linkedMood?: string
} {
  const decision = typeof input.decision === 'string' ? input.decision.trim() : ''
  if (!decision) throw new Error('Decision is required')
  if (input.status !== 'open' && input.status !== 'made' && input.status !== 'deferred') {
    throw new Error('Status must be open, made, or deferred')
  }
  const result: {
    decision: string
    status: DecisionStatus
    outcome?: string
    linkedMood?: string
  } = { decision, status: input.status }
  if (typeof input.outcome === 'string' && input.outcome.trim()) result.outcome = input.outcome.trim()
  if (typeof input.linkedMood === 'string' && input.linkedMood.trim()) {
    result.linkedMood = input.linkedMood.trim()
  }
  return result
}

export type ActiveSelf = 'operator' | 'athlete' | 'father' | 'writer'
export type SelectedChoice = 'A' | 'B'

export interface MindCheckInInput {
  energy?: unknown
  positiveEmotion?: unknown
  stateWord?: unknown
  activeSelf?: unknown
  shipIntent?: unknown
  hedgedDecision?: unknown
  selectedChoice?: unknown
}

export interface ValidMindCheckIn {
  energy: number
  positiveEmotion: number
  stateWord: string
  activeSelf: ActiveSelf
  shipIntent?: string
  hedgedDecision?: string
  selectedChoice?: SelectedChoice
}

const ACTIVE_SELVES: readonly ActiveSelf[] = ['operator', 'athlete', 'father', 'writer']

function score(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new Error(`${name} must be an integer from 1 to 5`)
  }
  return value as number
}

function requiredText(value: unknown, name: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) throw new Error(`${name} is required`)
  if (trimmed.length > 500) throw new Error(`${name} must be 500 characters or fewer`)
  return trimmed
}

function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 500) throw new Error(`${name} must be 500 characters or fewer`)
  return trimmed
}

function selectedChoiceOf(value: unknown): SelectedChoice | undefined {
  if (value === undefined || value === null) return undefined
  if (value !== 'A' && value !== 'B') throw new Error('selectedChoice must be A or B')
  return value
}

function activeSelfOf(value: unknown): ActiveSelf {
  if (typeof value !== 'string' || !(ACTIVE_SELVES as readonly string[]).includes(value)) {
    throw new Error('activeSelf must be one of operator, athlete, father, writer')
  }
  return value as ActiveSelf
}

export function validateMindCheckIn(input: MindCheckInInput): ValidMindCheckIn {
  const result: ValidMindCheckIn = {
    energy: score(input.energy, 'energy'),
    positiveEmotion: score(input.positiveEmotion, 'positiveEmotion'),
    stateWord: requiredText(input.stateWord, 'stateWord'),
    activeSelf: activeSelfOf(input.activeSelf),
  }
  const shipIntent = optionalText(input.shipIntent, 'shipIntent')
  if (shipIntent) result.shipIntent = shipIntent
  const hedgedDecision = optionalText(input.hedgedDecision, 'hedgedDecision')
  if (hedgedDecision) result.hedgedDecision = hedgedDecision
  const selectedChoice = selectedChoiceOf(input.selectedChoice)
  if (selectedChoice) result.selectedChoice = selectedChoice
  return result
}

export interface MindChoiceFrame {
  diagnosis: string
  choices: [
    { id: 'A'; label: string; tradeoff: string },
    { id: 'B'; label: string; tradeoff: string },
  ]
  question: string
}

const CHOICE_QUESTION = 'Which do you choose: A or B?'

function describeShipIntent(input: ValidMindCheckIn): string {
  return input.shipIntent ? `"${input.shipIntent}"` : 'the ship intent you named'
}

function describeHedgedDecision(input: ValidMindCheckIn): string {
  return input.hedgedDecision ? `"${input.hedgedDecision}"` : 'the decision you are hedging'
}

export function diagnoseMindCheckIn(input: ValidMindCheckIn): MindChoiceFrame {
  const lowEnergy = input.energy <= 2
  const lowPositive = input.positiveEmotion <= 2
  const identity = input.activeSelf
  const state = input.stateWord

  if (lowEnergy && lowPositive) {
    return {
      diagnosis: `Energy is ${input.energy}/5 and positive emotion is ${input.positiveEmotion}/5 while the ${identity} is running and the state word is "${state}". That is a low-fuel, low-lift pattern.`,
      choices: [
        {
          id: 'A',
          label: `Shrink today's scope to the smallest useful slice of ${describeShipIntent(input)}.`,
          tradeoff: 'You keep momentum on something real, but you leave the bigger block for a stronger day.',
        },
        {
          id: 'B',
          label: 'Take a short reset — sleep, food, walk — then re-check energy and positive emotion.',
          tradeoff: 'You may recover capacity, but the shipping clock keeps running while you rest.',
        },
      ],
      question: CHOICE_QUESTION,
    }
  }

  if (lowEnergy && !lowPositive) {
    return {
      diagnosis: `Energy is ${input.energy}/5 but positive emotion is ${input.positiveEmotion}/5 while the ${identity} is running and the state word is "${state}". The mood is intact; the tank is low.`,
      choices: [
        {
          id: 'A',
          label: `Pick one smallest shippable block on ${describeShipIntent(input)} and finish only that.`,
          tradeoff: 'You use the good mood while it lasts, but you may burn deeper into a low tank.',
        },
        {
          id: 'B',
          label: 'Choose recovery first — protect the low tank now and defer shipping to the next window.',
          tradeoff: 'You protect tomorrow, but the good mood may not survive the delay.',
        },
      ],
      question: CHOICE_QUESTION,
    }
  }

  if (!lowEnergy && lowPositive) {
    return {
      diagnosis: `Energy is ${input.energy}/5 while positive emotion is ${input.positiveEmotion}/5, ${identity} is running and the state word is "${state}". There is charge without lift.`,
      choices: [
        {
          id: 'A',
          label: 'Examine the stressful thought driving the low positive emotion — name it, write it, test it.',
          tradeoff: 'You may clear the block, but the current activation could dissipate before you act.',
        },
        {
          id: 'B',
          label: `Convert the activation into one concrete decision on ${describeHedgedDecision(input)}.`,
          tradeoff: 'You lock in movement, but you carry the same stressful thought into whatever comes next.',
        },
      ],
      question: CHOICE_QUESTION,
    }
  }

  return {
    diagnosis: `Energy is ${input.energy}/5 and positive emotion is ${input.positiveEmotion}/5 while the ${identity} is running and the state word is "${state}". Fuel and lift are both present.`,
    choices: [
      {
        id: 'A',
        label: `Ship the artifact — deliver ${describeShipIntent(input)} while the window is open.`,
        tradeoff: 'You cash the good state into output, but the hedged decision stays open a while longer.',
      },
      {
        id: 'B',
        label: `Close ${describeHedgedDecision(input)} — commit or defer it explicitly.`,
        tradeoff: 'You clear the mental overhead, but the shippable artifact moves later in the day.',
      },
    ],
    question: CHOICE_QUESTION,
  }
}

export interface PersistedMindCheckIn {
  energy: number
  positiveEmotion: number
  stateWord: string
  activeSelf: ActiveSelf
  shipIntent?: string
  hedgedDecision?: string
  selectedChoice: SelectedChoice
  diagnosis: string
  choiceA: string
  choiceB: string
}

function requiredLongText(value: unknown, name: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) throw new Error(`${name} is required`)
  if (trimmed.length > max) throw new Error(`${name} must be ${max} characters or fewer`)
  return trimmed
}

export function parseMindCheckInPersistence(input: unknown): PersistedMindCheckIn {
  const row = (input ?? {}) as Record<string, unknown>
  if (row.selectedChoice !== 'A' && row.selectedChoice !== 'B') {
    throw new Error('selectedChoice must be A or B')
  }
  const base: ValidMindCheckIn = validateMindCheckIn({
    energy: row.energy,
    positiveEmotion: row.positiveEmotion,
    stateWord: row.stateWord,
    activeSelf: row.activeSelf,
    shipIntent: row.shipIntent,
    hedgedDecision: row.hedgedDecision,
    selectedChoice: row.selectedChoice,
  })
  const result: PersistedMindCheckIn = {
    energy: base.energy,
    positiveEmotion: base.positiveEmotion,
    stateWord: base.stateWord,
    activeSelf: base.activeSelf,
    selectedChoice: base.selectedChoice ?? 'A',
    diagnosis: requiredLongText(row.diagnosis, 'diagnosis', 2000),
    choiceA: requiredLongText(row.choiceA, 'choiceA', 2000),
    choiceB: requiredLongText(row.choiceB, 'choiceB', 2000),
  }
  if (base.shipIntent) result.shipIntent = base.shipIntent
  if (base.hedgedDecision) result.hedgedDecision = base.hedgedDecision
  return result
}

const CRISIS_PATTERNS = [
  /\b(?:kill|hurt|harm) myself\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\b(?:end|take) my (?:own )?life\b/i,
  /\bself[- ]harm\b/i,
  /\bimmediate danger\b/i,
]

export function detectCrisis(text: string): string | null {
  return CRISIS_PATTERNS.some(pattern => pattern.test(text)) ? CRISIS_HANDOFF : null
}
