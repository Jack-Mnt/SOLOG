// SOLOG Dashboard RPC V1 — transporte congelado.
// Fuente: docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md
// Independiente de Admin Envelope V2; no contiene datos simulados.
export type MetricsQuality = 'complete' | 'partial' | 'no_data'
export type MovementQuality = 'complete' | 'partial' | 'insufficient'
export type ShiftName = 'early' | 'day' | 'night'
export type RiskLevel = 'bajo' | 'medio_bajo' | 'medio' | 'medio_alto' | 'alto' | 'muy_alto'
export type MetricsSort = 'risk' | 'value' | 'difference'
export type EpisodeScope = 'open' | 'closed'
export type OpenEpisodeSort = 'importance' | 'recurrence' | 'persistence'
export type EpisodeSort = OpenEpisodeSort | 'recent'
export type MetricsAction = 'overview' | 'rounds' | 'risk' | 'episodes' | 'activity' | 'day' | 'day_observations'

export interface MetricEnvelope<A extends MetricsAction, D> {
  contract_version: 1
  generated_at: string
  action: A
  source: 'metrics_dashboard_v1'
  quality: MetricsQuality
  data: D
}

export interface MetricCoverage {
  counted: number | null
  required: number | null
  percent: number | null
}
export interface SiteAccuracy {
  green: number
  yellow: number
  red: number
  exempt_zero_zero: number
  without_evidence: number
  universe: number
  denominator: number
  green_percent: number | null
  yellow_percent: number | null
  red_percent: number | null
  quality: MetricsQuality
}
export interface SiteMoney {
  groups: number
  value: number | null
  quality: MetricsQuality
}
export interface SiteOverview {
  site_id: string
  site_name: string
  round: {
    period_from: string
    round: 1 | 2
    counted: number | null
    required: number | null
    percent: number | null
    quality: MetricsQuality
  }
  accuracy: SiteAccuracy
  surplus: SiteMoney
  shortage: SiteMoney
  risk: { high: number; very_high: number; quality: MetricsQuality }
}
export interface DashboardOverview {
  sites: SiteOverview[]
}
export interface HistoricalAccuracy {
  green: number | null
  red: number | null
  exempt: number | null
  without_evidence: number | null
  denominator: number | null
  percent: number | null
}
export interface DashboardRound {
  round_from: string
  round_to: string
  period_from: string
  period_to: string
  round: 1 | 2
  coverage: MetricCoverage
  milestones: { '50': string | null; '90': string | null; '100': string | null }
  historical_accuracy: HistoricalAccuracy | null
  shift_contributions: Partial<Record<ShiftName, number | null>> // {} solo en cortes no_data
  closed_at: string | null
  quality: MetricsQuality
  cut_version: number | null
}
export interface DashboardRounds {
  site_id: string
  current: DashboardRound | null
  period_rounds: DashboardRound[]
  history: DashboardRound[]
}
export interface RiskRow {
  group_id: string
  group_name: string
  difference: number
  confirmed_value: number | null
  level: RiskLevel | null
  movement_quality: MovementQuality
  risk_available: boolean
}
export interface DashboardRisk {
  site_id: string
  sort: MetricsSort
  rows: RiskRow[]
  next_cursor: string | null
  total: number
}
export interface EpisodeRow {
  episode_id: string
  group_id: string
  group_name: string
  opened_at: string
  closed_at: string | null
  recurrences_45d: number
  duration_hours: number
  risk_level: RiskLevel | null
  risk_status: 'available' | 'pending_confirmation' | 'not_available'
}
export interface DashboardEpisodes {
  site_id: string
  scope: EpisodeScope
  sort: EpisodeSort
  rows: EpisodeRow[]
  next_cursor: string | null
  total: number
}
export type ActivityStatus = 'in_progress' | 'closed' | 'no_tasks' | 'no_data'
export interface ActivityCell {
  date: string
  turno: ShiftName
  status: ActivityStatus
  completed: number | null
  required: number | null
  percent: number | null
  breakdown: Record<'round_coverage' | 'review_for_coverage' | 'review_regular' | 'shift_coverage', number>
  quality: MetricsQuality
}
export interface DashboardActivity {
  site_id: string
  date_from: string
  date_to: string
  cells: ActivityCell[]
}
export interface ConfirmedDifference {
  group_id: string
  group_name: string
  recounted_at: string
  difference: number
  frozen_value: number | null
}
export interface DashboardDay {
  site_id: string
  date: string
  physical_activity: { groups_observed: number; counts: number; recounts: number }
  episodes: { opened: number; closed: number; open_at_day_end: number }
  confirmed_differences: ConfirmedDifference[]
  confirmed_total: number
  confirmed_next_cursor: null
  observations_initial_cursor: null
  quality: MetricsQuality
}
export type ObservationResult = 'Coincide' | 'Recontar' | 'Confirmada' | 'Inconsistente'
export interface DayObservation {
  observation_id: string
  group_id: string
  group_name: string
  kind: 'normal' | 'recount'
  observed_at: string
  theoretical: number
  physical: number
  physical_difference: number
  result: ObservationResult
}
export interface DashboardDayObservations {
  site_id: string
  date: string
  rows: DayObservation[]
  next_cursor: string | null
}

export interface MetricsPayloads {
  overview: Record<string, never>
  rounds: { site_id: string }
  risk: { site_id: string; sort?: MetricsSort; limit?: number; cursor?: string | null }
  episodes: { site_id: string; scope?: EpisodeScope; sort?: EpisodeSort; limit?: number; cursor?: string | null }
  activity: { site_id: string; date_from: string; date_to: string }
  day: { site_id: string; date: string }
  day_observations: { site_id: string; date: string; limit?: number; cursor?: string | null }
}
export interface MetricsResponses {
  overview: MetricEnvelope<'overview', DashboardOverview>
  rounds: MetricEnvelope<'rounds', DashboardRounds>
  risk: MetricEnvelope<'risk', DashboardRisk>
  episodes: MetricEnvelope<'episodes', DashboardEpisodes>
  activity: MetricEnvelope<'activity', DashboardActivity>
  day: MetricEnvelope<'day', DashboardDay>
  day_observations: MetricEnvelope<'day_observations', DashboardDayObservations>
}
