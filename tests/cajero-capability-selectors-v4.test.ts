import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import { parseCashierV4Bootstrap } from '../src/features/solog/cajero/cajero.v4.api'
import { cashierV4Reducer, createCashierV4State } from '../src/features/solog/cajero/cajero.v4.store'
import {
  canCashierV4CaptureForSession, canCashierV4DeliverPendingForSession, cashierV4EffectiveCapability,
  getCashierV4SessionByConteoId, getCashierV4SessionCapability, getCashierV4SessionScope, isCashierV4RecoverySession,
} from '../src/features/solog/cajero/cajero.v4.capability'
import {
  cashierV4CoverageLabel, cashierV4Destination, selectCashierV4Coverage,
  selectCashierV4CoverageGroups, selectCashierV4CoverageQueue, selectCashierV4DailyGroups, selectCashierV4DailyQueue,
  selectCashierV4Destination, selectCashierV4ReviewGroups, selectCashierV4ReviewQueue, selectCashierV4WaitingForSnapshot,
} from '../src/features/solog/cajero/cajero.v4.selectors'
import { cashierV4Bootstrap, cashierV4Capability, cashierV4Ids as ids, cashierV4Panel } from './fixtures/cashier-v4.mjs'

const stateFor = (kind = 'active_recovery', options = {}) => cashierV4Reducer(createCashierV4State(), {
  type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(cashierV4Bootstrap(kind, options)),
})

describe('Cajero V4: capabilities y scopes', () => {
  test('busca cada sesión y su capability sin confundir active y recovery', () => {
    const state = stateFor()
    const now = Date.parse(state.bootstrap!.server_now)
    expect(getCashierV4SessionByConteoId(state, ids.session)).toBe(state.panel_state!.session)
    expect(getCashierV4SessionByConteoId(state, ids.recovery)).toBe(state.recovery_sessions[0])
    expect(getCashierV4SessionByConteoId(state, ids.operation)).toBeNull()
    expect(getCashierV4SessionCapability(state, ids.recovery)).toBe(state.recovery_sessions[0].session_capability)
    expect(isCashierV4RecoverySession(state, ids.recovery)).toBe(true)
    expect(isCashierV4RecoverySession(state, ids.session)).toBe(false)
    expect(canCashierV4CaptureForSession(state, ids.session, now)).toBe(true)
    expect(canCashierV4CaptureForSession(state, ids.recovery, now)).toBe(false)
    expect(canCashierV4DeliverPendingForSession(state, ids.recovery, now)).toBe(true)
    expect(canCashierV4CaptureForSession(state, ids.operation, now)).toBe(false)
    expect(canCashierV4DeliverPendingForSession(state, ids.operation, now)).toBe(false)
  })
  test('recovery sin panel permite solo delivery autorizado', () => {
    const state = stateFor('recovery')
    const now = Date.parse(state.bootstrap!.server_now)
    expect(state.panel_state).toBeNull()
    expect(canCashierV4DeliverPendingForSession(state, ids.recovery, now)).toBe(true)
    expect(canCashierV4CaptureForSession(state, ids.recovery, now)).toBe(false)
    const capability = getCashierV4SessionCapability(state, ids.recovery)!
    expect(cashierV4EffectiveCapability({ ...capability, capture_allowed: true }, true, now).captureAllowed).toBe(false)
    expect(cashierV4EffectiveCapability({ ...capability, pending_delivery_allowed: false }, true, now).pendingDeliveryAllowed).toBe(false)
  })
  test('backend niega permisos aunque el reloj esté dentro de la ventana', () => {
    const cap = cashierV4Capability('active')
    const now = Date.parse(cap.iniciado_at)
    expect(cashierV4EffectiveCapability({ ...cap, capture_allowed: false }, true, now).captureAllowed).toBe(false)
    expect(cashierV4EffectiveCapability({ ...cap, pending_delivery_allowed: false }, true, now).pendingDeliveryAllowed).toBe(false)
    expect(cashierV4EffectiveCapability(cap, false, now)).toMatchObject({ captureAllowed: false, pendingDeliveryAllowed: false })
    expect(cashierV4EffectiveCapability({ ...cap, mode: 'none' }, true, now)).toMatchObject({ captureAllowed: false, pendingDeliveryAllowed: false })
  })
  test('error terminal restringe permisos hasta nuevo bootstrap sin eliminar sesiones', () => {
    const state = stateFor()
    const denied = cashierV4Reducer(state, { type: 'error', error: new SologApiError('SOLOG_DEVICE_UNAUTHORIZED') })
    const now = Date.parse(state.bootstrap!.server_now)
    expect(canCashierV4CaptureForSession(denied, ids.session, now)).toBe(false)
    expect(canCashierV4DeliverPendingForSession(denied, ids.recovery, now)).toBe(false)
    expect(denied.recovery_sessions).toBe(state.recovery_sessions)
    const refreshing = cashierV4Reducer(denied, { type: 'loading' })
    expect(canCashierV4CaptureForSession(refreshing, ids.session, now)).toBe(false)
    expect(canCashierV4DeliverPendingForSession(refreshing, ids.recovery, now)).toBe(false)
  })
  test('reloj restringe en bordes exactos sin reinterpretar mode', () => {
    const cap = cashierV4Capability('active')
    const start = Date.parse(cap.iniciado_at)
    const expiry = Date.parse(cap.expira_at)
    const deadline = Date.parse(cap.recovery_until)
    expect(cashierV4EffectiveCapability(cap, true, start - 1).captureAllowed).toBe(false)
    expect(cashierV4EffectiveCapability(cap, true, expiry - 1).captureAllowed).toBe(true)
    expect(cashierV4EffectiveCapability(cap, true, expiry)).toEqual({ mode: 'active', captureAllowed: false, pendingDeliveryAllowed: true })
    expect(cashierV4EffectiveCapability(cap, true, deadline).pendingDeliveryAllowed).toBe(false)
    const recovery = { ...cap, mode: 'recovery' as const, estado: 'recovery' as const, capture_allowed: false }
    expect(cashierV4EffectiveCapability(recovery, true, start).mode).toBe('recovery')
    expect(cashierV4EffectiveCapability(recovery, true, start).captureAllowed).toBe(false)
    expect(cashierV4EffectiveCapability(cap, true, NaN).pendingDeliveryAllowed).toBe(false)
    expect(cashierV4EffectiveCapability({ ...cap, expira_at: 'invalid' }, true, start).captureAllowed).toBe(false)
  })
  test('revision desde basis, nunca desde session o revisión global; recovery desconocida no la inventa', () => {
    const state = stateFor()
    state.revisions!.groups = 999
    expect(getCashierV4SessionScope(state, ids.session)).toEqual({ conteo_id: ids.session, expected_groups_revision: 7 })
    expect(getCashierV4SessionScope(state, ids.recovery)).toBeNull()
    expect(getCashierV4SessionScope(stateFor('recovery'), ids.recovery)).toBeNull()
    expect(getCashierV4SessionScope(state, ids.operation)).toBeNull()
  })
})

describe('Cajero V4: selectors autoritativos', () => {
  test.each([
    ['review', '/cajero/revisar'], ['coverage', '/cajero/conteo'], ['daily', '/cajero/diario'], ['none', '/cajero'],
  ] as const)('%s resuelve %s', (action, path) => {
    expect(cashierV4Destination(action)).toBe(path)
    expect(selectCashierV4Destination(stateFor('pre_session', { next_action: action }))).toBe(path)
    expect(selectCashierV4Destination(stateFor('active', { next_action: action }))).toBe(path)
  })
  test('destino no se deduce de KPI o datos incidentales y no implica permiso de captura', () => {
    const state = stateFor('active', { next_action: 'none' })
    state.panel_state!.daily_queue = [ids.daily]
    state.panel_state!.kpis.coverage_percent = 100
    expect(selectCashierV4Destination(state)).toBe('/cajero')
    expect(selectCashierV4DailyGroups(state.panel_state).map(group => group.grupo_id)).toEqual([ids.daily])
    expect(selectCashierV4Destination(createCashierV4State())).toBeNull()
  })
  test('waiting snapshot exige las tres condiciones, también en pre-session', () => {
    expect(selectCashierV4WaitingForSnapshot(stateFor('pre_session', { next_action: 'none' }))).toBe(true)
    const state = stateFor('active', { next_action: 'none' })
    expect(selectCashierV4WaitingForSnapshot(state)).toBe(true)
    state.panel_state!.next_action = 'coverage'
    expect(selectCashierV4WaitingForSnapshot(state)).toBe(false)
    state.panel_state!.next_action = 'none'
    state.panel_state!.kpis.coverage_pending = 0
    expect(selectCashierV4WaitingForSnapshot(state)).toBe(false)
    state.panel_state!.kpis.coverage_pending = 1
    state.panel_state!.kpis.coverage_blocked_waiting_snapshot = 0
    expect(selectCashierV4WaitingForSnapshot(state)).toBe(false)
    expect(selectCashierV4WaitingForSnapshot(createCashierV4State())).toBe(false)
  })
  test.each([1, 2] as const)('ronda %s usa label y cinco KPI backend sin reconstrucción', (round) => {
    const state = stateFor('pre_session', { ronda: round })
    expect(cashierV4CoverageLabel(round)).toBe(`Cobertura quincenal ${round}`)
    expect(selectCashierV4Coverage(state)).toEqual({
      coverage_round: round, coverage_total: 4, coverage_counted: 2, coverage_pending: 2, coverage_percent: 50,
      label: `Cobertura quincenal ${round}`,
    })
    expect(selectCashierV4Coverage(createCashierV4State())).toBeNull()
  })
  test('tres colas determinan grupos; accion, stock y KPI no sustituyen pertenencia', () => {
    const panel = cashierV4Panel()
    expect(selectCashierV4ReviewQueue(panel)).toBe(panel.review_queue)
    expect(selectCashierV4CoverageQueue(panel)).toBe(panel.coverage_queue)
    expect(selectCashierV4DailyQueue(panel)).toBe(panel.daily_queue)
    expect(selectCashierV4ReviewGroups(panel).map(group => group.grupo_id)).toEqual([ids.review])
    expect(selectCashierV4CoverageGroups(panel).map(group => group.grupo_id)).toEqual([ids.coverage])
    expect(selectCashierV4DailyGroups(panel).map(group => group.grupo_id)).toEqual([ids.daily])
    panel.groups[3].accion = 'coverage'
    panel.groups[1].stock_teorico = -10
    panel.groups[1].accion = 'none'
    expect(selectCashierV4CoverageGroups(panel).map(group => group.grupo_id)).toEqual([ids.coverage])
    panel.coverage_queue = []
    expect(selectCashierV4CoverageGroups(panel)).toEqual([])
    expect(selectCashierV4ReviewGroups(null)).toEqual([])
    expect(selectCashierV4CoverageGroups(null)).toEqual([])
    expect(selectCashierV4DailyGroups(null)).toEqual([])
  })
})
