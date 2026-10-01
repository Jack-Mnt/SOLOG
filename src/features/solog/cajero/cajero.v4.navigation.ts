import type { CashierRoute } from '../../../lib/router'
import type { CashierV4StartResult } from './cajero.v4'
import type { CashierV4State } from './cajero.v4.store'
import { canCashierV4CaptureForSession } from './cajero.v4.capability'
import { cashierV4Destination, selectCashierV4HistoryAvailable } from './cajero.v4.selectors'

export type CashierV4RouteAccess =
  | { allowed: true; route: CashierRoute }
  | { allowed: false; redirect: CashierRoute; reason: 'capture_unavailable' | 'operational_priority' | 'history_unavailable' | 'unknown_route' }

// Post-start authority is the received panel, never a previously displayed pre-session CTA.
export function cashierV4AfterStartDestination(result: CashierV4StartResult) {
  return cashierV4Destination(result.panel_state.next_action)
}

// Callers supply server-adjusted time. Routing/authentication into Cajero remains Route V2's job.
export function selectCashierV4CaptureDestination(state: CashierV4State, now: number): CashierRoute {
  const panel = state.panel_state
  if (!panel || panel.session.estado !== 'activo' || !canCashierV4CaptureForSession(state, panel.session.id, now)) return '/cajero'
  return cashierV4Destination(panel.next_action)
}

export function getCashierV4RouteAccess(state: CashierV4State, requestedPath: string, now: number): CashierV4RouteAccess {
  if (requestedPath === '/cajero') return { allowed: true, route: '/cajero' }
  if (requestedPath === '/cajero/historial') return selectCashierV4HistoryAvailable(state)
    ? { allowed: true, route: '/cajero/historial' }
    : { allowed: false, redirect: '/cajero', reason: 'history_unavailable' }
  if (!['/cajero/conteo', '/cajero/diario', '/cajero/revisar'].includes(requestedPath)) {
    return { allowed: false, redirect: '/cajero', reason: 'unknown_route' }
  }
  const destination = selectCashierV4CaptureDestination(state, now)
  if (destination === '/cajero') return { allowed: false, redirect: '/cajero', reason: 'capture_unavailable' }
  return requestedPath === destination
    ? { allowed: true, route: destination }
    : { allowed: false, redirect: destination, reason: 'operational_priority' }
}

const navigationItems: ReadonlyArray<{ route: CashierRoute; label: string }> = [
  { route: '/cajero', label: 'Inicio' },
  { route: '/cajero/conteo', label: 'Conteo' },
  { route: '/cajero/diario', label: 'Conteo diario' },
  { route: '/cajero/revisar', label: 'Revisar' },
  { route: '/cajero/historial', label: 'Historial' },
]

export function selectCashierV4BottomNavigation(state: CashierV4State, now: number) {
  return navigationItems.map(item => ({ ...item, available: getCashierV4RouteAccess(state, item.route, now).allowed }))
}
