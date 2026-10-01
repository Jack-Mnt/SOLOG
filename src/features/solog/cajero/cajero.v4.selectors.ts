import { SologApiError } from '../errors'
import type { CashierV4Group, CashierV4NextAction, CashierV4Panel, CashierV4Round } from './cajero.v4'
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

function groupsInQueue(panel: CashierV4Panel | null, ids: readonly string[]): CashierV4Group[] {
  if (!panel) return []
  const groupsById = new Map(panel.groups.map(group => [group.grupo_id, group]))
  return ids.map(id => {
    const group = groupsById.get(id)
    if (!group) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
    return group
  })
}

export function selectCashierV4ReviewEntries(panel: CashierV4Panel | null) {
  const queue = selectCashierV4ReviewQueue(panel)
  const groups = groupsInQueue(panel, queue.map(item => item.grupo_id))
  return queue.map((queueItem, index) => ({ queueItem, group: groups[index] }))
}

export function selectCashierV4ReviewGroups(panel: CashierV4Panel | null) {
  return selectCashierV4ReviewEntries(panel).map(entry => entry.group)
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

export function selectCashierV4HistoryAvailable(state: CashierV4State): boolean {
  return selectCashierV4OperationalSummary(state)?.kpis.coverage_pending === 0
}
