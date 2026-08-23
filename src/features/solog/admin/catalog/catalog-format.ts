import type { SologCatalogChangeRow } from '../../types'
import { formatAdminCurrency } from '../format'

const catalogDate = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Lima',
})

const catalogTime = new Intl.DateTimeFormat('es-PE', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Lima',
})

function getPart(
  formatter: Intl.DateTimeFormat,
  date: Date,
  type: Intl.DateTimeFormatPartTypes,
): string {
  return formatter.formatToParts(date).find((part) => part.type === type)?.value ?? ''
}

function formatValue(value: unknown, empty = 'Sin valor'): string {
  if (typeof value === 'string') return value.trim() || empty
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return empty
}

export function formatCatalogDate(value: string | null): string {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  const day = getPart(catalogDate, date, 'day').padStart(2, '0')
  const month = getPart(catalogDate, date, 'month').padStart(2, '0')
  return `${day}/${month}, ${catalogTime.format(date)}`
}

export function getCatalogChangeLabel(change: SologCatalogChangeRow): string {
  if (change.tipo === 'definicion_grupo') return 'Definición estructural del grupo'
  if (change.tipo === 'clasificacion_producto') return 'Modalidad o grupo de conteo'
  if (change.tipo === 'agregar_producto') return 'Agregar'
  if (change.tipo === 'eliminar_producto') return 'Eliminar'

  const previous = change.datos.anterior
  const next = change.datos.nuevo
  if (change.tipo === 'precio') {
    const previousPrice = typeof previous === 'number'
      ? formatAdminCurrency(previous)
      : 'Sin precio'
    const nextPrice = typeof next === 'number'
      ? formatAdminCurrency(next)
      : 'Sin precio'
    return `${previousPrice} → ${nextPrice}`
  }

  return `${formatValue(previous)} → ${formatValue(next)}`
}

export function getCatalogChangeFieldLabel(change: SologCatalogChangeRow): string {
  if (change.tipo === 'nombre') return 'Nombre'
  if (change.tipo === 'precio') return 'Precio'
  if (change.tipo === 'codigo') return 'Código de barras'
  return 'Cambio'
}
