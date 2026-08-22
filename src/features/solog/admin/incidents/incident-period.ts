export type IncidentPeriodPreset =
  | 'today'
  | 'last_week'
  | 'current_fortnight'
  | 'previous_fortnight'
  | 'custom'

export interface IncidentDateRange {
  desde: string
  hasta: string
}

const limaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function addDays(value: string, days: number): string {
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateOnly(date)
}

function getMonthStart(value: string): string {
  return `${value.slice(0, 7)}-01`
}

function getMonthEnd(value: string): string {
  const date = parseDateOnly(getMonthStart(value))
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return formatDateOnly(date)
}

function getLimaDate(): string {
  const parts = limaDate.formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export function getIncidentPeriodRange(
  preset: Exclude<IncidentPeriodPreset, 'custom'>,
): IncidentDateRange {
  const today = getLimaDate()

  if (preset === 'today') return { desde: today, hasta: today }
  if (preset === 'last_week') {
    return { desde: addDays(today, -6), hasta: today }
  }

  const day = Number(today.slice(8, 10))
  const monthStart = getMonthStart(today)
  if (preset === 'current_fortnight') {
    return day <= 15
      ? { desde: monthStart, hasta: `${today.slice(0, 7)}-15` }
      : { desde: `${today.slice(0, 7)}-16`, hasta: getMonthEnd(today) }
  }

  if (day > 15) {
    return { desde: monthStart, hasta: `${today.slice(0, 7)}-15` }
  }

  const previousMonthLastDay = addDays(monthStart, -1)
  return {
    desde: `${previousMonthLastDay.slice(0, 7)}-16`,
    hasta: previousMonthLastDay,
  }
}

export function validateIncidentDateRange(range: IncidentDateRange): string | null {
  if (!range.desde || !range.hasta) return 'Selecciona las fechas Desde y Hasta.'
  if (range.desde > range.hasta) {
    return 'La fecha Desde no puede ser posterior a la fecha Hasta.'
  }
  return null
}
