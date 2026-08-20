import type { SologDifferenceState } from './types'

const DIFFERENCE_STATE_LABELS: Record<SologDifferenceState, string> = {
  coincide: 'Coincide',
  pendiente: 'Pendiente',
  probablemente_explicada: 'Probablemente explicada',
  parcialmente_explicada: 'Parcialmente explicada',
  persistente: 'Persistente',
  confirmada_reconteo: 'Confirmada por reconteo',
  conteos_inconsistentes: 'Conteos inconsistentes',
}

export function getSologDifferenceStateLabel(
  state: SologDifferenceState,
): string {
  return DIFFERENCE_STATE_LABELS[state]
}
