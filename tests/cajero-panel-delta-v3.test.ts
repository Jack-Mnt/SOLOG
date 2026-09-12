import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import { applyCashierV3PanelDelta } from '../src/features/solog/cajero/cajero.v3.panel'
import { validateCashierV3PanelDelta } from '../src/features/solog/cajero/cajero.v3.api'
import { cashierV3Delta, cashierV3Mutation, cashierV3Panel } from './fixtures/cashier-v3.mjs'

describe('Cajero V3 panel_delta', () => {
  test('aplica patch, remueve count_queue y reemplaza KPI sin perder campos congelados', () => {
    const panel = cashierV3Panel()
    const original = structuredClone(panel)
    const next = applyCashierV3PanelDelta(panel, validateCashierV3PanelDelta(cashierV3Delta()))
    expect(next.groups[0]).toMatchObject({ requiere_conteo: false, cobertura_periodo: true, contado_detalle_id: 'detail-1' })
    expect(next.groups[0].nombre).toBe(panel.groups[0].nombre)
    expect(next.groups[0].productos).toEqual(panel.groups[0].productos)
    expect(next.groups[0].stock_teorico).toBe(panel.groups[0].stock_teorico)
    expect(next.count_queue).toEqual([])
    expect(next.review_queue).toEqual(panel.review_queue)
    expect(next.kpis).toEqual(cashierV3Delta().kpis)
    expect(panel).toEqual(original)
  })

  test('reconteo remueve review_queue por detalle y conserva count_queue', () => {
    const panel = cashierV3Panel()
    const delta = cashierV3Mutation('recount_save_batch').panel_delta
    const next = applyCashierV3PanelDelta(panel, validateCashierV3PanelDelta(delta))
    expect(next.review_queue).toEqual([])
    expect(next.count_queue).toEqual(['group-1'])
    expect(next.groups[1].requiere_reconteo).toBe(false)
  })

  test('reaplicar el mismo delta converge al mismo panel', () => {
    const delta = validateCashierV3PanelDelta(cashierV3Delta())
    const once = applyCashierV3PanelDelta(cashierV3Panel(), delta)
    const twice = applyCashierV3PanelDelta(once, delta)
    expect(twice).toEqual(once)
  })

  test('rechaza patches desconocidos, duplicados y removals inválidos', () => {
    const panel = cashierV3Panel()
    const unknown = cashierV3Delta(); unknown.groups_patch[0].grupo_id = 'unknown'
    expect(() => applyCashierV3PanelDelta(panel, validateCashierV3PanelDelta(unknown))).toThrow(SologApiError)
    const duplicate = cashierV3Delta(); duplicate.groups_patch.push({ ...duplicate.groups_patch[0] })
    expect(() => validateCashierV3PanelDelta(duplicate)).toThrow(SologApiError)
    const removal = cashierV3Delta(); removal.count_queue_remove = ['unknown']
    expect(() => applyCashierV3PanelDelta(panel, validateCashierV3PanelDelta(removal))).toThrow(SologApiError)
  })

  test('rechaza KPI no autoritativo o delta incompleto', () => {
    const invalid = cashierV3Delta(); invalid.kpis.coverage_percent = Number.NaN
    expect(() => validateCashierV3PanelDelta(invalid)).toThrow(SologApiError)
    const incomplete = cashierV3Delta(); delete incomplete.groups_patch[0].recontado_at
    expect(() => validateCashierV3PanelDelta(incomplete)).toThrow(SologApiError)
  })
})
