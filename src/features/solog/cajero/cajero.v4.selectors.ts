import { SologApiError } from '../errors'
import type {
  CashierV4Group, CashierV4NextAction, CashierV4Panel, CashierV4ReviewPriorityClass,
  CashierV4ReviewQueueItem, CashierV4Round,
} from './cajero.v4'
import type { CashierV4State } from './cajero.v4.store'

export function getCashierV4DeliveryState(state: CashierV4State, conteoId: string) {
  return state.delivery_state_by_session[conteoId] ?? null
}

const destinations = {
  review: '/cajero/revisar', coverage: '/cajero/conteo', daily: '/cajero/diario', none: '/cajero',
} as const

export function cashierV4Destination(nextAction: CashierV4NextAction) { return destinations[nextAction] }

export function selectCashierV4OperationalSummary(state: CashierV4State) {
  return state.panel_state ?? state.pre_session_summary
}

export function selectCashierV4Destination(state: CashierV4State) {
  const summary = selectCashierV4OperationalSummary(state)
  return summary ? cashierV4Destination(summary.next_action) : null
}

export function selectCashierV4WaitingForSnapshot(state: CashierV4State): boolean {
  const summary = selectCashierV4OperationalSummary(state)
  return Boolean(summary?.next_action === 'none' && summary.kpis.coverage_pending > 0 &&
    summary.kpis.coverage_blocked_waiting_snapshot > 0)
}

export function cashierV4CoverageLabel(round: CashierV4Round) {
  return round === 1 ? 'Cobertura quincenal 1' : 'Cobertura quincenal 2'
}

export function selectCashierV4Coverage(state: CashierV4State) {
  const kpis = selectCashierV4OperationalSummary(state)?.kpis
  if (!kpis) return null
  return {
    coverage_round: kpis.coverage_round, coverage_counted: kpis.coverage_counted,
    coverage_total: kpis.coverage_total, coverage_pending: kpis.coverage_pending,
    coverage_percent: kpis.coverage_percent, label: cashierV4CoverageLabel(kpis.coverage_round),
  }
}

export function selectCashierV4ReviewQueue(panel: CashierV4Panel | null) { return panel?.review_queue ?? [] }
export function selectCashierV4CoverageQueue(panel: CashierV4Panel | null) { return panel?.coverage_queue ?? [] }
export function selectCashierV4DailyQueue(panel: CashierV4Panel | null) { return panel?.daily_queue ?? [] }

export function cashierV4CurrentReviewPriority(
  queue: readonly CashierV4ReviewQueueItem[],
): CashierV4ReviewPriorityClass | null {
  if (!queue.length) return null
  let hasForCoverage = false
  let hasRegular = false
  for (const item of queue) {
    const priority = (item as Partial<CashierV4ReviewQueueItem>).priority_class
    if (priority === 'review_for_coverage') hasForCoverage = true
    else if (priority === 'review_regular') hasRegular = true
    else return null // Legacy/ambiguous persisted snapshots fail closed.
  }
  return hasForCoverage ? 'review_for_coverage' : hasRegular ? 'review_regular' : null
}

export function cashierV4ActionableReviewQueue(queue: readonly CashierV4ReviewQueueItem[]) {
  const priority = cashierV4CurrentReviewPriority(queue)
  return priority ? queue.filter(item => item.priority_class === priority) : []
}

export function selectCashierV4CurrentReviewPriority(panel: CashierV4Panel | null) {
  return cashierV4CurrentReviewPriority(selectCashierV4ReviewQueue(panel))
}

function groupsInQueue(panel: CashierV4Panel | null, ids: readonly string[]): CashierV4Group[] {
  if (!panel) return []
  const groupsById = new Map(panel.groups.map(group => [group.grupo_id, group]))
  return ids.map(id => {
    const group = groupsById.get(id)
    if (!group) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
    return group
  })
}

function reviewEntries(panel: CashierV4Panel | null, queue: readonly CashierV4ReviewQueueItem[]) {
  const groups = groupsInQueue(panel, queue.map(item => item.grupo_id))
  return queue.map((queueItem, index) => ({ queueItem, group: groups[index] }))
}

export function selectCashierV4ReviewEntries(panel: CashierV4Panel | null) {
  return reviewEntries(panel, selectCashierV4ReviewQueue(panel))
}

export function selectCashierV4ActionableReviewEntries(panel: CashierV4Panel | null) {
  return reviewEntries(panel, cashierV4ActionableReviewQueue(selectCashierV4ReviewQueue(panel)))
}

export function selectCashierV4ReviewGroups(panel: CashierV4Panel | null) {
  return selectCashierV4ReviewEntries(panel).map(entry => entry.group)
}
export function selectCashierV4ActionableReviewGroups(panel: CashierV4Panel | null) {
  return selectCashierV4ActionableReviewEntries(panel).map(entry => entry.group)
}
export function selectCashierV4CoverageGroups(panel: CashierV4Panel | null) {
  return groupsInQueue(panel, selectCashierV4CoverageQueue(panel))
}
export function selectCashierV4DailyGroups(panel: CashierV4Panel | null) {
  return groupsInQueue(panel, selectCashierV4DailyQueue(panel))
}

export type CashierV4StockType = 'positive' | 'zero' | 'negative'

// Presentation only: stock never chooses membership, capture permission or priority.
export function cashierV4StockType(stockTeorico: number): CashierV4StockType {
  if (!Number.isFinite(stockTeorico)) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
  return stockTeorico > 0 ? 'positive' : stockTeorico === 0 ? 'zero' : 'negative'
}

function pendingByStockType(groups: readonly CashierV4Group[]) {
  const pending: Record<CashierV4StockType, number> = { positive: 0, zero: 0, negative: 0 }
  groups.forEach(group => { pending[cashierV4StockType(group.stock_teorico)]++ })
  return pending
}

function pendingByCategory(groups: readonly CashierV4Group[]) {
  const categories = new Map<string, { categoria_id: string; categoria: string; pending: number }>()
  groups.forEach(group => {
    const current = categories.get(group.categoria_id)
    if (current) current.pending++
    else categories.set(group.categoria_id, { categoria_id: group.categoria_id, categoria: group.categoria, pending: 1 })
  })
  // V4 has no category order field; keep the current Spanish alphabetical presentation.
  return [...categories.values()].sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') ||
    a.categoria_id.localeCompare(b.categoria_id))
}

export function selectCashierV4CoveragePendingByStockType(panel: CashierV4Panel | null) {
  return pendingByStockType(selectCashierV4CoverageGroups(panel))
}
export function selectCashierV4DailyPendingByStockType(panel: CashierV4Panel | null) {
  return pendingByStockType(selectCashierV4DailyGroups(panel))
}
export function selectCashierV4CoveragePendingByCategory(panel: CashierV4Panel | null) {
  return pendingByCategory(selectCashierV4CoverageGroups(panel))
}
export function selectCashierV4DailyPendingByCategory(panel: CashierV4Panel | null) {
  return pendingByCategory(selectCashierV4DailyGroups(panel))
}
export function selectCashierV4ReviewPendingByCategory(panel: CashierV4Panel | null) {
  return pendingByCategory(selectCashierV4ReviewGroups(panel))
}

// Historial is read-only and remains available independently of operational priority or coverage.
export function selectCashierV4HistoryAvailable(state: CashierV4State): boolean {
  void state
  return true
}
