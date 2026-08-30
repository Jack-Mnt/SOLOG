const incidentDate = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Lima',
})

const incidentTime = new Intl.DateTimeFormat('es-PE', {
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

export function formatIncidentDate(value: string | null): string {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'

  const day = getPart(incidentDate, date, 'day').padStart(2, '0')
  const month = getPart(incidentDate, date, 'month').padStart(2, '0')
  return `${day}/${month}, ${incidentTime.format(date)}`
}
