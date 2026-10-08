import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { SologApiError } from '../src/features/solog/errors'
import { parseCashierV4Bootstrap, parseCashierV4Mutation, type CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import type { CashierV4NextAction, CashierV4PanelDelta } from '../src/features/solog/cajero/cajero.v4'
import { CashierV4Store, cashierV4Reducer, createCashierV4State, type CashierV4State } from '../src/features/solog/cajero/cajero.v4.store'
import { CashierV4Provider, useCashierV4 } from '../src/features/solog/cajero/cajero.v4.context'
import {
  cashierV4Bootstrap, cashierV4DeviceToken, cashierV4Ids as ids,
  cashierV4Mutation, cashierV4Panel, cashierV4RecoverySession,
} from './fixtures/cashier-v4.mjs'

function bootstrap(kind = 'active', options = {}): CashierV4State {
  return cashierV4Reducer(createCashierV4State(), { type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(cashierV4Bootstrap(kind, options)) })
}

function transition(state: CashierV4State, next: CashierV4NextAction) {
  const panel = cashierV4Panel({ next_action: next })
  const response = cashierV4Mutation('save_batch')
  const before = state.panel_state!
  const delta: CashierV4PanelDelta = {
    groups_patch: panel.groups.filter(group => before.groups.find(old => old.grupo_id === group.grupo_id)?.accion !== group.accion)
      .map(({ grupo_id, accion, detalle_reconteo_id, contado_detalle_id, contado_at, recontado_at }) =>
        ({ grupo_id, accion, detalle_reconteo_id, contado_detalle_id, contado_at, recontado_at })),
    review_queue: panel.review_queue, coverage_queue: panel.coverage_queue, daily_queue: panel.daily_queue,
    kpis: panel.kpis, next_action: next, session_capability: panel.session_capability,
  }
  const parsed = parseCashierV4Mutation({ ...response, panel_delta: delta }, 'save_batch')
  return cashierV4Reducer(state, { type: 'mutation', response: parsed })
}

describe('Cajero V4: reducer', () => {
  test('pre-session válido mantiene summary sin fabricar grupos', () => {
    const state = bootstrap('pre_session')
    expect(state.panel_state).toBeNull()
    expect(state.pre_session_summary?.next_action).toBe('review')
    expect(state.revisions).toEqual({ groups: 7, devices: 2, operational: 10 })
    expect(state.stock?.snapshot_id).toBe(ids.snapshot)
    expect(state.lastSynchronizedAt).toBe(state.bootstrap!.generated_at)
    expect(state).not.toHaveProperty('groups')
    expect(state).not.toHaveProperty('stock_types')
  })
  test('carga panel active y capability sin mezclar basis y session', () => {
    const state = bootstrap()
    expect(state.panel_state?.session.estado).toBe('activo')
    expect(state.session_capability?.mode).toBe('active')
    expect(state.panel_state?.basis.groups_revision).toBe(7)
    expect(state.panel_state?.session).not.toHaveProperty('groups_revision')
  })
  test('delta reemplaza colas, KPI, next_action y capability; solo parchea grupos afectados', () => {
    const state = bootstrap()
    const previous = structuredClone(state)
    const next = transition(state, 'coverage')
    const delta = next.delivery_state_by_session[ids.session]!
    expect(next.panel_state!.review_queue).toBe(delta.review_queue)
    expect(next.panel_state!.coverage_queue).toBe(delta.coverage_queue)
    expect(next.panel_state!.daily_queue).toBe(delta.daily_queue)
    expect(next.panel_state!.kpis).toBe(delta.kpis)
    expect(next.panel_state!.session_capability).toBe(next.session_capability!)
    expect(next.panel_state!.next_action).toBe(delta.next_action)
    expect(next.panel_state!.groups[0].accion).toBe('none')
    expect(next.panel_state!.groups[0].nombre).toBe(state.panel_state!.groups[0].nombre)
    expect(next.panel_state!.groups[1]).toBe(state.panel_state!.groups[1])
    expect(next.panel_state!.basis).toBe(state.panel_state!.basis)
    expect(state).toEqual(previous)
  })
  test('backend gobierna coverage → review → daily → none', () => {
    let state = bootstrap('active', { next_action: 'coverage' })
    for (const next of ['review', 'daily', 'none'] as const) {
      state = transition(state, next)
      expect(state.panel_state!.next_action).toBe(next)
    }
    expect(state.panel_state!.kpis.coverage_pending).toBe(1)
    expect(state.panel_state!.next_action).toBe('none')
  })
  test('rechaza patches/colas fuera del universo congelado sin modificar estado', () => {
    const state = bootstrap()
    for (const field of ['groups_patch', 'coverage_queue'] as const) {
      const response = cashierV4Mutation('save_batch')
      if (field === 'groups_patch') response.panel_delta.groups_patch[0].grupo_id = ids.recovery
      else response.panel_delta.coverage_queue = [ids.recovery]
      const parsed = parseCashierV4Mutation(response, 'save_batch')
      expect(() => cashierV4Reducer(state, { type: 'mutation', response: parsed })).toThrow(SologApiError)
    }
    expect(state.delivery_state_by_session[ids.session]!.next_action).toBe('review')
  })
  test('active + N recovery coexisten; panel null conserva recoveries del bootstrap', () => {
    const value = cashierV4Bootstrap('active_recovery')
    value.recovery_sessions.push({ ...cashierV4RecoverySession(), id: ids.operation })
    const state = cashierV4Reducer(createCashierV4State(), { type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(value) })
    expect(state.panel_state!.session.id).toBe(ids.session)
    expect(state.recovery_sessions.map(session => session.id)).toEqual([ids.recovery, ids.operation])
    const withoutPanel = cashierV4Bootstrap('recovery')
    withoutPanel.recovery_sessions = value.recovery_sessions
    const next = cashierV4Reducer(state, { type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(withoutPanel) })
    expect(next.panel_state).toBeNull()
    expect(next.recovery_sessions).toHaveLength(2)
  })
  test('start mantiene recovery independiente al aparecer nueva active', () => {
    const state = bootstrap('recovery')
    const next = cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(cashierV4Mutation('start'), 'start') })
    expect(next.panel_state!.session.id).toBe(ids.session)
    expect(next.recovery_sessions).toEqual(state.recovery_sessions)
    expect(next.pre_session_summary).toBeNull()
  })
  test('start preserva el panel recovery anterior como entrada independiente', () => {
    const state = bootstrap('active', { estado: 'recovery' })
    const response = cashierV4Mutation('start')
    response.conteo_id = ids.operation
    response.panel_state.session.id = ids.operation
    const next = cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(response, 'start') })
    expect(next.panel_state!.session.id).toBe(ids.operation)
    expect(next.recovery_sessions.map(session => session.id)).toEqual([ids.session])
    expect(next.recovery_sessions[0].session_capability).toBe(state.panel_state!.session_capability)
    expect(next.recovery_sessions[0]).not.toHaveProperty('groups_revision')
  })
  test('delta recovery no cambia panel ni capability de active', () => {
    const state = bootstrap('active_recovery')
    const response = cashierV4Mutation('save_batch')
    response.conteo_id = ids.recovery
    response.session_capability = state.recovery_sessions[0].session_capability
    response.panel_delta.session_capability = response.session_capability
    response.revisions.operational = 1
    const next = cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(response, 'save_batch') })
    expect(next.panel_state).toBe(state.panel_state)
    expect(next.session_capability).toBe(state.session_capability)
    // No panel for this recovery was received: a delta cannot invent its frozen revision.
    expect(next.delivery_state_by_session[ids.recovery]).toBeUndefined()
    expect(next.recovery_sessions[0].session_capability.mode).toBe('recovery')
    expect(next.revisions!.operational).toBe(10)
  })
  test('finish recovery mantiene active; finish active no inventa summary ni borra otras recoveries', () => {
    const state = bootstrap('active_recovery')
    const finish = cashierV4Mutation('finish')
    const recoveryFinish = {
      ...finish, conteo_id: ids.recovery,
      session_capability: { ...finish.session_capability,
        expira_at: state.recovery_sessions[0].expira_at, recovery_until: state.recovery_sessions[0].recovery_until },
    }
    const next = cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(recoveryFinish, 'finish') })
    expect(next.panel_state).toBe(state.panel_state)
    expect(next.recovery_sessions).toEqual([])
    const closed = cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(finish, 'finish') })
    expect(closed.panel_state).toBeNull()
    expect(closed.pre_session_summary).toBeNull()
    expect(closed.recovery_sessions).toEqual(state.recovery_sessions)
    expect(closed.session_capability?.mode).toBe('none')
    expect(closed.session_capability?.recovery_until).toBe(finish.session_capability.recovery_until)
  })
  test('bootstrap posterior puede revocar recoveries; no se conservan permisos obsoletos', () => {
    const state = bootstrap('recovery')
    const next = cashierV4Reducer(state, { type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(cashierV4Bootstrap()) })
    expect(next.recovery_sessions).toEqual([])
  })
  test('delta actualiza estado recovery desde capability backend', () => {
    const state = bootstrap()
    const response = cashierV4Mutation('save_batch', { estado: 'recovery' })
    const next = cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(response, 'save_batch') })
    expect(next.panel_state?.session.estado).toBe('recovery')
    expect(next.panel_state?.session_capability.capture_allowed).toBe(false)
  })
  test('rechaza respuesta de sesión desconocida', () => {
    const response = parseCashierV4Mutation({ ...cashierV4Mutation('finish'), conteo_id: ids.operation }, 'finish')
    expect(() => cashierV4Reducer(bootstrap(), { type: 'mutation', response })).toThrow()
  })
  test('recovery no adopta mode active ni ventanas de otra sesión', () => {
    const state = bootstrap('active_recovery')
    const response = cashierV4Mutation('save_batch')
    response.conteo_id = ids.recovery
    expect(() => cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(response, 'save_batch') })).toThrow()
    response.session_capability = { ...state.recovery_sessions[0].session_capability, mode: 'active', estado: 'activo', capture_allowed: true }
    response.panel_delta.session_capability = response.session_capability
    expect(() => cashierV4Reducer(state, { type: 'mutation', response: parseCashierV4Mutation(response, 'save_batch') })).toThrow()
  })
})

describe('Cajero V4: store/provider foundation', () => {
  test('refresh deduplica, notifica, guarda reloj y conserva state snapshot estable', async () => {
    let calls = 0
    const b = cashierV4Bootstrap('active_recovery')
    const call: CashierV4Rpc = async () => { calls++; return b }
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, call, () => Date.parse(b.server_now) - 1000)
    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications++ })
    const first = store.refresh()
    expect(store.refresh()).toBe(first)
    expect(store.getSnapshot().loading).toBe(true)
    await first
    expect(calls).toBe(1)
    expect(notifications).toBe(2)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
    expect(store.getSnapshot().recovery_sessions).toHaveLength(1)
    expect(store.serverOffsetMs).toBe(1000)
    unsubscribe()
    store.dispose()
  })
  test('error de carga conserva dataset anterior sin retry automático', async () => {
    const failure = new SologApiError('SOLOG_DEVICE_UNAUTHORIZED')
    let calls = 0
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, async () => { calls++; throw failure })
    store.acceptBootstrap(cashierV4Bootstrap('active_recovery'))
    await expect(store.refresh()).rejects.toBe(failure)
    expect(store.getSnapshot().loading).toBe(false)
    expect(store.getSnapshot().error).toBe(failure)
    expect(store.getSnapshot().recovery_sessions).toHaveLength(1)
    expect(calls).toBe(1)
  })
  test('bootstrap de otro usuario no se adopta', () => {
    const store = new CashierV4Store(ids.recovery, cashierV4DeviceToken)
    expect(() => store.acceptBootstrap(cashierV4Bootstrap())).toThrow()
    expect(store.getSnapshot().bootstrap).toBeNull()
  })
  test('respuesta tardía de refresh no sobreescribe mutación aceptada', async () => {
    let resolve!: (value: unknown) => void
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, () => new Promise(done => { resolve = done }))
    store.acceptBootstrap(cashierV4Bootstrap())
    const refreshing = store.refresh()
    store.acceptMutation(parseCashierV4Mutation(cashierV4Mutation('start'), 'start'))
    resolve(cashierV4Bootstrap())
    await refreshing
    expect(store.getSnapshot().panel_state!.session.id).toBe(ids.session)
    expect(store.getSnapshot().loading).toBe(false)
  })
  test('dispose bloquea adopción de respuestas tardías', async () => {
    let resolve!: (value: unknown) => void
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, () => new Promise(done => { resolve = done }))
    const refreshing = store.refresh()
    store.dispose()
    resolve(cashierV4Bootstrap('active'))
    await refreshing
    expect(store.getSnapshot().bootstrap).toBeNull()
    await expect(store.refresh()).rejects.toThrow('cerrado')
  })
  test('bootstrap adoptado manualmente invalida refresh anterior', async () => {
    let resolve!: (value: unknown) => void
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, () => new Promise(done => { resolve = done }))
    const refreshing = store.refresh()
    store.acceptBootstrap(cashierV4Bootstrap('active_recovery'))
    resolve(cashierV4Bootstrap())
    await refreshing
    expect(store.getSnapshot().panel_state).not.toBeNull()
    expect(store.getSnapshot().recovery_sessions).toHaveLength(1)
  })
  test('provider inyectado expone estado sin arrancar RPC o storage productivo', () => {
    let calls = 0
    const store = new CashierV4Store(ids.user, cashierV4DeviceToken, async () => { calls++; return cashierV4Bootstrap() })
    store.acceptBootstrap(cashierV4Bootstrap('recovery'))
    function Probe() {
      const { state, store: contextStore } = useCashierV4()
      expect(contextStore).toBe(store)
      return createElement('span', null, state.recovery_sessions.length)
    }
    expect(renderToString(createElement(CashierV4Provider, { store, children: createElement(Probe) }))).toBe('<span>1</span>')
    expect(calls).toBe(0)
  })
})
