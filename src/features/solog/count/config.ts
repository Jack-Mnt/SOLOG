import type {
  SologCountType,
  SologGroupView,
} from '../types'

export interface SologActiveCountDefinition {
  type: SologCountType
  view: SologGroupView
  mutation: 'save' | 'recount'
  title: string
  description: string
}

export const SOLOG_ACTIVE_COUNT_DEFINITIONS: Record<
  SologCountType,
  SologActiveCountDefinition
> = {
  categoria: {
    type: 'categoria',
    view: 'categoria',
    mutation: 'save',
    title: 'Por categoría',
    description: 'Conteo de los grupos de una categoría seleccionada.',
  },
  cambios_recientes: {
    type: 'cambios_recientes',
    view: 'cambios_recientes',
    mutation: 'save',
    title: 'Cambios recientes',
    description: 'Productos cuyo stock cambió recientemente.',
  },
  stock_cero: {
    type: 'stock_cero',
    view: 'stock_cero',
    mutation: 'save',
    title: 'Stock 0',
    description: 'Grupos cuyo stock teórico congelado es cero.',
  },
  stock_negativo: {
    type: 'stock_negativo',
    view: 'stock_negativo',
    mutation: 'save',
    title: 'Stock negativo',
    description: 'Grupos cuyo stock teórico congelado es negativo.',
  },
  reconteo: {
    type: 'reconteo',
    view: 'contar_detalladamente',
    mutation: 'recount',
    title: 'Contar detalladamente',
    description: 'Vuelve a contar los grupos que requieren verificación.',
  },
}

export function getActiveCountDefinition(
  type: SologCountType,
): SologActiveCountDefinition {
  return SOLOG_ACTIVE_COUNT_DEFINITIONS[type]
}
