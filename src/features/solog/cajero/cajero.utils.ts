import type {
  CajeroCalculatorKey,
  CajeroCategoryOption,
  CajeroCountGroup,
  CajeroExpressionEvaluation,
  CajeroHistoryItem,
  CajeroObservationType,
  CajeroRoute,
  CajeroStockType,
} from './cajero.types'

export const CAJERO_MAX_PHYSICAL_COUNT = 99_999

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
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CAJERO_MAX_PHYSICAL_COUNT
  )
}

export function evaluateCajeroExpression(
  expression: string,
): CajeroExpressionEvaluation {
  const normalized = expression.trim()
  if (normalized.length === 0) return { status: 'empty', value: null }
  if (!/^\d+(?:\s*[+×]\s*\d+)*$/.test(normalized)) {
    return { status: 'incomplete', value: null }
  }

  const result = normalized.split('+').reduce((sum, term) => {
    const product = term
      .split('×')
      .reduce((current, factor) => current * BigInt(factor.trim()), 1n)
    return sum + product
  }, 0n)

  if (result > BigInt(CAJERO_MAX_PHYSICAL_COUNT)) {
    return { status: 'too_high', value: null }
  }

  return { status: 'valid', value: Number(result) }
}

export function applyCajeroCalculatorKey(
  expression: string,
  key: CajeroCalculatorKey,
): string {
  if (key === 'clear') return ''

  const trimmed = expression.trimEnd()
  if (key === 'backspace') {
    if (trimmed.endsWith('+') || trimmed.endsWith('×')) {
      return trimmed.slice(0, -1).trimEnd()
    }
    return trimmed.slice(0, -1)
  }

  if (key === '+' || key === '×') {
    if (
      trimmed.length === 0 ||
      trimmed.endsWith('+') ||
      trimmed.endsWith('×')
    ) {
      return expression
    }
    return `${trimmed} ${key} `
  }

  return `${expression}${key}`
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
    : getFollowupReasonLabel(group.motivo_seguimiento ?? null)
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
        : getFollowupPriority(left.motivo_seguimiento ?? null)) -
      (isCajeroRecountGroup(right)
        ? 2
        : getFollowupPriority(right.motivo_seguimiento ?? null))
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
  T extends {
    categoria_id: string
    categoria: string
    categoria_orden?: number
  },
>(items: readonly T[]): CajeroCategoryOption[] {
  const categories = new Map<string, CajeroCategoryOption>()
  for (const item of items) {
    const current = categories.get(item.categoria_id)
    if (current) {
      current.count += 1
    } else {
      const category: CajeroCategoryOption = {
        id: item.categoria_id,
        nombre: item.categoria,
        count: 1,
      }
      if (typeof item.categoria_orden === 'number') {
        category.orden = item.categoria_orden
      }
      categories.set(item.categoria_id, category)
    }
  }

  return [...categories.values()].sort(
    (left, right) =>
      (left.orden ?? Number.MAX_SAFE_INTEGER) -
      (right.orden ?? Number.MAX_SAFE_INTEGER),
  )
}

export function isCajeroGroupInStockType(
  group: CajeroCountGroup,
  type: CajeroStockType,
): boolean {
  switch (type) {
    case 'positive':
      return group.stock_teorico > 0
    case 'zero':
      return group.stock_teorico === 0
    case 'negative':
      return group.stock_teorico < 0
  }
}

export function deriveCajeroFortnightCategories(
  groups: readonly CajeroCountGroup[],
  type: CajeroStockType,
  excludedGroupIds: ReadonlySet<string> = new Set(),
): CajeroCategoryOption[] {
  const categories = new Map<string, CajeroCategoryOption>()
  for (const group of groups) {
    if (!isCajeroGroupInStockType(group, type)) continue
    const pending =
      group.pendiente_quincena === true &&
      !excludedGroupIds.has(group.grupo_id)
    const current = categories.get(group.categoria_id)
    if (current) {
      if (pending) current.count += 1
      continue
    }

    const category: CajeroCategoryOption = {
      id: group.categoria_id,
      nombre: group.categoria,
      count: pending ? 1 : 0,
    }
    if (typeof group.categoria_orden === 'number') {
      category.orden = group.categoria_orden
    }
    categories.set(group.categoria_id, category)
  }

  return [...categories.values()].sort(
    (left, right) =>
      (left.orden ?? Number.MAX_SAFE_INTEGER) -
        (right.orden ?? Number.MAX_SAFE_INTEGER) ||
      left.nombre.localeCompare(right.nombre, 'es'),
  )
}

export function filterCajeroFortnightCategoryGroups(
  groups: readonly CajeroCountGroup[],
  type: CajeroStockType,
  categoryId: string,
  excludedGroupIds: ReadonlySet<string> = new Set(),
): CajeroCountGroup[] {
  return groups.filter(
    (group) =>
      group.categoria_id === categoryId &&
      group.pendiente_quincena === true &&
      !excludedGroupIds.has(group.grupo_id) &&
      isCajeroGroupInStockType(group, type),
  )
}

export function filterCajeroByCategory<
  T extends { categoria_id: string },
>(items: readonly T[], categoryId: string | null): T[] {
  return categoryId === null
    ? [...items]
    : items.filter((item) => item.categoria_id === categoryId)
}
