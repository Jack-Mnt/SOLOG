import type { CashierBootstrap } from './cajero.v2'

export type CashierEffectiveMode = 'none' | 'active' | 'recovery' | 'expired'

// El reloj solo restringe la capacidad recibida. Nunca inventa permisos backend.
export function cashierCapability(b: CashierBootstrap | null, now: number) {
  const session = b?.panel_state.session
  const capability = b?.session_capability
  let mode: CashierEffectiveMode = 'none'
  if (session) {
    if (session.estado === 'expirado' || now >= Date.parse(session.recovery_until)) mode = 'expired'
    else if (session.estado === 'activo' && capability && capability.mode !== 'none') {
      mode = capability.mode === 'recovery' || now >= Date.parse(session.expira_at) ? 'recovery' : 'active'
    }
  }
  const valid = Boolean(session && capability && capability.recovery_until === session.recovery_until &&
    Number.isFinite(Date.parse(session.recovery_until)) && b?.device.autorizado)
  return {
    mode,
    captureAllowed: valid && mode === 'active' && capability!.capture_allowed && now < Date.parse(session!.expira_at),
    deliveryAllowed: valid && (mode === 'active' || mode === 'recovery') && capability!.pending_delivery_allowed,
  }
}
