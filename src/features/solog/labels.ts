import type { SologCountType, SologDifferenceState } from './types'

const COUNT_TYPE_LABELS: Record<SologCountType, string> = {
  categoria: 'Por categoría',
  cambios_recientes: 'Cambios recientes',
  stock_cero: 'Stock 0',
  stock_negativo: 'Stock negativo',
  reconteo: 'Contar detalladamente',
}

const DIFFERENCE_STATE_LABELS: Record<SologDifferenceState, string> = {
  coincide: 'Coincide',
  pendiente: 'Pendiente',
  probablemente_explicada: 'Probablemente explicada',
  parcialmente_explicada: 'Parcialmente explicada',
  persistente: 'Persistente',
  confirmada_reconteo: 'Confirmada por reconteo',
  conteos_inconsistentes: 'Conteos inconsistentes',
}

export function getSologCountTypeLabel(type: SologCountType): string {
  return COUNT_TYPE_LABELS[type]
}

export function getSologDifferenceStateLabel(
  state: SologDifferenceState,
): string {
  return DIFFERENCE_STATE_LABELS[state]
}
