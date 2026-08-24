const peruDateTime = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Lima',
})

const peruCurrency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

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
