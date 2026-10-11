// Fixture EXCLUSIVO de tests/browser; no altera rutas ni datos productivos.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CashierV4Provider } from '../../src/features/solog/cajero/cajero.v4.context'
import { CajeroV4 } from '../../src/features/solog/cajero/cajero.v4.ui'
import { CashierV4Store } from '../../src/features/solog/cajero/cajero.v4.store'
import { CashierV4Runtime } from '../../src/features/solog/cajero/cajero.v4.runtime'
import { CashierV4DraftStorage } from '../../src/features/solog/cajero/cajero.v4.storage'
import { cashierV4Bootstrap, cashierV4Mutation, cashierV4Ids, cashierV4DeviceToken } from '../fixtures/cashier-v4.mjs'
import type { CashierV4Rpc } from '../../src/features/solog/cajero/cajero.v4.api'

const base = cashierV4Bootstrap('pre_session')
const recovery = cashierV4Bootstrap('pre_session')
const session = cashierV4Bootstrap('active').panel_state!.session
const past = (value: string, minutes: number) => new Date(Date.parse(value) - minutes * 60000).toISOString()
const now = new Date().toISOString()
recovery.server_now = now
recovery.generated_at = now
recovery.recovery_sessions = [{
  id: cashierV4Ids.session,
  iniciado_at: past(now, 80),
  expira_at: past(now, 40),
  recovery_until: new Date(Date.parse(now) + 80 * 60000).toISOString(),
  snapshot_referencia_id: cashierV4Ids.snapshot,
  ronda: 1, turno: 'day',
  session_capability: {
    mode: 'recovery', estado: 'recovery', capture_allowed: false, pending_delivery_allowed: true,
    iniciado_at: past(now, 80), expira_at: past(now, 40),
    recovery_until: new Date(Date.parse(now) + 80 * 60000).toISOString(), finalizado_at: null,
  },
}]
recovery.panel_state = null
recovery.session_capability = { ...base.session_capability, mode: 'none', estado: null, capture_allowed: false, pending_delivery_allowed: false }
recovery.start_capability = { allowed: false, reason: 'recovery_pending' }
recovery.stock = { ...base.stock, confirmado_at: now, capturado_at: now, snapshot_expira_at: new Date(Date.parse(now) + 120 * 60000).toISOString() }

const scenario = new URL(location.href).searchParams.get('scenario') ?? 'success'
const requests: Array<{ name: string; payload: Record<string, unknown> }> = []
let attempts = 0
let resolved = false
const call: CashierV4Rpc = async (name, args) => {
  const payload = args.p_payload as Record<string, unknown>
  requests.push({ name, payload })
  if (name === 'rpc_solog_cashier_bootstrap_v4') {
    return resolved ? { ...recovery, recovery_sessions: [], start_capability: { allowed: true, reason: null } } : recovery
  }
  if (name !== 'rpc_solog_cashier_orphan_finish_v1') throw new Error('RPC inesperada: ' + name)
  attempts++
  if (scenario === 'blocked') throw new Error('SOLOG_RECOVERY_OPERATION_UNRESOLVED')
  if (scenario === 'retry' && attempts === 1) throw new Error('timeout')
  resolved = true
  const result = cashierV4Mutation('finish')
  result.conteo_id = session.id
  result.finalizado_at = now
  result.generated_at = now
  result.session_capability = {
    mode: 'none', estado: 'finalizado', capture_allowed: false, pending_delivery_allowed: false,
    expira_at: recovery.recovery_sessions[0].expira_at,
    recovery_until: recovery.recovery_sessions[0].recovery_until,
    finalizado_at: now,
  }
  return result
}
const store = new CashierV4Store(cashierV4Ids.user, cashierV4DeviceToken, call)
store.acceptBootstrap(recovery)
const runtime = new CashierV4Runtime(store, new CashierV4DraftStorage(window.localStorage), call)
type TestWindow = Window & { __recoveryTest?: { requests: typeof requests; runtime: CashierV4Runtime; store: CashierV4Store } }
;(window as TestWindow).__recoveryTest = { requests, runtime, store }
function Harness() {
  const [mounted, setMounted] = useState(true)
  useEffect(() => () => { runtime.dispose(); store.dispose() }, [])
  return mounted ? <CashierV4Provider store={store}>
    <CajeroV4 runtime={runtime} route="/cajero" onLogout={async () => { setMounted(false) }} />
  </CashierV4Provider> : <p>Sesión cerrada</p>
}
createRoot(document.getElementById('root')!).render(<Harness />)
