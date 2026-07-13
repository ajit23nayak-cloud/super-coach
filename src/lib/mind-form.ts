import type { ActiveSelf, SelectedChoice } from '@/lib/mind'

export interface MindFormState {
  energy: number | null
  positiveEmotion: number | null
  stateWord: string
  activeSelf: ActiveSelf | null
  shipIntent: string
  hedgedDecision: string
}

export interface DiagnosePayload {
  energy: number
  positiveEmotion: number
  stateWord: string
  activeSelf: ActiveSelf
  shipIntent: string
  hedgedDecision: string
}

export interface SelectionPayload extends DiagnosePayload {
  selectedChoice: SelectedChoice
}

function isScore(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

export function isDiagnoseReady(state: MindFormState): boolean {
  return (
    isScore(state.energy) &&
    isScore(state.positiveEmotion) &&
    state.stateWord.trim().length > 0 &&
    state.activeSelf !== null &&
    state.shipIntent.trim().length > 0 &&
    state.hedgedDecision.trim().length > 0
  )
}

export function buildDiagnosePayload(state: MindFormState): DiagnosePayload {
  if (!isDiagnoseReady(state)) throw new Error('Fill every field before diagnosis is complete')
  return {
    energy: state.energy as number,
    positiveEmotion: state.positiveEmotion as number,
    stateWord: state.stateWord.trim(),
    activeSelf: state.activeSelf as ActiveSelf,
    shipIntent: state.shipIntent.trim(),
    hedgedDecision: state.hedgedDecision.trim(),
  }
}

export function buildSelectionPayload(state: MindFormState, choice: SelectedChoice): SelectionPayload {
  if (choice !== 'A' && choice !== 'B') throw new Error('selectedChoice must be A or B')
  return { ...buildDiagnosePayload(state), selectedChoice: choice }
}
