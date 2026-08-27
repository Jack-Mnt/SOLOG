import type {
  CajeroCategoryOption,
  CajeroCountGroup,
  CajeroHistoryItem,
  CajeroObservationType,
  CajeroRoute,
} from './cajero.types'

export function isCajeroRouteAvailable(
  route: CajeroRoute,
  fortnightComplete: boolean,
): boolean {
  if (route === '/cajero') return true
  return fortnightComplete
    ? route === '/cajero/diario' ||
        route === '/cajero/revisar' ||
        route === '/cajero/historial'
    : route === '/cajero/conteo'
}
export function isValidPhysicalCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function calculateDifference(
  stockFisico: number,
  stockTumiSoft: number,
): number {
  return stockFisico - stockTumiSoft
}

export function calculateValuation(difference: number, price: number): number {
  return difference * price
}

const cajeroCurrency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
})

export function formatCajeroCurrency(value: number): string {
  return cajeroCurrency.format(value)
}

export function getObservationTypeLabel(
  type: Exclude<CajeroObservationType, 'auto'>,
): string {
  switch (type) {
    case 'base':
      return 'Base'
    case 'seguimiento':
      return 'Seguimiento'
    case 'reconteo':
      return 'Reconteo'
  }
}

export function getFollowupReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'conteos_inconsistentes':
      return 'Reconteo'
    case 'movimiento_posterior':
      return 'Cambio de stock'
    default:
      return 'Verificar diferencia'
  }
}

export function isCajeroRecountGroup(group: CajeroCountGroup): boolean {
  return (
    group.motivo_seguimiento === 'conteos_inconsistentes' ||
    group.estado_diferencia === 'conteos_inconsistentes'
  )
}

export function getFollowupGroupLabel(group: CajeroCountGroup): string {
  return isCajeroRecountGroup(group)
    ? 'Reconteo'
    : getFollowupReasonLabel(group.motivo_seguimiento)
}

export function getFollowupPriority(reason: string | null): number {
  switch (getFollowupReasonLabel(reason)) {
    case 'Verificar diferencia':
      return 1
    case 'Reconteo':
      return 2
    case 'Cambio de stock':
      return 3
    default:
      return 1
  }
}

export function sortFollowupGroups(
  groups: readonly CajeroCountGroup[],
): CajeroCountGroup[] {
  return [...groups].sort((left, right) => {
    const priority =
      (isCajeroRecountGroup(left)
        ? 2
        : getFollowupPriority(left.motivo_seguimiento)) -
      (isCajeroRecountGroup(right)
        ? 2
        : getFollowupPriority(right.motivo_seguimiento))
    if (priority !== 0) return priority

    const parsedLeft = left.contado_at_original
      ? Date.parse(left.contado_at_original)
      : Number.NaN
    const parsedRight = right.contado_at_original
      ? Date.parse(right.contado_at_original)
      : Number.NaN
    const leftTime = Number.isNaN(parsedLeft)
      ? Number.POSITIVE_INFINITY
      : parsedLeft
    const rightTime = Number.isNaN(parsedRight)
      ? Number.POSITIVE_INFINITY
      : parsedRight
    return leftTime - rightTime
  })
}

export function sortHistoryNewestFirst(
  items: readonly CajeroHistoryItem[],
): CajeroHistoryItem[] {
  return [...items].sort(
    (left, right) => Date.parse(right.contado_at) - Date.parse(left.contado_at),
  )
}
export function deriveCajeroCategories<
  T extends { categoria_id: string; categoria: string },
>(items: readonly T[]): CajeroCategoryOption[] {
  const categories = new Map<string, CajeroCategoryOption>()
  for (const item of items) {
    const current = categories.get(item.categoria_id)
    if (current) current.count += 1
    else {
      categories.set(item.categoria_id, {
        id: item.categoria_id,
        nombre: item.categoria,
        count: 1,
      })
    }
  }
  return [...categories.values()]
}

export function filterCajeroByCategory<
  T extends { categoria_id: string },
>(items: readonly T[], categoryId: string | null): T[] {
  return categoryId === null
    ? [...items]
    : items.filter((item) => item.categoria_id === categoryId)
}
