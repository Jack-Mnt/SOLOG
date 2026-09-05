import {
  Beer,
  Candy,
  Cigarette,
  Coffee,
  CupSoda,
  Droplets,
  GlassWater,
  IceCreamBowl,
  Martini,
  Package,
  SprayCan,
  Warehouse,
  Wine,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type {
  CajeroCalculatorKey,
  CajeroCategoryOption,
  CajeroCountGroup,
  CajeroExpressionEvaluation,
  CajeroHistoryItem,
  CajeroRoute,
  CajeroStockType,
} from './cajero.types'

export const CAJERO_MAX_PHYSICAL_COUNT = 99_999

const CATEGORY_ICON_RULES: Array<{
  terms: string[]
  icon: LucideIcon
}> = [
  { terms: ['cerveza'], icon: Beer },
  { terms: ['gaseosa', 'sin alcohol', 'refresco'], icon: CupSoda },
  { terms: ['agua'], icon: Droplets },
  { terms: ['snack', 'golosina', 'dulce'], icon: Candy },
  { terms: ['cigarro', 'tabaco'], icon: Cigarette },
  { terms: ['helado'], icon: IceCreamBowl },
  { terms: ['cuidado personal', 'higiene', 'limpieza'], icon: SprayCan },
  { terms: ['vino', 'espumante'], icon: Wine },
  { terms: ['whisky', 'whiskey'], icon: GlassWater },
  { terms: ['energetica'], icon: Zap },
  { terms: ['de bar', 'coctel'], icon: Martini },
  { terms: ['de bodega', 'abarrote'], icon: Warehouse },
  { terms: ['cafe'], icon: Coffee },
]

export function getCajeroCategoryIcon(categoryName: string): LucideIcon {
  const normalized = categoryName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
  return CATEGORY_ICON_RULES.find(({ terms }) =>
    terms.some((term) => normalized.includes(term))
  )?.icon ?? Package
}

export function isCajeroRouteAvailable(
  route: CajeroRoute,
  periodComplete: boolean,
): boolean {
  if (route === '/cajero') return true
  return periodComplete
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

  if (key === 'times6' || key === 'times12') {
    if (
      trimmed.length === 0 ||
      trimmed.endsWith('+') ||
      trimmed.endsWith('×')
    ) {
      return expression
    }
    return `${trimmed} × ${key === 'times6' ? '6' : '12'}`
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

export function calculateCajeroValuationPreview(
  difference: number,
  unitPrice: number,
  unitsPerPackage: number | null,
  packagePrice: number | null,
): number | null {
  if (unitsPerPackage === null && packagePrice === null) return difference * unitPrice
  if (typeof unitsPerPackage !== 'number' || !Number.isSafeInteger(unitsPerPackage) || unitsPerPackage <= 1 ||
    typeof packagePrice !== 'number' || !Number.isFinite(packagePrice) || packagePrice <= 0) return null
  const absolute = Math.abs(difference)
  const value = Math.floor(absolute / unitsPerPackage) * packagePrice +
    (absolute % unitsPerPackage) * unitPrice
  return Math.sign(difference) * value
}

export function getCajeroCapturedCount(
  groups: readonly Pick<CajeroCountGroup, 'grupo_id'>[],
  capturedGroupIds: ReadonlySet<string>,
): number {
  return groups.filter((group) => capturedGroupIds.has(group.grupo_id)).length
}

const cajeroCurrency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
})

export function formatCajeroCurrency(value: number): string {
  return cajeroCurrency.format(value)
}

export function getCajeroDifferenceClass(
  value: number | null,
): string | undefined {
  if (value === null) return undefined
  if (value === 0) return 'is-zero'
  return value < 0 ? 'is-negative' : 'is-positive'
}

export function formatCajeroDifference(value: number | null): string {
  if (value === null) return '—'
  return value > 0 ? `+${value}` : String(value)
}

export type CajeroReviewDifferenceFilter = 'all' | 'positive' | 'negative'

export function toggleCajeroReviewDifferenceFilter(
  current: CajeroReviewDifferenceFilter,
  sign: Exclude<CajeroReviewDifferenceFilter, 'all'>,
): CajeroReviewDifferenceFilter {
  return current === sign ? 'all' : sign
}

export function filterCajeroReviewGroups(
  groups: readonly CajeroCountGroup[],
  filter: CajeroReviewDifferenceFilter,
): CajeroCountGroup[] {
  if (filter === 'all') return [...groups]
  return groups.filter((group) => {
    const difference = group.ultima_diferencia
    if (typeof difference !== 'number') return false
    return filter === 'positive' ? difference > 0 : difference < 0
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

export function deriveCajeroPeriodCategories(
  groups: readonly CajeroCountGroup[],
  type: CajeroStockType,
  excludedGroupIds: ReadonlySet<string> = new Set(),
): CajeroCategoryOption[] {
  const categories = new Map<string, CajeroCategoryOption>()
  for (const group of groups) {
    if (!isCajeroGroupInStockType(group, type)) continue
    const pending =
      group.cubierto_periodo !== true &&
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

export function filterCajeroPeriodCategoryGroups(
  groups: readonly CajeroCountGroup[],
  type: CajeroStockType,
  categoryId: string,
  excludedGroupIds: ReadonlySet<string> = new Set(),
): CajeroCountGroup[] {
  return groups.filter(
    (group) =>
      group.categoria_id === categoryId &&
      group.cubierto_periodo !== true &&
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
