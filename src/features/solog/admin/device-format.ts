const deviceDayMonth = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Lima',
})

const deviceTime = new Intl.DateTimeFormat('es-PE', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Lima',
})

export function formatDeviceDate(value: string | null): string {
  if (!value) return 'Sin registro'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'

  const parts = deviceDayMonth.formatToParts(date)
  const day = parts.find((part) => part.type === 'day')?.value.padStart(2, '0') ?? ''
  const month = parts.find((part) => part.type === 'month')?.value.padStart(2, '0') ?? ''
  return `${day}/${month}, ${deviceTime.format(date)}`
}
