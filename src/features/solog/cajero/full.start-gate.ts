/**
 * Compás de actualización de inventario de SOLOG (hora local de Lima).
 * Solo protege el inicio del cliente; bootstrap/mutate V6/V7 mantienen
 * autoridad sobre stock, permisos, sesión y prioridad.
 */
export type CashierStartGatePhase =
  | 'untrusted'
  | 'minute_59'
  | 'waiting_new_snapshot'
  | 'new_snapshot_ready'
  | 'outside_transition'

export interface CashierStartGate {
  phase: CashierStartGatePhase
  blocked: boolean
  /** Comienzo absoluto del ciclo HH:59 actual, cuando aplica. */
  cycleStartMs: number | null
  /** Duración restante de la espera de tres minutos desde HH:59. */
  remainingMs: number
}

const limaClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * HH:59:00–HH:59:59: bloqueo absoluto.
 * HH+1:00:00–HH+1:01:59: permitir solo snapshot confirmado después de HH:59.
 * HH+1:02:00+: permitir iniciar con el stock que autorice V6, incluido respaldo.
 *
 * Se comparan captura y confirmación absolutas. Una confirmación tardía
 * de stock capturado antes de HH:59 no equivale al snapshot del ciclo nuevo.
 */
export function cashierStartGate(
  serverNowMs: number,
  trustedClock: boolean,
  snapshotConfirmedAt: string | null | undefined,
  snapshotCapturedAt: string | null | undefined,
): CashierStartGate {
  if (!trustedClock || !Number.isFinite(serverNowMs) || serverNowMs <= 0) {
    return { phase: 'untrusted', blocked: true, cycleStartMs: null, remainingMs: 0 }
  }
  const time = new Date(serverNowMs)
  const parts = limaClock.formatToParts(time)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  const second = Number(parts.find(part => part.type === 'second')?.value)
  if (!Number.isInteger(minute) || !Number.isInteger(second)) {
    return { phase: 'untrusted', blocked: true, cycleStartMs: null, remainingMs: 0 }
  }
  if (minute >= 2 && minute < 59) {
    return { phase: 'outside_transition', blocked: false, cycleStartMs: null, remainingMs: 0 }
  }

  const milliseconds = time.getUTCMilliseconds()
  const elapsedMs = ((minute === 59 ? 0 : minute + 1) * 60 + second) * 1000 + milliseconds
  const cycleStartMs = serverNowMs - elapsedMs
  const remainingMs = Math.max(0, 180_000 - elapsedMs)

  if (minute === 59) {
    return { phase: 'minute_59', blocked: true, cycleStartMs, remainingMs }
  }

  const confirmedMs = snapshotConfirmedAt ? Date.parse(snapshotConfirmedAt) : Number.NaN
  const capturedMs = snapshotCapturedAt ? Date.parse(snapshotCapturedAt) : Number.NaN
  if (Number.isFinite(confirmedMs) && Number.isFinite(capturedMs) &&
    capturedMs >= cycleStartMs && capturedMs <= confirmedMs &&
    confirmedMs >= cycleStartMs && confirmedMs <= serverNowMs) {
    return { phase: 'new_snapshot_ready', blocked: false, cycleStartMs, remainingMs }
  }
  return { phase: 'waiting_new_snapshot', blocked: true, cycleStartMs, remainingMs }
}
