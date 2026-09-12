// Contrato wire SOLOG Cajero V3. No sustituye todavía al runtime productivo V2.
export interface CashierV3Revisions { groups: number; devices: number; operational: number }
export interface CashierV3Basis {
  snapshot_referencia_id: string | null
  version_catalogo: number | null
  groups_revision: number
  periodo_desde: string
  periodo_hasta: string
}
export interface CashierV3Session extends CashierV3Basis {
  id: string
  sede_id: string
  usuario_id: string
  estado: 'activo' | 'finalizado' | 'expirado'
  iniciado_at: string
  expira_at: string
  recovery_until: string
  finalizado_at: string | null
}
export interface CashierV3Product {
  c_interno: number
  producto: string
  marca: string | null
  precio: number
}
export interface CashierV3Group {
  grupo_id: string
  nombre: string
  categoria_id: string
  categoria: string
  tipo: string
  precio: number
  unidades_por_paquete: number | null
  precio_paquete: number | null
  codigos_internos: number[]
  productos: CashierV3Product[]
  stock_teorico: number
  snapshot_referencia_id: string | null
  cobertura_periodo: boolean
  estado_stock: string
  requiere_conteo: boolean
  requiere_reconteo: boolean
  detalle_reconteo_id: string | null
  contado_detalle_id: string | null
  contado_at: string | null
  recontado_at: string | null
}
export interface CashierV3Kpis {
  groups_total: number
  coverage_counted: number
  coverage_percent: number
  count_pending: number
  review_pending: number
}
export interface CashierV3ReviewQueueItem {
  grupo_id: string
  detalle_id: string
  ultima_diferencia: number
  contado_at: string
}
export interface CashierV3Panel {
  source: 'session'
  frozen: true
  basis: CashierV3Basis
  session: CashierV3Session
  groups: CashierV3Group[]
  count_queue: string[]
  review_queue: CashierV3ReviewQueueItem[]
  kpis: CashierV3Kpis
}
export interface CashierV3Stock {
  snapshot_id: string | null
  capturado_at: string | null
  confirmado_at: string | null
  snapshot_expira_at: string | null
  version_catalogo: number | null
}
export interface CashierV3StartCapability { allowed: boolean; reason: string | null }
export interface CashierV3SessionCapability {
  mode: 'none' | 'active' | 'recovery'
  capture_allowed: boolean
  pending_delivery_allowed: boolean
  recovery_until: string | null
}
export interface CashierV3StockTypeSummary { total: number; covered: number }
export interface CashierV3PreSessionSummary extends CashierV3Kpis {
  stock_types: {
    positive: CashierV3StockTypeSummary
    zero: CashierV3StockTypeSummary
    negative: CashierV3StockTypeSummary
  }
}
export interface CashierV3Bootstrap {
  contract_version: 3
  generated_at: string
  server_now: string
  revisions: CashierV3Revisions
  identity: { id: string; nombre: string; rol: 'cajero' }
  site: { id: string; nombre: string }
  device: {
    id: string | null
    estado: string
    sede_correcta: boolean | null
    autorizado: boolean
    sede_tiene_dispositivo_autorizado: boolean
  }
  stock: CashierV3Stock
  start_capability: CashierV3StartCapability
  session_capability: CashierV3SessionCapability
  pre_session_summary: CashierV3PreSessionSummary | null
  panel_state: CashierV3Panel | null
}
export interface CashierV3CountSavedItem {
  client_observation_id: string
  detalle_id: string
  grupo_id: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  estado_diferencia: string
  contado_at: string
}
export interface CashierV3RecountSavedItem {
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
export interface CashierV3GroupPatch {
  grupo_id: string
  cobertura_periodo: boolean
  requiere_conteo: boolean
  requiere_reconteo: boolean
  detalle_reconteo_id: string | null
  contado_detalle_id: string | null
  contado_at: string | null
  recontado_at: string | null
}
export interface CashierV3PanelDelta {
  groups_patch: CashierV3GroupPatch[]
  count_queue_remove: string[]
  review_queue_remove: string[]
  kpis: CashierV3Kpis
}
interface CashierV3MutationBase<A extends CashierV3Action> {
  contract_version: 3
  generated_at: string
  action: A
  replay: boolean
  revisions: CashierV3Revisions
  session_capability: CashierV3SessionCapability
}
export interface CashierV3StartResult extends CashierV3MutationBase<'start'> {
  stock: CashierV3Stock
  panel_state: CashierV3Panel
}
export interface CashierV3SaveBatchResult extends CashierV3MutationBase<'save_batch'> {
  conteo_id: string
  saved: number
  items: CashierV3CountSavedItem[]
  panel_delta: CashierV3PanelDelta
}
export interface CashierV3RecountBatchResult extends CashierV3MutationBase<'recount_save_batch'> {
  conteo_id: string
  saved: number
  items: CashierV3RecountSavedItem[]
  panel_delta: CashierV3PanelDelta
}
export interface CashierV3FinishResult extends CashierV3MutationBase<'finish'> {
  conteo_id: string
  status: 'finalizado' | 'expirado'
  finalizado_at: string
}
export type CashierV3Action = 'start' | 'save_batch' | 'recount_save_batch' | 'finish'
export type CashierV3MutationResult = CashierV3StartResult | CashierV3SaveBatchResult | CashierV3RecountBatchResult | CashierV3FinishResult
export type CashierV3MutationResultFor<A extends CashierV3Action> = Extract<CashierV3MutationResult, { action: A }>
