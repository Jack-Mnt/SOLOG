import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import { parseCashierV4Bootstrap, parseCashierV4Mutation, validateCashierV4Panel, validateCashierV4PanelDelta } from '../src/features/solog/cajero/cajero.v4.api'
import { cashierV4SessionRequestScope } from '../src/features/solog/cajero/cajero.v4'
import { cashierV4Bootstrap, cashierV4Capability, cashierV4Delta, cashierV4Ids as ids, cashierV4Mutation, cashierV4Panel } from './fixtures/cashier-v4.mjs'

function changed(value: unknown, path: string, replacement?: unknown) {
  const copy = structuredClone(value) as Record<string, unknown>
  const keys = path.split('.')
  let parent = copy
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>
  if (replacement === undefined) delete parent[keys.at(-1)!]
  else parent[keys.at(-1)!] = replacement
  return copy
}

describe('Cajero V4: contrato independiente', () => {
  test.each([1, 2] as const)('basis de ronda %i separado de session', (ronda) => {
    const panel = validateCashierV4Panel(cashierV4Panel({ ronda }))
    expect(panel.basis.ronda).toBe(ronda)
    expect(panel.basis.ronda_desde).toBe(ronda === 1 ? '2026-10-01T05:00:00Z' : '2026-10-08T05:00:00Z')
    expect(panel.kpis.coverage_round).toBe(ronda)
    expect(panel.session).not.toHaveProperty('groups_revision')
    expect(panel.session).not.toHaveProperty('ronda')
    expect(cashierV4SessionRequestScope(panel)).toEqual({ conteo_id: ids.session, expected_groups_revision: 7 })
  })
  test.each(['early', 'day', 'night'] as const)('conserva basis del turno %s', (turno) => {
    const panel = validateCashierV4Panel(cashierV4Panel({ turno }))
    expect(panel.basis.turno).toBe(turno)
    expect(Date.parse(panel.basis.turno_desde)).toBeLessThan(Date.parse(panel.basis.turno_hasta))
  })
  test.each(['review', 'coverage', 'daily', 'none'] as const)('acepta next_action=%s sin sustituirlo', (next_action) => {
    const input = cashierV4Panel({ next_action })
    expect(validateCashierV4Panel(input).next_action).toBe(next_action)
    const summary = parseCashierV4Bootstrap(cashierV4Bootstrap('pre_session', { next_action })).pre_session_summary!
    expect(summary.next_action).toBe(next_action)
  })
  test('valida las tres colas y conserva metadata de review', () => {
    const panel = validateCashierV4Panel(cashierV4Panel())
    expect(panel.review_queue).toEqual([{ grupo_id: ids.review, detalle_id: ids.detail,
      ultima_diferencia: -2, contado_at: '2026-09-30T22:00:00Z' }])
    expect(panel.coverage_queue).toEqual([ids.coverage])
    expect(panel.daily_queue).toEqual([ids.daily])
    expect(panel.groups.map(g => g.accion)).toEqual(['recount', 'coverage', 'daily', 'none'])
  })
  test.each(['activo', 'recovery', 'finalizado', 'expirado'] as const)('acepta session.estado=%s', (estado) => {
    const panel = validateCashierV4Panel(cashierV4Panel({ estado }))
    expect(panel.session.estado).toBe(estado)
    if (estado === 'recovery') expect(panel.session_capability).toMatchObject({ mode: 'recovery', capture_allowed: false, pending_delivery_allowed: true })
  })
  test('V4 no necesita campos retirados ni basis duplicado', () => {
    const panel = validateCashierV4Panel(cashierV4Panel())
    const retired = ['cobertura_periodo', 'requiere_conteo', 'requiere_reconteo', 'estado_stock',
      'count_queue', 'groups_total', 'count_pending', 'stock_types', 'count_queue_remove', 'review_queue_remove']
    const wire = JSON.stringify([panel, cashierV4Bootstrap(), cashierV4Delta()])
    for (const field of retired) expect(wire).not.toContain('"' + field + '"')
    const extraSession = { ...panel, session: { ...panel.session, groups_revision: 999 } }
    expect(cashierV4SessionRequestScope(validateCashierV4Panel(extraSession)).expected_groups_revision).toBe(7)
  })
  test.each(['basis.groups_revision', 'basis.ronda', 'basis.ronda_desde', 'basis.ronda_hasta',
    'basis.turno', 'basis.turno_desde', 'basis.turno_hasta', 'basis.snapshot_referencia_id',
    'basis.version_catalogo', 'session.estado', 'groups', 'review_queue', 'coverage_queue', 'daily_queue',
    'next_action', 'session_capability', 'groups.0.accion', 'groups.0.productos', 'groups.0.recontado_at'])('rechaza campo de panel ausente: %s', (path) => {
    expect(() => validateCashierV4Panel(changed(cashierV4Panel(), path))).toThrow(SologApiError)
  })
  test.each(['coverage_round', 'coverage_total', 'coverage_counted', 'coverage_pending', 'coverage_percent',
    'review_pending', 'coverage_queue_pending', 'daily_pending', 'coverage_blocked_waiting_snapshot'])('exige KPI %s', (key) => {
    expect(() => validateCashierV4Panel(changed(cashierV4Panel(), 'kpis.' + key))).toThrow(SologApiError)
  })
  test.each([
    ['basis.ronda', 3], ['basis.turno', 'afternoon'], ['basis.groups_revision', -1],
    ['basis.groups_revision', Number.MAX_SAFE_INTEGER + 1], ['basis.groups_revision', '7'],
    ['basis.periodo_desde', '2026-02-30'], ['basis.ronda_hasta', 'invalid'],
    ['session.iniciado_at', '2026-10-03'], ['session.expira_at', '2026-02-30T12:00:00Z'],
    ['session.estado', 'active'], ['next_action', 'recount'], ['groups.0.accion', 'review'],
    ['groups.0.grupo_id', 'group-1'], ['groups.0.precio', Number.NaN], ['groups.0.tipo', 'Otro'],
    ['kpis.coverage_percent', 200], ['kpis.daily_pending', -1], ['kpis.coverage_round', 2],
    ['review_queue.0.detalle_id', ids.savedDetail], ['coverage_queue', [ids.none]],
    ['coverage_queue', []], ['groups.0.snapshot_referencia_id', ids.recovery],
    ['daily_queue', [ids.coverage]], ['daily_queue', [ids.daily, ids.daily]],
    ['coverage_queue', null], ['session_capability.capture_allowed', 'true'],
    ['session_capability.expira_at', null],
  ])('rechaza valor inválido en %s', (path, value) => {
    expect(() => validateCashierV4Panel(changed(cashierV4Panel(), String(path), value))).toThrow(SologApiError)
  })
  test('rechaza grupos duplicados y ventanas temporales invertidas', () => {
    const p = cashierV4Panel()
    p.groups.push(structuredClone(p.groups[0]))
    expect(() => validateCashierV4Panel(p)).toThrow(SologApiError)
    const original = cashierV4Panel()
    expect(() => validateCashierV4Panel(changed(original, 'basis.turno_hasta', original.basis.turno_desde))).toThrow(SologApiError)
  })
  test('recovery y none nunca autorizan captura; none conserva fechas finales', () => {
    const p = cashierV4Panel({ estado: 'recovery' })
    expect(() => validateCashierV4Panel(changed(p, 'session_capability.capture_allowed', true))).toThrow(SologApiError)
    const finish = cashierV4Mutation('finish')
    expect(parseCashierV4Mutation(finish, 'finish').session_capability.recovery_until).toBeString()
    expect(() => parseCashierV4Mutation(changed(finish, 'session_capability.pending_delivery_allowed', true), 'finish')).toThrow(SologApiError)
  })
  test('capacidad restringida no se amplía por el parser', () => {
    const p = cashierV4Panel()
    p.session_capability.capture_allowed = false
    p.session_capability.pending_delivery_allowed = false
    expect(validateCashierV4Panel(p).session_capability.capture_allowed).toBe(false)
  })
})

describe('Cajero V4: mutaciones y delta', () => {
  test.each(['start', 'save_batch', 'recount_save_batch', 'finish'] as const)('%s acepta V4 y rechaza V3', (action) => {
    const value = cashierV4Mutation(action)
    expect(parseCashierV4Mutation(value, action).contract_version).toBe(4)
    expect(() => parseCashierV4Mutation({ ...value, contract_version: 3 }, action)).toThrow(SologApiError)
    expect(() => parseCashierV4Mutation({ ...value, action: 'other' }, action)).toThrow(SologApiError)
  })
  test('delta completo conserva las colas/KPI/next_action sin remociones inferidas', () => {
    const input = cashierV4Mutation('recount_save_batch').panel_delta
    const original = structuredClone(input)
    expect(validateCashierV4PanelDelta(input)).toEqual(original)
    expect(input).toEqual(original)
    expect(input.groups_patch[0].accion).toBe('none')
    expect(input.next_action).toBe('coverage')
  })
  test.each(['groups_patch', 'review_queue', 'coverage_queue', 'daily_queue', 'kpis', 'next_action', 'session_capability'])('delta exige %s', (field) => {
    expect(() => validateCashierV4PanelDelta(changed(cashierV4Delta(), field))).toThrow(SologApiError)
  })
  test('delta rechaza patches duplicados y campos de patch ausentes', () => {
    const d = cashierV4Mutation('save_batch').panel_delta
    expect(() => validateCashierV4PanelDelta(changed(d, 'groups_patch.0.accion'))).toThrow(SologApiError)
    d.groups_patch.push(structuredClone(d.groups_patch[0]))
    expect(() => validateCashierV4PanelDelta(d)).toThrow(SologApiError)
  })
  test('save/recount validan items, saved y capacidades de delta', () => {
    for (const action of ['save_batch', 'recount_save_batch'] as const) {
      const result = cashierV4Mutation(action)
      expect(parseCashierV4Mutation(result, action).saved).toBe(1)
      expect(() => parseCashierV4Mutation({ ...result, saved: 2 }, action)).toThrow(SologApiError)
      expect(() => parseCashierV4Mutation(changed(result, 'items.0.detalle_id'), action)).toThrow(SologApiError)
      expect(() => parseCashierV4Mutation({ ...result, panel_state: {} }, action)).toThrow(SologApiError)
      expect(() => parseCashierV4Mutation(changed(result, 'panel_delta.session_capability', cashierV4Capability()), action)).toThrow(SologApiError)
    }
  })
  test('finish acepta capability abreviada o completa y exige finalizado', () => {
    const result = cashierV4Mutation('finish')
    expect(parseCashierV4Mutation(result, 'finish').status).toBe('finalizado')
    result.session_capability.iniciado_at = cashierV4Panel().session.iniciado_at
    expect(parseCashierV4Mutation(result, 'finish').session_capability.iniciado_at).toBeString()
    expect(() => parseCashierV4Mutation({ ...result, status: 'expirado' }, 'finish')).toThrow(SologApiError)
    expect(() => parseCashierV4Mutation(changed(result, 'session_capability.recovery_until'), 'finish')).toThrow(SologApiError)
  })
  test('los estados de resultado son específicos de cada acción', () => {
    expect(() => parseCashierV4Mutation(changed(cashierV4Mutation('save_batch'), 'items.0.estado_diferencia', 'Confirmada'), 'save_batch')).toThrow(SologApiError)
    expect(() => parseCashierV4Mutation(changed(cashierV4Mutation('recount_save_batch'), 'items.0.estado_diferencia', 'Recontar'), 'recount_save_batch')).toThrow(SologApiError)
  })
})
