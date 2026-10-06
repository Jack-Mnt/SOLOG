export function adminTimestamp(value: string | null) {
  return value === null ? '—' : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function validDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value
}

function limaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function shiftDateOnly(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function controlCustomDateBounds(today = limaToday()) {
  if (!validDateOnly(today)) throw new Error('Fecha de referencia inválida para Control.')
  return { min: shiftDateOnly(today, -44), max: today }
}

export function validCustomRange(from: string, to: string, today = limaToday()) {
  if (!validDateOnly(from) || !validDateOnly(to) || from > to) return false
  const { min, max } = controlCustomDateBounds(today)
  return from >= min
    && to <= max
    && (Date.parse(to) - Date.parse(from)) / 86400000 + 1 <= 45
}
