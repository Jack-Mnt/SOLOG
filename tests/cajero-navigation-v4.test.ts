import { describe, expect, test } from 'bun:test'
import { parseCashierV4Bootstrap, parseCashierV4Mutation } from '../src/features/solog/cajero/cajero.v4.api'
import { cashierV4Reducer, createCashierV4State } from '../src/features/solog/cajero/cajero.v4.store'
import {
  cashierV4AfterStartDestination, getCashierV4RouteAccess, selectCashierV4BottomNavigation,
  selectCashierV4CaptureDestination,
} from '../src/features/solog/cajero/cajero.v4.navigation'
import { selectCashierV4Destination, selectCashierV4HistoryAvailable, selectCashierV4WaitingForSnapshot } from '../src/features/solog/cajero/cajero.v4.selectors'
import { cashierV4Bootstrap, cashierV4Mutation } from './fixtures/cashier-v4.mjs'

function stateFor(kind = 'active', options = {}) {
  return cashierV4Reducer(createCashierV4State(), { type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(cashierV4Bootstrap(kind, options)) })
}
const nowFor = (state: ReturnType<typeof stateFor>) => Date.parse(state.bootstrap!.server_now)
const captureRoutes = ['/cajero/conteo', '/cajero/diario', '/cajero/revisar'] as const

describe('Cajero 13.4: navegación autoritativa', () => {
  test.each([
    ['review', '/cajero/revisar'], ['coverage', '/cajero/conteo'], ['daily', '/cajero/diario'], ['none', '/cajero'],
  ] as const)('active %s dirige captura a %s y deshabilita los otros módulos', (next_action, expected) => {
    const state = stateFor('active', { next_action })
    const now = nowFor(state)
    expect(selectCashierV4CaptureDestination(state, now)).toBe(expected)
    for (const route of captureRoutes) {
      const access = getCashierV4RouteAccess(state, route, now)
      expect(access.allowed).toBe(route === expected)
      if (!access.allowed) expect(access.redirect).toBe(expected)
    }
  })
  test.each(['review', 'coverage', 'daily', 'none'] as const)('Inicio siempre permitido con next_action %s', next_action => {
    const state = stateFor('active', { next_action })
    expect(getCashierV4RouteAccess(state, '/cajero', nowFor(state))).toEqual({ allowed: true, route: '/cajero' })
  })
  test.each([
    ['review', '/cajero/conteo', '/cajero/revisar'],
    ['coverage', '/cajero/diario', '/cajero/conteo'],
    ['daily', '/cajero/revisar', '/cajero/diario'],
  ] as const)('direct-route %s: %s redirige a %s', (next_action, request, redirect) => {
    const state = stateFor('active', { next_action })
    expect(getCashierV4RouteAccess(state, request, nowFor(state))).toEqual({ allowed: false, redirect, reason: 'operational_priority' })
  })
  test.each(['pre_session', 'recovery'])('%s sin active no autoriza captura, aunque summary y recovery indiquen trabajo', kind => {
    const state = stateFor(kind, { next_action: 'review' })
    expect(selectCashierV4Destination(state)).toBe('/cajero/revisar') // CTA only.
    for (const route of captureRoutes) expect(getCashierV4RouteAccess(state, route, nowFor(state))).toEqual({
      allowed: false, redirect: '/cajero', reason: 'capture_unavailable',
    })
    expect(getCashierV4RouteAccess(state, '/cajero', nowFor(state)).allowed).toBe(true)
    expect(selectCashierV4BottomNavigation(state, nowFor(state)).filter(item => item.available).map(item => item.route)).toEqual(['/cajero'])
  })
  test('active + recovery solo usa panel active, aunque recovery tenga review y otra revisión', () => {
    const state = stateFor('active_recovery', { next_action: 'daily' })
    const a = state.recovery_sessions[0].id
    state.delivery_state_by_session = { ...state.delivery_state_by_session,
      [a]: { ...state.delivery_state_by_session[state.panel_state!.session.id]!, conteo_id: a, groups_revision: 999, next_action: 'review' } }
    expect(selectCashierV4CaptureDestination(state, nowFor(state))).toBe('/cajero/diario')
    expect(getCashierV4RouteAccess(state, '/cajero/revisar', nowFor(state))).toMatchObject({ allowed: false, redirect: '/cajero/diario' })
    expect(selectCashierV4BottomNavigation(state, nowFor(state)).filter(item => item.available).map(item => item.route)).toEqual([
      '/cajero', '/cajero/diario', '/cajero/historial',
    ])
  })
  test('summary coverage → start review usa exclusivamente start.panel_state.next_action', () => {
    const before = stateFor('pre_session', { next_action: 'coverage' })
    expect(selectCashierV4Destination(before)).toBe('/cajero/conteo')
    expect(getCashierV4RouteAccess(before, '/cajero/conteo', nowFor(before)).allowed).toBe(false)
    const start = parseCashierV4Mutation(cashierV4Mutation('start', { next_action: 'review' }), 'start')
    expect(cashierV4AfterStartDestination(start)).toBe('/cajero/revisar')
    const after = cashierV4Reducer(before, { type: 'mutation', response: start })
    expect(selectCashierV4CaptureDestination(after, nowFor(after))).toBe('/cajero/revisar')
  })
  test.each(['review', 'coverage', 'daily', 'none'] as const)('destino post-start %s proviene del panel de la respuesta', next_action => {
    const start = parseCashierV4Mutation(cashierV4Mutation('start', { next_action }), 'start')
    expect(cashierV4AfterStartDestination(start)).toBe(selectCashierV4Destination(stateFor('active', { next_action })))
  })
  test('Historial usa coverage_pending=0, permanece read-only y no sustituye prioridad review', () => {
    const state = stateFor('active', { next_action: 'review' })
    const panel = state.panel_state!
    panel.kpis.coverage_pending = 0
    panel.kpis.coverage_counted = panel.kpis.coverage_total
    panel.kpis.coverage_percent = 100
    panel.kpis.coverage_queue_pending = 0
    panel.coverage_queue = []
    panel.groups.find(group => group.accion === 'coverage')!.accion = 'none'
    expect(panel.kpis.review_pending).toBeGreaterThan(0)
    expect(selectCashierV4HistoryAvailable(state)).toBe(true)
    expect(getCashierV4RouteAccess(state, '/cajero/historial', nowFor(state))).toEqual({ allowed: true, route: '/cajero/historial' })
    expect(selectCashierV4CaptureDestination(state, nowFor(state))).toBe('/cajero/revisar')
  })
  test('Historial pre-session completo no habilita captura; porcentaje solo no habilita Historial', () => {
    const state = stateFor('pre_session', { next_action: 'daily' })
    expect(selectCashierV4HistoryAvailable(state)).toBe(true)
    expect(getCashierV4RouteAccess(state, '/cajero/historial', nowFor(state)).allowed).toBe(true)
    expect(getCashierV4RouteAccess(state, '/cajero/diario', nowFor(state)).allowed).toBe(false)
    state.pre_session_summary!.kpis.coverage_pending = 1
    expect(getCashierV4RouteAccess(state, '/cajero/historial', nowFor(state))).toEqual({ allowed: false, redirect: '/cajero', reason: 'history_unavailable' })
  })
  test('waiting snapshot deja Inicio disponible y no elige coverage artificialmente', () => {
    const state = stateFor('active', { next_action: 'none' })
    expect(selectCashierV4WaitingForSnapshot(state)).toBe(true)
    expect(selectCashierV4CaptureDestination(state, nowFor(state))).toBe('/cajero')
    expect(selectCashierV4BottomNavigation(state, nowFor(state)).filter(item => item.available).map(item => item.route)).toEqual(['/cajero'])
  })
  test('capability negada, expiración y panel recovery restringen rutas de nueva captura', () => {
    const state = stateFor()
    expect(selectCashierV4CaptureDestination(state, Date.parse(state.panel_state!.session.expira_at))).toBe('/cajero')
    state.panel_state!.session_capability.capture_allowed = false
    expect(selectCashierV4CaptureDestination(state, nowFor(state))).toBe('/cajero')
    const recovery = stateFor('active', { estado: 'recovery' })
    expect(selectCashierV4CaptureDestination(recovery, nowFor(recovery))).toBe('/cajero')
  })
  test('navegación inferior conserva labels/orden actuales y aplica la misma política de acceso', () => {
    const state = stateFor('active', { next_action: 'coverage' })
    const items = selectCashierV4BottomNavigation(state, nowFor(state))
    expect(items.map(item => item.label)).toEqual(['Inicio', 'Conteo', 'Conteo diario', 'Revisar', 'Historial'])
    expect(items.map(item => item.available)).toEqual([true, true, false, false, false])
    items.forEach(item => expect(item.available).toBe(getCashierV4RouteAccess(state, item.route, nowFor(state)).allowed))
  })
  test('legacy, queues y grupos incidentales no sustituyen next_action', () => {
    const state = stateFor('active', { next_action: 'none' })
    Object.assign(state, { periodComplete: true, drafts: [{ grupo_id: 'fake' }] })
    state.panel_state!.coverage_queue = [state.panel_state!.groups[0].grupo_id]
    state.panel_state!.kpis.coverage_percent = 100
    state.panel_state!.groups[0].accion = 'coverage'
    expect(selectCashierV4CaptureDestination(state, nowFor(state))).toBe('/cajero')
    expect(selectCashierV4HistoryAvailable(state)).toBe(false)
    expect(getCashierV4RouteAccess(state, '/cajero/desconocido', nowFor(state))).toMatchObject({ allowed: false, redirect: '/cajero', reason: 'unknown_route' })
  })
})
