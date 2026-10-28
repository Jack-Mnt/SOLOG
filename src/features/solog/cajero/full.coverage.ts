import type { FullDraft } from './full.runtime'
import type { FullOperationalSummary, FullSession, FullState } from './full.contract'

export type FullHomeState = 'A1' | 'A2' | 'B' | 'C'

export interface FullCoveragePresentation {
  homeState: FullHomeState
  summary: FullOperationalSummary
  empty: boolean
  complete: boolean
  confirmed: number
  provisional: number
  displayed: number
  displayedPercent: number
}

/** Solo lectura: el KPI oficial nunca se modifica con borradores locales. */
export function projectFullCoverage(
  state: FullState | null,
  session: FullSession | null,
  drafts: readonly FullDraft[],
  rejectedObservationIds: ReadonlySet<string>,
  serverNow: number,
  clockTrusted: boolean,
  coverageFresh: boolean,
): FullCoveragePresentation | null {
  if (!state || !clockTrusted || !coverageFresh || !Number.isFinite(serverNow)) return null
  const summary = state.operational_summary
  const start = Date.parse(summary.basis.round_starts_at)
  const end = Date.parse(summary.basis.round_ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || serverNow < start || serverNow >= end) return null

  const active = session?.status === 'active'
  const empty = summary.coverage_total === 0
  const complete = !empty && summary.coverage_pending === 0
  const homeState: FullHomeState = active ? (complete ? 'C' : 'B') : (complete ? 'A2' : 'A1')
  const confirmed = summary.coverage_counted
  const provisionalGroupIds = new Set(
    active ? state.groups.filter(g => g.coverage_pending_round).map(g => g.group_id) : [],
  )
  const confirmedObservations = new Set(state.confirmed_observation_ids)
  const provisional = active
    ? new Set(drafts.filter(d =>
      d.sessionId === session.session_id &&
      provisionalGroupIds.has(d.groupId) &&
      !confirmedObservations.has(d.clientObservationId) &&
      !rejectedObservationIds.has(d.clientObservationId) &&
      Number.isFinite(Date.parse(d.countedAt)) &&
      Date.parse(d.countedAt) >= start && Date.parse(d.countedAt) < end,
    ).map(d => d.groupId)).size
    : 0
  const displayed = Math.min(summary.coverage_total, confirmed + provisional)
  const displayedPercent = empty ? 0 : Math.round(displayed * 1000 / summary.coverage_total) / 10
  return { homeState, summary, empty, complete, confirmed, provisional, displayed, displayedPercent }
}
