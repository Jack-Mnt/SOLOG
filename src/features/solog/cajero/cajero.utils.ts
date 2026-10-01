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

export type CajeroExpressionStatus =
  | 'empty'
  | 'incomplete'
  | 'valid'
  | 'too_high'

export interface CajeroExpressionEvaluation {
  status: CajeroExpressionStatus
  value: number | null
}

export type CajeroCalculatorKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '+'
  | '×'
  | 'times6'
  | 'times12'
  | 'clear'
  | 'backspace'

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
