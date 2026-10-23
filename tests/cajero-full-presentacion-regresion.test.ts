import { describe, expect, test } from 'bun:test'
import type { FullGroup } from '../src/features/solog/cajero/full.contract'
import { actionFor, actionable, stockType } from '../src/features/solog/cajero/full.presentation'

const group = (id: string, priority: string, action: FullGroup['action'], stock = 10) => ({
  group_id: id, priority_class: priority, action, stock_theoretical: stock,
}) as FullGroup

describe('Cajero Full — recuperación de presentación sin sustituir Motor V7', () => {
  test('solo visualiza grupos de la prioridad autoritativa superior', () => {
    const rows = [
      group('coverage', 'round_coverage', 'coverage'),
      group('review-urgent', 'review_for_coverage', 'recount'),
      group('review', 'review_regular', 'recount'),
      group('daily', 'shift_coverage', 'daily'),
      group('completed', 'none', 'none'),
    ]
    expect(actionable(rows).map(row => row.group_id)).toEqual(['coverage'])
    expect(rows.map(row => row.action)).toEqual(['coverage', 'recount', 'recount', 'daily', 'none'])
  })
  test('al cambiar la prioridad backend, la ruta deriva del action del grupo', () => {
    const rows = [
      group('review-urgent', 'review_for_coverage', 'recount'),
      group('daily', 'shift_coverage', 'daily'),
    ]
    expect(actionable(rows).map(actionFor)).toEqual(['recount'])
    expect(actionFor(rows[1])).toBe('daily')
  })
  test('no fabrica trabajo si todas las acciones son none', () => {
    expect(actionable([group('done', 'none', 'none')])).toEqual([])
    expect(actionable([])).toEqual([])
  })
  test('los filtros de stock son exclusivamente locales y no alteran prioridades', () => {
    expect([stockType(5), stockType(0), stockType(-2)]).toEqual(['positive', 'zero', 'negative'])
  })
})
