export type ControlPeriodPreset =
  | 'today'
  | 'last_week'
  | 'current_period'
  | 'previous_period'
  | 'custom'

export interface ControlDateRange {
  dateFrom: string
  dateTo: string
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

export function getLimaDate(reference?: string): string {
  const candidate = reference ? new Date(reference) : new Date()
  const date = Number.isNaN(candidate.getTime()) ? new Date() : candidate
  const parts = limaDate.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export function getControlPeriodRange(
  preset: Exclude<ControlPeriodPreset, 'custom'>,
  reference?: string,
): ControlDateRange {
  const today = getLimaDate(reference)

  if (preset === 'today') return { dateFrom: today, dateTo: today }
  if (preset === 'last_week') {
    return { dateFrom: addDays(today, -6), dateTo: today }
  }

  const day = Number(today.slice(8, 10))
  const monthStart = getMonthStart(today)
  if (preset === 'current_period') {
    return day <= 15
      ? { dateFrom: monthStart, dateTo: `${today.slice(0, 7)}-15` }
      : { dateFrom: `${today.slice(0, 7)}-16`, dateTo: getMonthEnd(today) }
  }

  if (day > 15) {
    return { dateFrom: monthStart, dateTo: `${today.slice(0, 7)}-15` }
  }

  const previousMonthLastDay = addDays(monthStart, -1)
  return {
    dateFrom: `${previousMonthLastDay.slice(0, 7)}-16`,
    dateTo: previousMonthLastDay,
  }
}

export function validateControlDateRange(range: ControlDateRange): string | null {
  if (!range.dateFrom || !range.dateTo) return 'Selecciona las fechas Desde y Hasta.'
  if (range.dateFrom > range.dateTo) {
    return 'La fecha Desde no puede ser posterior a la fecha Hasta.'
  }

  const milliseconds =
    parseDateOnly(range.dateTo).getTime() - parseDateOnly(range.dateFrom).getTime()
  const inclusiveDays = Math.floor(milliseconds / 86_400_000) + 1
  return inclusiveDays > 366 ? 'El período no puede superar 366 días.' : null
}
