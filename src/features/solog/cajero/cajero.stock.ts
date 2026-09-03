import { useEffect, useState } from 'react'
import type { SologActiveSession, SologStockState } from '../types'
import type { CashierBootstrap } from './cajero.v2'

export const CAJERO_STOCK_UPDATED_LIMIT_MS = 90 * 60 * 1000
export const CAJERO_STOCK_NEAR_LIMIT_MS = 110 * 60 * 1000
export const CAJERO_STOCK_COUNTDOWN_START_MS = 117 * 60 * 1000
export const CAJERO_STOCK_START_MARGIN_MS = 5 * 60 * 1000

export type CajeroStockVisualState =
  | 'updated'
  | 'near_expiry'
  | 'critical'
  | 'countdown'
  | 'expired'

export interface CajeroStockPresentation {
  state: CajeroStockVisualState
  label: string
  countdown: string | null
  elapsedMs: number | null
  stockExpiresAtMs: number | null
  sessionExpiresAtMs: number | null
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function formatCajeroCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function getCajeroStockPresentation(
  stock: Pick<SologStockState, 'snapshot_at' | 'snapshot_expira_at' | 'disponible' | 'vigente'>,
  session: Pick<SologActiveSession, 'expira_at'> | null,
  serverNowMs: number,
): CajeroStockPresentation {
  const snapshotAtMs = parseTimestamp(stock.snapshot_at)
  const stockExpiresAtMs = parseTimestamp(stock.snapshot_expira_at)
  const sessionExpiresAtMs = parseTimestamp(session?.expira_at ?? null)
  const elapsedMs = snapshotAtMs === null
    ? null
    : Math.max(0, serverNowMs - snapshotAtMs)
  const locallyExpired = stockExpiresAtMs !== null && serverNowMs >= stockExpiresAtMs

  if (sessionExpiresAtMs !== null && serverNowMs >= sessionExpiresAtMs) {
    return { state: 'expired', label: 'Sesión vencida', countdown: null, elapsedMs, stockExpiresAtMs, sessionExpiresAtMs }
  }

  if (!stock.disponible || !stock.vigente || locallyExpired) {
    return {
      state: 'expired',
      label: 'Stock vencido',
      countdown: null,
      elapsedMs,
      stockExpiresAtMs,
      sessionExpiresAtMs,
    }
  }

  if (
    session &&
    elapsedMs !== null &&
    elapsedMs >= CAJERO_STOCK_COUNTDOWN_START_MS &&
    sessionExpiresAtMs !== null &&
    serverNowMs < sessionExpiresAtMs
  ) {
    return {
      state: 'countdown',
      label: 'La sesión está por finalizar',
      countdown: formatCajeroCountdown(sessionExpiresAtMs - serverNowMs),
      elapsedMs,
      stockExpiresAtMs,
      sessionExpiresAtMs,
    }
  }

  if (elapsedMs !== null && elapsedMs <= CAJERO_STOCK_UPDATED_LIMIT_MS) {
    return {
      state: 'updated',
      label: 'Stock actualizado',
      countdown: null,
      elapsedMs,
      stockExpiresAtMs,
      sessionExpiresAtMs,
    }
  }

  if (elapsedMs !== null && elapsedMs <= CAJERO_STOCK_NEAR_LIMIT_MS) {
    return {
      state: 'near_expiry',
      label: 'Stock próximo a vencer',
      countdown: null,
      elapsedMs,
      stockExpiresAtMs,
      sessionExpiresAtMs,
    }
  }

  return {
    state: 'critical',
    label: 'Stock a punto de vencer',
    countdown: null,
    elapsedMs,
    stockExpiresAtMs,
    sessionExpiresAtMs,
  }
}

export function getCashierStockPresentation(bootstrap: CashierBootstrap, now: number): CajeroStockPresentation {
  const panel = bootstrap.panel_state
  const capability = bootstrap.start_capability
  if (panel.source === 'session' && panel.basis.snapshot_referencia_id !== capability.snapshot_id) {
    const remaining = Date.parse(panel.session.expira_at) - now
    // Helper desplegado: expira a 1:59; banda final desde 1:57.
    const countdown = remaining > 0 && remaining <= 2 * 60_000
    return {
      state: remaining <= 0 ? 'expired' : countdown ? 'countdown' : 'updated',
      label: now >= Date.parse(panel.session.expira_at) ? 'Sesión vencida' : 'Sesión con referencia congelada',
      countdown: countdown ? formatCajeroCountdown(remaining) : null, elapsedMs: null, stockExpiresAtMs: null,
      sessionExpiresAtMs: Date.parse(panel.session.expira_at),
    }
  }
  return getCajeroStockPresentation({
    snapshot_at: capability.snapshot_at,
    snapshot_expira_at: capability.snapshot_expira_at,
    disponible: capability.snapshot_id !== null,
    vigente: capability.snapshot_expira_at !== null && now < Date.parse(capability.snapshot_expira_at),
  }, panel.session, now)
}

export type CajeroStartRestriction = 'stock_expired' | 'stock_too_close' | null

export function getCajeroStartRestriction(
  stock: SologStockState,
  serverNowMs: number,
): CajeroStartRestriction {
  const expiration = parseTimestamp(stock.snapshot_expira_at)
  if (
    !stock.disponible ||
    !stock.vigente ||
    (expiration !== null && serverNowMs >= expiration)
  ) {
    return 'stock_expired'
  }

  if (
    !stock.puede_iniciar_conteo ||
    (expiration !== null && expiration - serverNowMs <= CAJERO_STOCK_START_MARGIN_MS)
  ) {
    return 'stock_too_close'
  }

  return null
}

export function formatCajeroElapsed(elapsedMs: number | null): string {
  if (elapsedMs === null) return 'Hora de actualización no disponible'
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) return `Actualizado hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `Actualizado hace ${hours} h ${remainingMinutes} min`
    : `Actualizado hace ${hours} h`
}

export function formatCajeroClock(timestampMs: number | null): string | null {
  if (timestampMs === null) return null
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestampMs)
}

export function useCajeroServerClock(serverOffsetMs: number): number {
  const [localNow, setLocalNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLocalNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return localNow + serverOffsetMs
}
