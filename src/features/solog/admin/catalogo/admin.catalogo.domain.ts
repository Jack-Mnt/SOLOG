import type {
  SologAdminIncidentRow,
  SologCatalogChangeRow,
} from '../../types'
import { formatAdminCurrency } from '../admin.format'

export function isUrgentCatalogChange(
  change: Pick<SologCatalogChangeRow, 'seccion'>,
): boolean {
  return change.seccion === 'urgente'
}

export function isPendingCatalogChange(
  change: Pick<SologCatalogChangeRow, 'seccion'>,
): boolean {
  return change.seccion === 'pendiente'
}

export function requiresNewProductConfiguration(
  change: Pick<SologCatalogChangeRow, 'tipo'>,
): boolean {
  return change.tipo === 'agregar_producto'
}

export function canReviewIncident(
  incident: Pick<SologAdminIncidentRow, 'tipo'>,
): boolean {
  return incident.tipo !== 'producto_ausente'
}

export function canDeleteMissingProduct(
  incident: Pick<SologAdminIncidentRow, 'tipo'>,
): boolean {
  return incident.tipo === 'producto_ausente'
}

export function canIgnoreMissingProduct(
  incident: Pick<SologAdminIncidentRow, 'tipo'>,
): boolean {
  return incident.tipo === 'producto_ausente'
}

function getStringValue(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumberValue(data: Record<string, unknown>, key: string): number | null {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatChangeValue(value: unknown, empty = 'Sin valor'): string {
  if (typeof value === 'string') return value.trim() || empty
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return empty
}

export function getCatalogProposedPrice(change: SologCatalogChangeRow): number | null {
  return getNumberValue(change.datos, 'precio') ?? getNumberValue(change.datos, 'nuevo')
}

export function getCatalogDetectedProduct(change: SologCatalogChangeRow): string | null {
  return change.producto ?? getStringValue(change.datos, 'producto')
}

export function getCatalogDetectedBarcode(change: SologCatalogChangeRow): string | null {
  return getStringValue(change.datos, 'c_barras')
}

export function getCatalogDetectedStock(change: SologCatalogChangeRow): number | null {
  return getNumberValue(change.datos, 'stock_detectado')
}

export function getCatalogChangeSummary(change: SologCatalogChangeRow): string {
  if (change.tipo === 'agregar_producto') {
    const price = getCatalogProposedPrice(change)
    const barcode = getCatalogDetectedBarcode(change)
    return [
      'Nuevo producto',
      price === null ? null : formatAdminCurrency(price),
      barcode ? `Código: ${barcode}` : null,
    ].filter((part): part is string => part !== null).join('\n')
  }

  if (change.tipo === 'eliminar_producto') return 'Eliminar del catálogo'

  const previous = change.datos.anterior
  const next = change.datos.nuevo
  if (change.tipo === 'precio') {
    const previousPrice = typeof previous === 'number' ? formatAdminCurrency(previous) : 'Sin precio'
    const nextPrice = typeof next === 'number' ? formatAdminCurrency(next) : 'Sin precio'
    return `${previousPrice}\n→ ${nextPrice}`
  }

  return `${formatChangeValue(previous)}\n→ ${formatChangeValue(next)}`
}

export function formatCatalogChangeData(data: Record<string, unknown>): string {
  return Object.keys(data).length === 0
    ? 'Sin datos adicionales'
    : JSON.stringify(data, null, 2)
}
