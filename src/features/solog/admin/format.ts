import type { SologAdminCountState } from '../types'

const peruDateTime = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Lima',
})

const peruCurrency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

const COUNT_STATE_LABELS: Record<SologAdminCountState, string> = {
  activo: 'Activo',
  finalizado: 'Finalizado',
  expirado: 'Expirado',
}

export function formatAdminDate(value: string | null): string {
  if (!value) return 'Sin registro'

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : peruDateTime.format(date)
}

export function formatAdminCurrency(value: number): string {
  return peruCurrency.format(value)
}

export function formatSignedInteger(value: number): string {
  return value > 0 ? `+${value}` : value.toString()
}

export function getAdminCountStateLabel(
  state: SologAdminCountState,
): string {
  return COUNT_STATE_LABELS[state]
}
