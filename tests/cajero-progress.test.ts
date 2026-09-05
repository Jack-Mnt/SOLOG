import { expect, test } from 'bun:test'
import { deriveCajeroProgress, initialCajeroStockType } from '../src/features/solog/cajero/cajero.progress'
import type { CashierPanel } from '../src/features/solog/cajero/cajero.v2'
import { cashierFixture } from './fixtures/cashier-v4.mjs'

function panel() {
  const value = cashierFixture().panel_state as CashierPanel
  const base = value.groups[0]!
  value.groups = [
    { ...base, grupo_id: 'p', stock_teorico: 4 },
    { ...base, grupo_id: 'z', stock_teorico: 0 },
    { ...base, grupo_id: 'z2', categoria_id: 'other', stock_teorico: 0 },
    { ...base, grupo_id: 'n', stock_teorico: -1 },
    { ...base, grupo_id: 'covered', cobertura_periodo: true },
  ]
  value.count_queue = ['p', 'z', 'z2', 'n', 'covered']
  value.kpis = { ...value.kpis, groups_total: 5, coverage_counted: 1, coverage_percent: 20 }
  return value
}
test('coverage and stock/category progress intersect current queue and unique normal drafts', () => {
  const value = panel()
  expect(deriveCajeroProgress(value, []).coverageCount).toBe(1)
  const progress = deriveCajeroProgress(value, ['z', 'z', 'n', 'covered', 'unknown'].map(grupo_id => ({ grupo_id })))
  expect(progress.coverageCount).toBe(3)
  expect(progress.coveragePercent).toBe(60)
  expect(progress.select('zero')).toMatchObject({ total: 2, completed: 1 })
  expect(progress.select('zero', 'other')).toMatchObject({ total: 1, completed: 0 })
  expect(progress.select('negative')).toMatchObject({ total: 1, completed: 1 })
  expect(progress.select('positive', 'cat-1')).toMatchObject({ total: 2, completed: 1 })
})
test('authoritative success/replay cannot double count retained confirmed drafts', () => {
  const value = panel()
  value.kpis.coverage_counted = 2
  value.groups.find(g => g.grupo_id === 'z')!.cobertura_periodo = true
  value.count_queue = value.count_queue.filter(id => id !== 'z')
  const progress = deriveCajeroProgress(value, [{ grupo_id: 'z' }])
  expect(progress.coverageCount).toBe(2)
  expect(progress.select('zero')).toMatchObject({ total: 1, completed: 0 })
  expect(deriveCajeroProgress(value, []).coverageCount).toBe(2)
})
test('coverage caps at denominator and handles empty state', () => {
  const value = panel()
  value.kpis.coverage_counted = 5
  expect(deriveCajeroProgress(value, [{ grupo_id: 'z' }]).coverageCount).toBe(5)
  value.kpis.groups_total = 0
  expect(deriveCajeroProgress(value, []).coveragePercent).toBe(0)
})
test('stock query is an optional initial filter, not a new route', () => {
  expect(initialCajeroStockType('?stock=zero')).toBe('zero')
  expect(initialCajeroStockType('?stock=negative')).toBe('negative')
  expect(initialCajeroStockType('')).toBeNull()
  expect(initialCajeroStockType('?stock=invalid')).toBeNull()
})
