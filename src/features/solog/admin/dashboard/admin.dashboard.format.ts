import type { SologDashboardSiteActivityState } from '../../types'

const dashboardActivityDate = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Lima',
})

const dashboardActivityTime = new Intl.DateTimeFormat('es-PE', {
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

export function formatDashboardActivityDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'

  const day = getPart(dashboardActivityDate, date, 'day')
  const month = getPart(dashboardActivityDate, date, 'month').replace(/\.$/, '')
  return `${day} ${month} · ${dashboardActivityTime.format(date)}`
}

export function formatDashboardRelativeActivity(
  value: string,
  serverNow: string,
): string {
  const activityTime = new Date(value).getTime()
  const serverTime = new Date(serverNow).getTime()
  if (!Number.isFinite(activityTime) || !Number.isFinite(serverTime)) {
    return formatDashboardActivityDate(value)
  }

  const elapsedMinutes = Math.max(0, Math.floor((serverTime - activityTime) / 60_000))
  if (elapsedMinutes < 1) return 'Hace menos de 1 min'
  if (elapsedMinutes < 60) return `Hace ${elapsedMinutes} min`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `Hace ${elapsedHours} h`
  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `Hace ${elapsedDays} d`
  return formatDashboardActivityDate(value)
}

export function formatDashboardDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  if (totalSeconds < 60) return `${totalSeconds} s`

  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes} min`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

export function getDashboardSessionStateLabel(
  state: SologDashboardSiteActivityState,
): string {
  if (state === 'activo') return 'Activa'
  if (state === 'expirado') return 'Expirado'
  return 'Finalizado'
}
