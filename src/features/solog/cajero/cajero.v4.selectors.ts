import type { CashierV4NextAction, CashierV4Panel, CashierV4Round } from './cajero.v4'
import type { CashierV4State } from './cajero.v4.store'

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

function groupsInQueue(panel: CashierV4Panel | null, ids: string[]) {
  const membership = new Set(ids)
  return panel?.groups.filter(group => membership.has(group.grupo_id)) ?? []
}

export function selectCashierV4ReviewGroups(panel: CashierV4Panel | null) {
  return groupsInQueue(panel, selectCashierV4ReviewQueue(panel).map(item => item.grupo_id))
}
export function selectCashierV4CoverageGroups(panel: CashierV4Panel | null) {
  return groupsInQueue(panel, selectCashierV4CoverageQueue(panel))
}
export function selectCashierV4DailyGroups(panel: CashierV4Panel | null) {
  return groupsInQueue(panel, selectCashierV4DailyQueue(panel))
}
