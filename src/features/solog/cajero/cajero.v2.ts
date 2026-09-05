// Contrato de integración SOLOG V7 (API contract_version = 2).
export interface CashierRevisions { groups: number; devices: number; operational: number }
export interface CashierBasis {
  snapshot_referencia_id: string | null
  version_catalogo: number | null
  groups_revision: number
  periodo_desde: string
  periodo_hasta: string
}
export interface CashierSession extends CashierBasis {
  id: string
  sede_id: string
  usuario_id: string
  estado: 'activo' | 'finalizado' | 'expirado'
  iniciado_at: string
  expira_at: string
  finalizado_at: string | null
}
export interface CashierGroup {
  grupo_id: string
  nombre: string
  categoria_id: string
  categoria: string
  tipo: string
  precio: number
  unidades_por_paquete: number | null
  precio_paquete: number | null
  codigos_internos: number[]
  productos: { c_interno: number; producto: string; marca: string | null; precio: number }[]
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
export interface CashierKpis {
  groups_total: number
  coverage_counted: number
  coverage_percent: number
  count_pending: number
  review_pending: number
}
export interface CashierState {
  session: CashierSession
  groups: CashierGroup[]
  count_queue: string[]
  review_queue: CashierReviewQueueItem[]
  kpis: CashierKpis
}
export interface CashierReviewQueueItem {
  grupo_id: string
  detalle_id: string
  ultima_diferencia: number
  contado_at: string
}
export type CashierPanel = Omit<CashierState, 'session'> & { basis: CashierBasis } & (
  | { source: 'pre_session'; frozen: false; session: null }
  | { source: 'session'; frozen: true; session: CashierSession }
)
export interface CashierBootstrap {
  contract_version: 2
  generated_at: string
  server_now: string
  identity: { id: string; nombre: string; rol: 'cajero' }
  site: { id: string; nombre: string }
  device: { id: string | null; estado: string; sede_correcta: boolean | null; autorizado: boolean; sede_tiene_dispositivo_autorizado: boolean }
  revisions: CashierRevisions
  start_capability: { allowed: boolean; reason: string | null; snapshot_id: string | null; snapshot_at: string | null; confirmado_at: string | null; version_catalogo: number | null; snapshot_expira_at: string | null }
  session_state: CashierState | null
  panel_state: CashierPanel
}
export type CashierAction = 'start' | 'save_batch' | 'recount_save_batch' | 'finish'
export interface CashierCountSavedItem {
  client_observation_id: string
  detalle_id: string
  grupo_id: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  estado_diferencia: string
  contado_at: string
}
export interface CashierRecountSavedItem {
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
export interface CashierMutation {
  contract_version: 2
  generated_at: string
  action: CashierAction
  replay: boolean
  revisions: CashierRevisions
  state?: CashierState
  conteo_id?: string
  saved?: number
  items?: CashierCountSavedItem[] | CashierRecountSavedItem[]
}
