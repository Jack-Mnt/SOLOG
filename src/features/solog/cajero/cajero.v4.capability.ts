import type { CashierV4RecoverySession, CashierV4Session, CashierV4SessionCapability } from './cajero.v4'
import type { CashierV4State } from './cajero.v4.store'
import { getCashierV4ErrorPolicy } from './cajero.v4.errors'
import { getCashierV4DeliveryState } from './cajero.v4.selectors'

export function getCashierV4SessionByConteoId(state: CashierV4State, conteoId: string): CashierV4Session | CashierV4RecoverySession | null {
  if (state.panel_state?.session.id === conteoId) return state.panel_state.session
  return state.recovery_sessions.find(session => session.id === conteoId) ?? null
}

export function getCashierV4SessionCapability(state: CashierV4State, conteoId: string): CashierV4SessionCapability | null {
  if (state.panel_state?.session.id === conteoId) return state.panel_state.session_capability
  return state.recovery_sessions.find(session => session.id === conteoId)?.session_capability ?? null
}

export function isCashierV4RecoverySession(state: CashierV4State, conteoId: string): boolean {
  return getCashierV4SessionCapability(state, conteoId)?.mode === 'recovery'
}

export function cashierV4EffectiveCapability(capability: CashierV4SessionCapability | null, authorized: boolean, now: number) {
  const started = Date.parse(capability?.iniciado_at ?? '')
  const expires = Date.parse(capability?.expira_at ?? '')
  const deadline = Date.parse(capability?.recovery_until ?? '')
  const valid = authorized && Number.isFinite(now) && Number.isFinite(started) &&
    Number.isFinite(expires) && Number.isFinite(deadline) && started < expires && expires < deadline && now >= started &&
    capability?.finalizado_at === null
  const active = capability?.mode === 'active' && capability.estado === 'activo'
  const recovery = capability?.mode === 'recovery' && capability.estado === 'recovery'
  // Keep the backend mode. The clock only removes permission; it never promotes a session.
  return {
    mode: capability?.mode ?? 'none',
    captureAllowed: Boolean(valid && active && capability?.capture_allowed && now < expires),
    pendingDeliveryAllowed: Boolean(valid && (active || recovery) && capability?.pending_delivery_allowed && now < deadline),
  }
}

export function canCashierV4CaptureForSession(state: CashierV4State, conteoId: string, now: number): boolean {
  const authorized = state.bootstrap?.device.autorizado === true && !getCashierV4ErrorPolicy(state.error).sessionInvalid
  return cashierV4EffectiveCapability(getCashierV4SessionCapability(state, conteoId), authorized, now).captureAllowed
}

export function canCashierV4DeliverPendingForSession(state: CashierV4State, conteoId: string, now: number): boolean {
  const authorized = state.bootstrap?.device.autorizado === true && !getCashierV4ErrorPolicy(state.error).sessionInvalid
  return cashierV4EffectiveCapability(getCashierV4SessionCapability(state, conteoId), authorized, now).pendingDeliveryAllowed
}

export function getCashierV4DeliveryPlanning(state: CashierV4State, conteoId: string, now: number) {
  const deliveryState = getCashierV4DeliveryState(state, conteoId)
  const capability = getCashierV4SessionCapability(state, conteoId)
  const reason = !capability ? 'session_unavailable'
    : !canCashierV4DeliverPendingForSession(state, conteoId, now) ? 'delivery_not_allowed'
    : !deliveryState ? 'missing_delivery_state'
    : null
  return { canPlanDelivery: reason === null, reason, deliveryState, capability }
}

export function canPlanCashierV4Delivery(state: CashierV4State, conteoId: string, now: number): boolean {
  return getCashierV4DeliveryPlanning(state, conteoId, now).canPlanDelivery
}

export function getCashierV4SessionScope(state: CashierV4State, conteoId: string) {
  const panel = state.panel_state
  // Recovery-only bootstrap entries have no revision. Persisted draft scopes come later.
  if (!panel || panel.session.id !== conteoId) return null
  return { conteo_id: conteoId, expected_groups_revision: panel.basis.groups_revision }
}
