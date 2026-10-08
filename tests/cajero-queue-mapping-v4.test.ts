import { describe, expect, test } from 'bun:test'
import { validateCashierV4Panel } from '../src/features/solog/cajero/cajero.v4.api'
import {
  cashierV4ActionableReviewQueue, cashierV4CurrentReviewPriority, cashierV4StockType,
  selectCashierV4ActionableReviewEntries, selectCashierV4CoverageGroups, selectCashierV4DailyGroups,
  selectCashierV4ReviewGroups, selectCashierV4ReviewEntries,
  selectCashierV4CoveragePendingByStockType, selectCashierV4DailyPendingByStockType,
  selectCashierV4CoveragePendingByCategory, selectCashierV4DailyPendingByCategory,
  selectCashierV4ReviewPendingByCategory, selectCashierV4Coverage,
} from '../src/features/solog/cajero/cajero.v4.selectors'
import { cashierV4Reducer, createCashierV4State } from '../src/features/solog/cajero/cajero.v4.store'
import { parseCashierV4Bootstrap } from '../src/features/solog/cajero/cajero.v4.api'
import { cashierV4Panel, cashierV4Bootstrap, cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'

function orderedPanel() {
  const panel = cashierV4Panel({ next_action: 'coverage' })
  const clone = (index: number, tail: number, category: string, stock: number) => ({
    ...structuredClone(panel.groups[index]), grupo_id: `10000000-0000-4000-8000-${String(tail).padStart(12, '0')}`,
    categoria_id: category === 'Bebidas' ? '10000000-0000-4000-8000-000000000099' : ids.category,
    categoria: category, stock_teorico: stock,
  })
  const coverage2 = clone(1, 1, 'Bebidas', 0)
  const coverage3 = clone(1, 2, 'Abarrotes', -4)
  const daily2 = clone(2, 3, 'Bebidas', 20)
  const review2 = clone(0, 4, 'Bebidas', -1)
  review2.detalle_reconteo_id = '10000000-0000-4000-8000-000000000098'
  panel.groups.push(coverage2, coverage3, daily2, review2)
  panel.coverage_queue = [coverage3.grupo_id, coverage2.grupo_id, ids.coverage]
  panel.daily_queue = [daily2.grupo_id, ids.daily]
  panel.review_queue = [...panel.review_queue, { ...panel.review_queue[0], grupo_id: review2.grupo_id,
    detalle_id: review2.detalle_reconteo_id, ultima_diferencia: 7, contado_at: '2026-09-29T22:00:00Z',
    priority_class: 'review_regular' }]
  panel.kpis = { ...panel.kpis, coverage_total: 8, coverage_counted: 4, coverage_pending: 4,
    coverage_percent: 50, review_pending: 2, coverage_queue_pending: 3, daily_pending: 2 }
  return validateCashierV4Panel(panel)
}

describe('Cajero 13.4: mapping de queues y pendientes', () => {
  test('coverageGroups preserva orden backend, metadata congelada y excluye grupos fuera de queue', () => {
    const panel = orderedPanel()
    const groups = selectCashierV4CoverageGroups(panel)
    expect(groups.map(group => group.grupo_id)).toEqual(panel.coverage_queue)
    expect(groups.map(group => group.grupo_id)).not.toEqual(panel.groups.filter(group => group.accion === 'coverage').map(group => group.grupo_id))
    groups.forEach(group => expect(group).toBe(panel.groups.find(metadata => metadata.grupo_id === group.grupo_id)))
    expect(groups.some(group => group.grupo_id === ids.none)).toBe(false)
  })
  test('dailyGroups preserva orden backend y solo contiene daily_queue', () => {
    const panel = orderedPanel()
    expect(selectCashierV4DailyGroups(panel).map(group => group.grupo_id)).toEqual(panel.daily_queue)
    expect(selectCashierV4DailyGroups(panel).map(group => group.grupo_id)).not.toContain(ids.coverage)
  })
  test('reviewGroups y reviewEntries preservan orden y ambas fuentes de metadata', () => {
    const panel = orderedPanel()
    expect(selectCashierV4ReviewGroups(panel).map(group => group.grupo_id)).toEqual(panel.review_queue.map(item => item.grupo_id))
    const entries = selectCashierV4ReviewEntries(panel)
    entries.forEach((entry, index) => {
      expect(entry.queueItem).toBe(panel.review_queue[index])
      expect(entry.group).toBe(panel.groups.find(group => group.grupo_id === entry.queueItem.grupo_id))
    })
    expect(entries[1].queueItem).toMatchObject({
      ultima_diferencia: 7, contado_at: '2026-09-29T22:00:00Z', priority_class: 'review_regular',
    })
    expect(entries[1].group.detalle_reconteo_id).toBe(entries[1].queueItem.detalle_id)
  })
  test('subprioridad review es única, actionable filtra y transiciona a regular', () => {
    const panel = orderedPanel()
    expect(cashierV4CurrentReviewPriority(panel.review_queue)).toBe('review_for_coverage')
    expect(selectCashierV4ActionableReviewEntries(panel).map(entry => entry.queueItem.priority_class))
      .toEqual(['review_for_coverage'])
    const regularOnly = panel.review_queue.filter(item => item.priority_class === 'review_regular')
    expect(cashierV4CurrentReviewPriority(regularOnly)).toBe('review_regular')
    expect(cashierV4ActionableReviewQueue(regularOnly)).toEqual(regularOnly)
  })
  test('snapshot review legacy sin priority_class falla cerrado sin inferir', () => {
    const panel = orderedPanel()
    const legacy = panel.review_queue.map(item => {
      const copy = { ...item } as Partial<typeof item>
      delete copy.priority_class
      return copy
    }) as typeof panel.review_queue
    expect(cashierV4CurrentReviewPriority(legacy)).toBeNull()
    expect(cashierV4ActionableReviewQueue(legacy)).toEqual([])
  })
  test.each([[3, 'positive'], [0, 'zero'], [-3, 'negative']] as const)('stock %s se presenta como %s', (stock, expected) => {
    expect(cashierV4StockType(stock)).toBe(expected)
  })
  test('stock y accion no cambian pertenencia ni orden; helpers no mutan el panel', () => {
    const panel = orderedPanel()
    const idsBefore = [...panel.coverage_queue]
    panel.groups.find(group => group.grupo_id === ids.coverage)!.stock_teorico = -99
    panel.groups.find(group => group.grupo_id === ids.coverage)!.accion = 'none'
    panel.groups.find(group => group.grupo_id === ids.none)!.accion = 'coverage'
    const before = structuredClone(panel)
    expect(selectCashierV4CoverageGroups(panel).map(group => group.grupo_id)).toEqual(idsBefore)
    expect(selectCashierV4CoveragePendingByStockType(panel)).toEqual({ positive: 0, zero: 1, negative: 2 })
    expect(panel).toEqual(before)
  })
  test('tiles por stock muestran pendientes de cada queue, sin n/N reconstruido', () => {
    const panel = orderedPanel()
    expect(selectCashierV4CoveragePendingByStockType(panel)).toEqual({ positive: 1, zero: 1, negative: 1 })
    expect(selectCashierV4DailyPendingByStockType(panel)).toEqual({ positive: 1, zero: 1, negative: 0 })
  })
  test('categorías y pendientes provienen de la queue y usan orden alfabético español estable', () => {
    const panel = orderedPanel()
    panel.groups.find(group => group.grupo_id === ids.none)!.categoria = 'Categoría ajena'
    panel.groups.find(group => group.grupo_id === ids.none)!.categoria_id = '10000000-0000-4000-8000-000000000097'
    expect(selectCashierV4CoveragePendingByCategory(panel)).toEqual([
      { categoria_id: ids.category, categoria: 'Abarrotes', pending: 2 },
      { categoria_id: '10000000-0000-4000-8000-000000000099', categoria: 'Bebidas', pending: 1 },
    ])
    expect(selectCashierV4DailyPendingByCategory(panel).map(category => category.pending)).toEqual([1, 1])
    expect(selectCashierV4ReviewPendingByCategory(panel).map(category => category.pending)).toEqual([1, 1])
    expect(selectCashierV4CoveragePendingByCategory(panel).map(category => category.categoria)).not.toContain('Categoría ajena')
  })
  test('pre-session no fabrica stock ni categorías; datasets sin panel son vacíos', () => {
    expect(selectCashierV4CoverageGroups(null)).toEqual([])
    expect(selectCashierV4DailyGroups(null)).toEqual([])
    expect(selectCashierV4ReviewEntries(null)).toEqual([])
    expect(selectCashierV4CoveragePendingByCategory(null)).toEqual([])
    expect(selectCashierV4DailyPendingByCategory(null)).toEqual([])
    expect(selectCashierV4CoveragePendingByStockType(null)).toEqual({ positive: 0, zero: 0, negative: 0 })
  })
  test('referencia inexistente o stock inválido falla explícitamente sin inventar metadata', () => {
    const panel = orderedPanel()
    panel.coverage_queue.push(ids.operation)
    expect(() => selectCashierV4CoverageGroups(panel)).toThrow()
    expect(() => cashierV4StockType(NaN)).toThrow()
  })
  test.each([1, 2] as const)('KPI ronda %s conserva cinco valores backend y label sin combinar rondas', ronda => {
    const state = cashierV4Reducer(createCashierV4State(), {
      type: 'bootstrap', bootstrap: parseCashierV4Bootstrap(cashierV4Bootstrap('pre_session', {
        ronda, next_action: 'coverage',
      })),
    })
    expect(selectCashierV4Coverage(state)).toEqual({ coverage_round: ronda, coverage_counted: 2,
      coverage_total: 4, coverage_pending: 2, coverage_percent: 50, label: `Cobertura de ronda ${ronda}` })
    expect(selectCashierV4Coverage(state)!.coverage_percent).toBeLessThanOrEqual(100)
  })
})
