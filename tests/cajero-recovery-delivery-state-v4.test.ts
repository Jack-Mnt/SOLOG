import { describe, expect, test } from 'bun:test'
import { parseCashierV4Bootstrap, parseCashierV4Mutation } from '../src/features/solog/cajero/cajero.v4.api'
import { cashierV4Reducer, createCashierV4State, CashierV4Store, type CashierV4State } from '../src/features/solog/cajero/cajero.v4.store'
import { getCashierV4DeliveryState } from '../src/features/solog/cajero/cajero.v4.selectors'
import {
  canCashierV4CaptureForSession, canPlanCashierV4Delivery, getCashierV4DeliveryPlanning,
  getCashierV4SessionCapability,
} from '../src/features/solog/cajero/cajero.v4.capability'
import {
  cashierV4Bootstrap, cashierV4Delta, cashierV4DeviceToken, cashierV4Ids as ids, cashierV4Mutation,
} from './fixtures/cashier-v4.mjs'

const A = ids.session
const B = ids.operation
const adopt = (state: CashierV4State, value: unknown) => cashierV4Reducer(state, {
  type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(value),
})
const initial = () => adopt(createCashierV4State(), cashierV4Bootstrap('active'))

function replacementBootstrap(active = true) {
  const a = cashierV4Bootstrap('active').panel_state!
  const b = cashierV4Bootstrap(active ? 'active_recovery' : 'recovery', { next_action: 'coverage' })
  b.recovery_sessions = [{
    id: A, iniciado_at: a.session.iniciado_at, expira_at: a.session.expira_at,
    recovery_until: a.session.recovery_until, snapshot_referencia_id: a.basis.snapshot_referencia_id,
    ronda: a.basis.ronda, turno: a.basis.turno,
    session_capability: { ...a.session_capability, mode: 'recovery', estado: 'recovery', capture_allowed: false },
  }]
  const later = (timestamp: string) => new Date(Date.parse(timestamp) + 120 * 60000).toISOString()
  b.generated_at = later(b.generated_at)
  b.server_now = later(b.server_now)
  b.revisions.groups = 1234 // Global revision is deliberately different from both frozen revisions.
  if (b.panel_state) {
    b.panel_state.session.id = B
    b.panel_state.basis.groups_revision = 99
    for (const key of ['iniciado_at', 'expira_at', 'recovery_until'] as const) {
      b.panel_state.session[key] = later(b.panel_state.session[key])
      b.panel_state.session_capability[key] = b.panel_state.session[key]
      b.session_capability[key] = b.panel_state.session[key]
    }
    for (const key of ['capturado_at', 'confirmado_at', 'snapshot_expira_at'] as const) b.stock[key] = later(b.stock[key]!)
  }
  return b
}

function applyRecoveryDelta(state: CashierV4State, action: 'save_batch' | 'recount_save_batch' = 'recount_save_batch') {
  const response = cashierV4Mutation(action)
  response.conteo_id = A
  response.panel_delta = cashierV4Delta({ next_action: 'coverage' })
  response.session_capability = state.recovery_sessions.find(session => session.id === A)!.session_capability
  response.panel_delta.session_capability = response.session_capability
  // Empty daily queue and different KPI prove this isn't a merge with B's data.
  response.panel_delta.daily_queue = []
  response.panel_delta.kpis.daily_pending = 0
  response.panel_delta.kpis.coverage_counted = 3
  response.panel_delta.kpis.coverage_pending = 1
  response.panel_delta.kpis.coverage_percent = 75
  return {
    response,
    state: cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(response, action) }),
  }
}

describe('Cajero 13.2A: estado operacional de delivery por sesión', () => {
  test('A active crea snapshot mínimo desde basis, queues, KPI y next_action backend', () => {
    const state = initial()
    const panel = state.panel_state!
    expect(getCashierV4DeliveryState(state, A)).toEqual({
      conteo_id: A, groups_revision: 7, review_queue: panel.review_queue,
      coverage_queue: panel.coverage_queue, daily_queue: panel.daily_queue,
      kpis: panel.kpis, next_action: 'review',
    })
    expect(getCashierV4DeliveryState(state, A)).not.toHaveProperty('groups')
    expect(getCashierV4DeliveryState(state, A)).not.toHaveProperty('session_capability')
    expect(state).not.toHaveProperty('panel_deltas')
  })
  test('bootstrap A recovery + B active conserva A intacta y crea B desde su propio basis', () => {
    const before = initial()
    const originalA = getCashierV4DeliveryState(before, A)
    const state = adopt(before, replacementBootstrap())
    expect(state.panel_state!.session.id).toBe(B)
    expect(getCashierV4DeliveryState(state, A)).toBe(originalA)
    expect(getCashierV4DeliveryState(state, A)!.next_action).toBe('review')
    expect(getCashierV4DeliveryState(state, A)!.groups_revision).toBe(7)
    expect(getCashierV4DeliveryState(state, A)!.review_queue[0].priority_class).toBe('review_for_coverage')
    expect(getCashierV4DeliveryState(state, B)!.groups_revision).toBe(99)
    expect(getCashierV4DeliveryState(state, B)!.next_action).toBe('coverage')
    expect(getCashierV4DeliveryState(state, B)!.review_queue[0].priority_class).toBe('review_for_coverage')
    expect(state.revisions!.groups).toBe(1234)
    expect(getCashierV4SessionCapability(state, A)?.mode).toBe('recovery')
  })
  test.each(['save_batch', 'recount_save_batch'] as const)('delta %s A reemplaza todas las colas, KPI y prioridad sin tocar B', (action) => {
    const before = adopt(initial(), replacementBootstrap())
    const originalA = getCashierV4DeliveryState(before, A)!
    const originalB = getCashierV4DeliveryState(before, B)
    const { state, response } = applyRecoveryDelta(before, action)
    const nextA = getCashierV4DeliveryState(state, A)!
    expect(nextA.review_queue).toBe(response.panel_delta.review_queue)
    expect(nextA.coverage_queue).toBe(response.panel_delta.coverage_queue)
    expect(nextA.daily_queue).toBe(response.panel_delta.daily_queue)
    expect(nextA.kpis).toBe(response.panel_delta.kpis)
    expect(nextA.next_action).toBe('coverage')
    expect(nextA.groups_revision).toBe(7)
    expect(getCashierV4DeliveryState(state, B)).toBe(originalB)
    expect(state.panel_state).toBe(before.panel_state)
    expect(state.session_capability).toBe(before.session_capability)
    expect(originalA.next_action).toBe('review')
    expect(getCashierV4SessionCapability(state, A)).toBe(response.session_capability)
  })
  test('delta active actualiza su snapshot, conservando los snapshots ajenos', () => {
    const state = initial()
    const response = parseCashierV4Mutation(cashierV4Mutation('recount_save_batch'), 'recount_save_batch')
    const next = cashierV4Reducer(state, { type: 'mutation', response })
    expect(getCashierV4DeliveryState(next, A)!.next_action).toBe('daily')
    expect(getCashierV4DeliveryState(next, A)!.groups_revision).toBe(7)
    expect(getCashierV4DeliveryState(next, A)!.kpis).toBe(next.panel_state!.kpis)
  })
  test('start crea B y mantiene el snapshot de A aunque no sea el panel visible', () => {
    const before = adopt(initial(), replacementBootstrap(false))
    const response = cashierV4Mutation('start', { next_action: 'daily' })
    response.conteo_id = B
    response.panel_state.session.id = B
    response.panel_state.basis.groups_revision = 88
    const state = cashierV4Reducer(before, { type: 'mutation', response: parseCashierV4Mutation(response, 'start') })
    expect(getCashierV4DeliveryState(state, A)).toBe(getCashierV4DeliveryState(before, A))
    expect(getCashierV4DeliveryState(state, B)!.groups_revision).toBe(88)
    expect(getCashierV4DeliveryState(state, B)!.next_action).toBe('daily')
  })
  test('bootstrap actualiza B sin reconstruir o borrar el snapshot de A', () => {
    const before = adopt(initial(), replacementBootstrap())
    const updatedA = applyRecoveryDelta(before).state
    const b = replacementBootstrap()
    b.panel_state!.kpis.coverage_percent = 25
    const refreshed = adopt(updatedA, b)
    expect(getCashierV4DeliveryState(refreshed, A)).toBe(getCashierV4DeliveryState(updatedA, A))
    expect(getCashierV4DeliveryState(refreshed, B)!.kpis.coverage_percent).toBe(25)
    expect(getCashierV4DeliveryState(refreshed, A)!.kpis.coverage_percent).toBe(75)
  })
  test('capability vigente + delivery state hacen recovery planificable sin permitir captura', () => {
    const state = adopt(initial(), replacementBootstrap())
    const now = Date.parse(state.bootstrap!.server_now)
    expect(canPlanCashierV4Delivery(state, A, now)).toBe(true)
    expect(getCashierV4DeliveryPlanning(state, A, now).reason).toBeNull()
    expect(canCashierV4CaptureForSession(state, A, now)).toBe(false)
  })
  test('recovery conocida sin snapshot devuelve bloqueo explícito; no inventa revisión o prioridad', () => {
    const state = adopt(createCashierV4State(), replacementBootstrap())
    const now = Date.parse(state.bootstrap!.server_now)
    expect(getCashierV4DeliveryPlanning(state, A, now)).toMatchObject({
      canPlanDelivery: false, reason: 'missing_delivery_state', deliveryState: null,
    })
    expect(getCashierV4SessionCapability(state, A)?.pending_delivery_allowed).toBe(true)
    expect(getCashierV4DeliveryState(state, B)).not.toBeNull()
    const next = applyRecoveryDelta(state).state
    expect(getCashierV4DeliveryState(next, A)).toBeNull()
    expect(canPlanCashierV4Delivery(next, A, now)).toBe(false)
  })
  test('capability actual denegada prevalece sobre el snapshot conservado', () => {
    const b = replacementBootstrap()
    b.recovery_sessions[0].session_capability.pending_delivery_allowed = false
    const state = adopt(initial(), b)
    expect(getCashierV4DeliveryPlanning(state, A, Date.parse(b.server_now))).toMatchObject({
      canPlanDelivery: false, reason: 'delivery_not_allowed',
    })
    expect(getCashierV4DeliveryState(state, A)).not.toBeNull()
  })
  test('delta que deniega delivery revoca planificabilidad solo de A', () => {
    const before = adopt(initial(), replacementBootstrap())
    const { response } = applyRecoveryDelta(before)
    response.session_capability = { ...response.session_capability, pending_delivery_allowed: false }
    response.panel_delta.session_capability = response.session_capability
    const next = cashierV4Reducer(before, { type: 'mutation', response: parseCashierV4Mutation(response, 'recount_save_batch') })
    const now = Date.parse(next.bootstrap!.server_now)
    expect(canPlanCashierV4Delivery(before, A, now)).toBe(true)
    expect(canPlanCashierV4Delivery(next, A, now)).toBe(false)
    expect(canPlanCashierV4Delivery(next, B, now)).toBe(true)
  })
  test('sesión ausente conserva snapshot pero queda no entregable; no se purga por refresh', () => {
    const before = adopt(initial(), replacementBootstrap())
    const b = replacementBootstrap()
    b.recovery_sessions = []
    const state = adopt(before, b)
    expect(getCashierV4DeliveryState(state, A)).toBe(getCashierV4DeliveryState(before, A))
    expect(getCashierV4DeliveryPlanning(state, A, Date.parse(b.server_now))).toMatchObject({
      canPlanDelivery: false, reason: 'session_unavailable', capability: null,
    })
    const noPanel = adopt(state, cashierV4Bootstrap())
    expect(getCashierV4DeliveryState(noPanel, A)).not.toBeNull()
    expect(getCashierV4DeliveryState(noPanel, B)).not.toBeNull()
    expect(canPlanCashierV4Delivery(noPanel, B, Date.parse(b.server_now))).toBe(false)
  })
  test('reloj, dispositivo y mode none solo restringen el permiso vigente', () => {
    const state = adopt(initial(), replacementBootstrap())
    const now = Date.parse(state.bootstrap!.server_now)
    expect(canPlanCashierV4Delivery(state, A, Date.parse(state.recovery_sessions[0].recovery_until))).toBe(false)
    const b = replacementBootstrap()
    b.device.autorizado = false
    // Unauthorized bootstrap exposes no active panel/capability.
    b.panel_state = null
    b.session_capability = cashierV4Bootstrap().session_capability
    b.start_capability = { allowed: false, reason: 'SOLOG_DEVICE_UNAUTHORIZED' }
    const unauthorized = adopt(state, b)
    expect(canPlanCashierV4Delivery(unauthorized, A, now)).toBe(false)
    const expired = replacementBootstrap()
    expired.recovery_sessions[0].session_capability = {
      ...expired.recovery_sessions[0].session_capability,
      mode: 'none', estado: 'expirado', pending_delivery_allowed: false,
    }
    expect(canPlanCashierV4Delivery(adopt(state, expired), A, now)).toBe(false)
  })
  test('finish A retira su delivery state y recovery metadata, dejando B intacta', () => {
    const before = adopt(initial(), replacementBootstrap())
    const a = before.recovery_sessions[0]
    const response = cashierV4Mutation('finish')
    response.session_capability.expira_at = a.expira_at
    response.session_capability.recovery_until = a.recovery_until
    const state = cashierV4Reducer(before, { type: 'mutation', response: parseCashierV4Mutation(response, 'finish') })
    expect(getCashierV4DeliveryState(state, A)).toBeNull()
    expect(getCashierV4DeliveryState(state, B)).toBe(getCashierV4DeliveryState(before, B))
    expect(state.panel_state).toBe(before.panel_state)
    expect(state.recovery_sessions).toEqual([])
  })
  test('finish active retira su snapshot sin fabricar summary', () => {
    const state = cashierV4Reducer(initial(), {
      type: 'mutation', response: parseCashierV4Mutation(cashierV4Mutation('finish'), 'finish'),
    })
    expect(getCashierV4DeliveryState(state, A)).toBeNull()
    expect(state.panel_state).toBeNull()
    expect(state.pre_session_summary).toBeNull()
  })
  test('store refresh conserva A y expone B mediante el snapshot completo', async () => {
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, async () => replacementBootstrap())
    store.acceptBootstrap(cashierV4Bootstrap('active'))
    await store.refresh()
    expect(getCashierV4DeliveryState(store.getSnapshot(), A)!.next_action).toBe('review')
    expect(getCashierV4DeliveryState(store.getSnapshot(), A)!.review_queue[0].priority_class).toBe('review_for_coverage')
    expect(getCashierV4DeliveryState(store.getSnapshot(), B)!.next_action).toBe('coverage')
    store.dispose()
  })
})
