import type { FullGroup } from './full.contract'

// El frontend solo presenta la prioridad calculada por el backend. No la reasigna.
const priorityRank: Record<string, number> = {
  round_coverage: 0,
  review_for_coverage: 1,
  review_regular: 2,
  shift_coverage: 3,
  none: 4,
}

export type FullWorkAction = 'coverage' | 'recount' | 'daily'
export type FullStockType = 'positive' | 'zero' | 'negative'

export const stockType = (value: number): FullStockType =>
  value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero'

export const actionFor = (group: FullGroup): FullWorkAction =>
  group.action === 'recount' ? 'recount' : group.action === 'daily' ? 'daily' : 'coverage'

export function actionable(groups: FullGroup[]): FullGroup[] {
  const current = Math.min(...groups.filter(group => group.action !== 'none')
    .map(group => priorityRank[group.priority_class] ?? 4))
  return groups.filter(group =>
    group.action !== 'none' && (priorityRank[group.priority_class] ?? 4) === current)
}
