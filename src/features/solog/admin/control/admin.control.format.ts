import type { SologObservationType } from '../../types'

const controlNumericDate = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Lima',
})

const controlTextDate = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Lima',
})

const controlTime = new Intl.DateTimeFormat('es-PE', {
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

export function formatControlDate(
  value: string | null,
  variant: 'numeric' | 'text' = 'numeric',
): string {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'

  const time = controlTime.format(date)
  if (variant === 'text') {
    const day = getPart(controlTextDate, date, 'day')
    const month = getPart(controlTextDate, date, 'month').replace(/\.$/, '')
    return `${day} ${month} · ${time}`
  }

  const day = getPart(controlNumericDate, date, 'day').padStart(2, '0')
  const month = getPart(controlNumericDate, date, 'month').padStart(2, '0')
  return `${day}/${month}, ${time}`
}

export function getControlDifferenceClass(value: number): string {
  const tone = value < 0 ? 'negative' : value > 0 ? 'positive' : 'zero'
  return `control-difference control-difference--${tone}`
}

const OBSERVATION_TYPE_LABELS: Record<SologObservationType, string> = {
  base: 'Base',
  seguimiento: 'Seguimiento',
  reconteo: 'Reconteo',
}

const VERIFICATION_REASON_LABELS: Record<string, string> = {
  movimiento_posterior: 'Movimiento posterior',
  parcialmente_explicada: 'Parcialmente explicada',
  persistente: 'Persistente',
}

export function getControlObservationTypeLabel(type: SologObservationType): string {
  return OBSERVATION_TYPE_LABELS[type]
}

export function getControlVerificationReasonLabel(reason: string | null): string | null {
  if (!reason) return null
  return VERIFICATION_REASON_LABELS[reason] ?? reason.replaceAll('_', ' ')
}
