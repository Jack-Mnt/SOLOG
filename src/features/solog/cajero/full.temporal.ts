/** Formatos puramente visuales. El reloj Full y las expiraciones del servidor son autoritativos. */
const limaTimestamp = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h12',
})

export function formatFullInventoryUpdate(timestamp: string | null | undefined): string {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Sin actualización'
  const parts = limaTimestamp.formatToParts(new Date(timestamp))
  const part = (key: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === key)?.value ?? ''
  const hour = part('hour')
  const minute = part('minute')
  const day = part('day')
  const month = part('month')
  const period = part('dayPeriod').toUpperCase() === 'PM' ? 'p. m.' : 'a. m.'
  return `${hour}:${minute} ${period} [${day}/${month}]`
}

/** Minutos enteros de uso informativo, redondeados hacia arriba y nunca negativos. */
export function fullMinutesRemaining(
  expiresAt: string | null | undefined,
  serverNow: number,
  clockTrusted: boolean,
): number | null {
  if (!clockTrusted || !Number.isFinite(serverNow) || !expiresAt) return null
  const expiry = Date.parse(expiresAt)
  if (!Number.isFinite(expiry)) return null
  return Math.max(0, Math.ceil((expiry - serverNow) / 60_000))
}

export function fullRemainingLabel(
  minutes: number | null,
  purpose: 'capture' | 'stock',
): string {
  if (minutes === null) return 'Tiempo restante no disponible'
  if (minutes === 0) return purpose === 'capture'
    ? 'Tiempo de captura agotado'
    : 'Vigencia del inventario agotada'
  return purpose === 'capture'
    ? `${minutes} min restantes para capturar`
    : `${minutes} min restantes de vigencia`
}
