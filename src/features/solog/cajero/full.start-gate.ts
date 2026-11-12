import type { CashierStartOfferV3 } from './full.contract'

/**
 * Guardia de presentación de Cajero Full V3.
 * No infiere generación a partir del stock ni reemplaza la autoridad de V6/V7.
 * America/Lima mantiene un desplazamiento UTC de horas completas, por lo que
 * el minuto del reloj UTC y el local coincide; los límites se calculan en ms.
 */
export type CashierStartGatePhase =
  | 'untrusted' | 'awaiting_offer' | 'window_closed' | 'stale_offer'
  | 'unavailable' | 'capture_too_short' | 'new' | 'fallback'

export interface CashierStartGate {
  phase: CashierStartGatePhase
  blocked: boolean
  reason: string | null
  /** Tiempo hasta HH:00 únicamente cuando la ventana ya está cerrada. */
  remainingMs: number
}

const HOUR_MS = 3_600_000
const MIN_CAPTURE_MS = 180_000

export function cashierStartGate(
  serverNowMs: number,
  trustedClock: boolean,
  offer: CashierStartOfferV3 | null | undefined,
): CashierStartGate {
  const blocked = (phase: CashierStartGatePhase, reason: string, remainingMs = 0): CashierStartGate =>
    ({ phase, blocked: true, reason, remainingMs })

  if (!trustedClock || !Number.isFinite(serverNowMs) || serverNowMs <= 0) {
    return blocked('untrusted', 'FULL_START_CLOCK_UNTRUSTED')
  }
  const hourStart = Math.floor(serverNowMs / HOUR_MS) * HOUR_MS
  const minute = new Date(serverNowMs).getUTCMinutes()
  if (minute >= 57) {
    return blocked('window_closed', 'START_WINDOW_CLOSED', hourStart + HOUR_MS - serverNowMs)
  }
  if (!offer || offer.policy_version !== 3) {
    return blocked('awaiting_offer', 'FULL_START_OFFER_REQUIRED')
  }
  if (Date.parse(offer.cycle_started_at) !== hourStart - 60_000) {
    return blocked('stale_offer', 'SNAPSHOT_SELECTION_CHANGED')
  }
  if (!offer.can_start || offer.status === 'unavailable') {
    return blocked('unavailable', offer.block_reason ?? 'FULL_START_BLOCKED')
  }
  const expiry = offer.capture_ends_at ? Date.parse(offer.capture_ends_at) : Number.NaN
  if (!Number.isFinite(expiry) || expiry - serverNowMs < MIN_CAPTURE_MS) {
    return blocked('capture_too_short', 'START_CAPTURE_TOO_SHORT')
  }
  return { phase: offer.status, blocked: false, reason: null, remainingMs: 0 }
}
