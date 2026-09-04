export function adminTimestamp(value: string | null) {
  return value === null ? '—' : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
export function validCustomRange(from: string, to: string) {
  const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  return date(from) && date(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 + 1 <= 92
}
