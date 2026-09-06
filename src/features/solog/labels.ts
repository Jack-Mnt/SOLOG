import type { SologDifferenceState } from './types'

const DIFFERENCE_STATE_LABELS: Record<SologDifferenceState, string> = {
  Coincide: 'Coincide',
  Recontar: 'Recontar',
  Confirmada: 'Confirmada',
  Inconsistente: 'Inconsistente',
}

export function getSologDifferenceStateClass(state: SologDifferenceState): string {
  return state.toLowerCase()
}

export function getSologDifferenceStateLabel(
  state: SologDifferenceState,
): string {
  return DIFFERENCE_STATE_LABELS[state]
}
