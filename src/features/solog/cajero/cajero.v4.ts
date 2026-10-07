// Wire contract: docs/SOLOG_Backend_Contrato_Cajero_V4.md.
// Foundation only; the productive runtime is connected in a later phase.
export type CashierV4SessionState = 'activo' | 'recovery' | 'finalizado' | 'expirado'
export type CashierV4GroupAction = 'recount' | 'coverage' | 'daily' | 'none'
export type CashierV4NextAction = 'review' | 'coverage' | 'daily' | 'none'
export type CashierV4ReviewPriorityClass = 'review_for_coverage' | 'review_regular'
export type CashierV4Round = 1 | 2
export type CashierV4Shift = 'early' | 'day' | 'night'
export type CashierV4Action = 'start' | 'save_batch' | 'recount_save_batch' | 'finish'

export interface CashierV4Revisions { groups: number; devices: number; operational: number }
export interface CashierV4TemporalBasis {
  periodo_desde: string
  periodo_hasta: string
  ronda: CashierV4Round
  ronda_desde: string
  ronda_hasta: string
  turno: CashierV4Shift
  turno_desde: string
  turno_hasta: string
}
export interface CashierV4Basis extends CashierV4TemporalBasis {
  snapshot_referencia_id: string
  version_catalogo: number
  groups_revision: number
}
export interface CashierV4Session {
  id: string
  sede_id: string
  usuario_id: string
  estado: CashierV4SessionState
  iniciado_at: string
  expira_at: string
  recovery_until: string
  finalizado_at: string | null
}
export interface CashierV4SessionCapability {
  mode: 'active' | 'recovery' | 'none'
  estado: CashierV4SessionState | null
  capture_allowed: boolean
  pending_delivery_allowed: boolean
  iniciado_at: string | null
  expira_at: string | null
  recovery_until: string | null
  finalizado_at: string | null
}
// Section 16's finish response may omit iniciado_at; other capabilities require it.
export interface CashierV4FinishCapability extends Omit<CashierV4SessionCapability, 'iniciado_at'> {
  mode: 'none'
  estado: 'finalizado'
  capture_allowed: false
  pending_delivery_allowed: false
  iniciado_at?: string | null
  expira_at: string
  recovery_until: string
  finalizado_at: string
}
export interface CashierV4RecoverySession {
  id: string
  iniciado_at: string
  expira_at: string
  recovery_until: string
  snapshot_referencia_id: string
  ronda: CashierV4Round
  turno: CashierV4Shift
  session_capability: CashierV4SessionCapability
}
export interface CashierV4Product {
  c_interno: number
  producto: string
  marca: string | null
  precio: number
}
export interface CashierV4GroupPatch {
  grupo_id: string
  accion: CashierV4GroupAction
  detalle_reconteo_id: string | null
  contado_detalle_id: string | null
  contado_at: string | null
  recontado_at: string | null
}
export interface CashierV4Group extends CashierV4GroupPatch {
  nombre: string
  categoria_id: string
  categoria: string
  tipo: 'Individual' | 'Agrupado'
  precio: number
  unidades_por_paquete: number | null
  precio_paquete: number | null
  codigos_internos: number[]
  productos: CashierV4Product[]
  stock_teorico: number
  snapshot_referencia_id: string
}
export interface CashierV4Kpis {
  coverage_round: CashierV4Round
  coverage_total: number
  coverage_counted: number
  coverage_pending: number
  coverage_percent: number
  review_pending: number
  coverage_queue_pending: number
  daily_pending: number
  coverage_blocked_waiting_snapshot: number
}
export interface CashierV4ReviewQueueItem {
  grupo_id: string
  detalle_id: string
  ultima_diferencia: number
  contado_at: string
  priority_class: CashierV4ReviewPriorityClass
}
export interface CashierV4Queues {
  review_queue: CashierV4ReviewQueueItem[]
  coverage_queue: string[]
  daily_queue: string[]
}
export interface CashierV4Panel extends CashierV4Queues {
  source: 'session'
  frozen: true
  session: CashierV4Session
  basis: CashierV4Basis
  groups: CashierV4Group[]
  kpis: CashierV4Kpis
  next_action: CashierV4NextAction
  session_capability: CashierV4SessionCapability
}
export interface CashierV4PanelDelta extends CashierV4Queues {
  groups_patch: CashierV4GroupPatch[]
  kpis: CashierV4Kpis
  next_action: CashierV4NextAction
  session_capability: CashierV4SessionCapability
}
export interface CashierV4PreSessionSummary {
  basis: CashierV4TemporalBasis
  kpis: CashierV4Kpis
  next_action: CashierV4NextAction
}
export interface CashierV4Stock {
  snapshot_id: string | null
  capturado_at: string | null
  confirmado_at: string | null
  snapshot_expira_at: string | null
  version_catalogo: number | null
}
export interface CashierV4StartStock extends CashierV4Stock {
  snapshot_id: string
  capturado_at: string
  confirmado_at: string
  snapshot_expira_at: string
  version_catalogo: number
}
export interface CashierV4StartCapability { allowed: boolean; reason: string | null }
export interface CashierV4Bootstrap {
  contract_version: 4
  generated_at: string
  server_now: string
  revisions: CashierV4Revisions
  identity: { id: string; nombre: string; rol: 'cajero' }
  site: { id: string; nombre: string }
  device: {
    id: string | null
    estado: string
    sede_correcta: boolean | null
    autorizado: boolean
    sede_tiene_dispositivo_autorizado: boolean
  }
  stock: CashierV4Stock
  start_capability: CashierV4StartCapability
  session_capability: CashierV4SessionCapability
  recovery_sessions: CashierV4RecoverySession[]
  pre_session_summary: CashierV4PreSessionSummary | null
  panel_state: CashierV4Panel | null
}
export interface CashierV4BootstrapRequest { device_token: string }
export interface CashierV4StartRequest extends CashierV4BootstrapRequest { operation_id: string }
export interface CashierV4SessionRequest extends CashierV4StartRequest {
  conteo_id: string
  expected_groups_revision: number
}
export interface CashierV4CountItem {
  client_observation_id: string
  grupo_id: string
  stock_fisico: number
  contado_at: string
}
export interface CashierV4RecountItem {
  detalle_id: string
  stock_fisico: number
  contado_at: string
}
export interface CashierV4SaveBatchRequest extends CashierV4SessionRequest { items: CashierV4CountItem[] }
export interface CashierV4RecountBatchRequest extends CashierV4SessionRequest { items: CashierV4RecountItem[] }
export type CashierV4FinishRequest = CashierV4SessionRequest
export interface CashierV4Requests {
  start: CashierV4StartRequest
  save_batch: CashierV4SaveBatchRequest
  recount_save_batch: CashierV4RecountBatchRequest
  finish: CashierV4FinishRequest
}
export type CashierV4RequestFor<A extends CashierV4Action> = CashierV4Requests[A]
export interface CashierV4CountSavedItem extends CashierV4CountItem {
  detalle_id: string
  stock_teorico: number
  diferencia: number
  estado_diferencia: 'Coincide' | 'Recontar'
}
export interface CashierV4RecountSavedItem {
  detalle_id: string
  grupo_id: string
  snapshot_reconteo_id: string
  stock_teorico_reconteo: number
  stock_reconteo: number
  diferencia_reconteo: number
  diferencia: number
  estado_diferencia: 'Coincide' | 'Confirmada' | 'Inconsistente'
  valor_diferencia: number
  recontado_at: string
}
interface CashierV4MutationBase<A extends CashierV4Action, C = CashierV4SessionCapability> {
  contract_version: 4
  generated_at: string
  action: A
  replay: boolean
  conteo_id: string
  revisions: CashierV4Revisions
  session_capability: C
}
export interface CashierV4StartResult extends CashierV4MutationBase<'start'> {
  stock: CashierV4StartStock
  panel_state: CashierV4Panel
}
export interface CashierV4SaveBatchResult extends CashierV4MutationBase<'save_batch'> {
  saved: number
  items: CashierV4CountSavedItem[]
  panel_delta: CashierV4PanelDelta
}
export interface CashierV4RecountBatchResult extends CashierV4MutationBase<'recount_save_batch'> {
  saved: number
  items: CashierV4RecountSavedItem[]
  panel_delta: CashierV4PanelDelta
}
export interface CashierV4FinishResult extends CashierV4MutationBase<'finish', CashierV4FinishCapability> {
  status: 'finalizado'
  finalizado_at: string
}
export type CashierV4MutationResult = CashierV4StartResult | CashierV4SaveBatchResult | CashierV4RecountBatchResult | CashierV4FinishResult
export type CashierV4MutationResultFor<A extends CashierV4Action> = Extract<CashierV4MutationResult, { action: A }>

export function cashierV4SessionRequestScope(panel: CashierV4Panel): Pick<CashierV4SessionRequest, 'conteo_id' | 'expected_groups_revision'> {
  return { conteo_id: panel.session.id, expected_groups_revision: panel.basis.groups_revision }
}
