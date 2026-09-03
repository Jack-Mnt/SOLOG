import type {
  SologDailyCoverage,
  SologDifferenceState,
  SologPeriodCoverage,
} from '../types'

export type CajeroRoute =
  | '/cajero'
  | '/cajero/conteo'
  | '/cajero/diario'
  | '/cajero/revisar'
  | '/cajero/historial'

export type CajeroCountView =
  | 'conteo'
  | 'categoria'
  | 'stock_cero'
  | 'stock_negativo'
  | 'conteo_diario'
  | 'revisar'

export type CajeroBackendView = 'conteo' | 'conteo_diario' | 'revisar'

export type CajeroHistoryPeriod = 'hoy' | 'ayer'

export type CajeroStockType = 'positive' | 'zero' | 'negative'

export type CajeroExpressionStatus =
  | 'empty'
  | 'incomplete'
  | 'valid'
  | 'too_high'

export interface CajeroExpressionEvaluation {
  status: CajeroExpressionStatus
  value: number | null
}

export type CajeroCalculatorKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '+'
  | '×'
  | 'times6'
  | 'times12'
  | 'clear'
  | 'backspace'

export interface CajeroExpressionDraft {
  grupo_id: string
  expresion: string
}

export interface CajeroExpressionDraftStore {
  version: 1
  scope: CajeroBufferScope
  items: CajeroExpressionDraft[]
}

export interface CajeroProduct {
  c_interno: number
  producto: string
  marca: string
}

export interface CajeroCountGroup {
  grupo_id: string
  nombre: string
  categoria_id: string
  categoria: string
  precio: number
  stock_teorico: number
  categoria_orden?: number
  cubierto_periodo?: boolean
  stock_cero?: boolean
  stock_negativo?: boolean
  productos?: CajeroProduct[]
  snapshot_actual_id?: string | null
  estado_stock?: string
  stock_posterior?: number | null
  primer_snapshot_posterior_id?: string | null
  snapshot_reconteo_id?: string | null
  detalle_origen_id?: string | null
  estado_diferencia?: SologDifferenceState | null
  contado_at_original?: string | null
  ultima_diferencia?: number | null
}

export interface CajeroGroupsPayload {
  device_token: string
  vista: CajeroBackendView
}

export interface CajeroGroupsResponse {
  conteo_id: string | null
  vista: CajeroBackendView
  snapshot_actual_id: string | null
  snapshot_actual_at: string | null
  grupos: CajeroCountGroup[]
  server_now: string
}

export interface CajeroStatusPayload {
  device_token: string
}

export interface CajeroStatusResponse {
  ok: true
  codigo: 'CASHIER_STATUS'
  server_now: string
  snapshot_actual_id: string | null
  conteo_id: string | null
  cobertura_periodo_completa: boolean
  conteo_diario_pendientes: number
  revisar_pendientes: number
}

export type CajeroCachedView = CajeroBackendView

export interface CajeroGroupsCacheEntry {
  snapshotId: string | null
  response: CajeroGroupsResponse
}
export interface CajeroStartPayload {
  device_token: string
}

export interface CajeroStartResponse {
  ok: true
  codigo: 'COUNT_STARTED'
  conteo_id: string
  snapshot_actual_id: string
  snapshot_actual_at: string
  snapshot_confirmado_at: string
  iniciado_at: string
  expira_at: string
  server_now: string
}

export interface CajeroBatchItem {
  client_observation_id: string
  grupo_id: string
  stock_fisico: number
  contado_at: string
}

export interface CajeroBatchPayload {
  device_token: string
  conteo_id: string
  items: CajeroBatchItem[]
}

export type CajeroBatchItemResult = 'guardado' | 'ya_guardado'

export interface CajeroBatchSavedItem {
  client_observation_id: string
  resultado: CajeroBatchItemResult
  detalle_id: string
  grupo_id: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  estado_diferencia: SologDifferenceState
  snapshot_referencia_id?: string
  contado_at: string
}

export interface CajeroBatchRejectedItem {
  client_observation_id: string | null
  grupo_id: string | null
  codigo: string
  detalle?: string | null
}

export interface CajeroBatchResponse {
  ok: boolean
  codigo:
    | 'COUNT_BATCH_SAVED'
    | 'COUNT_BATCH_PARTIAL'
    | 'COUNT_BATCH_REJECTED'
  conteo_id: string
  items: CajeroBatchSavedItem[]
  errores: CajeroBatchRejectedItem[]
  guardados: number
  ya_guardados: number
  rechazados: number
  server_now: string
}

export interface CajeroFinishPayload {
  device_token: string
  conteo_id: string
}

export interface CajeroFinishResponse {
  ok: true
  codigo: 'COUNT_FINISHED'
  conteo_id: string
  grupos_guardados: number
  cobertura_diaria: SologDailyCoverage
  cobertura_periodo: SologPeriodCoverage
  finalizado_at: string
}

export interface CajeroHistoryPayload {
  device_token: string
  periodo: CajeroHistoryPeriod
}

export interface CajeroHistoryItem {
  stock_posterior: number | null
  stock_reconteo: number | null
  recontado_at: string | null
  detalle_id: string
  contado_at: string
  grupo_id: string
  grupo: string
  categoria_id: string
  categoria: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  precio: number
  valor_diferencia: number
  estado_diferencia: SologDifferenceState
}

export interface CajeroCategoryOption {
  id: string
  nombre: string
  count: number
  orden?: number
}

export interface CajeroHistoryResponse {
  ok: true
  codigo: 'COUNT_HISTORY'
  periodo: CajeroHistoryPeriod
  desde: string
  hasta: string
  items: CajeroHistoryItem[]
  server_now: string
}

export interface CajeroBufferIdentity {
  usuario_id: string
  sede_id: string
  dispositivo_id: string
}

export interface CajeroBufferScope extends CajeroBufferIdentity {
  conteo_id: string
  groups_revision?: number
}

export interface CajeroObservationDisplayData {
  vista: Exclude<CajeroCountView, 'revisar'>
  categoria_id: string | null
  grupo: string
  categoria: string
  stock_teorico: number
  precio: number
}

export interface CajeroPendingObservation extends CajeroBatchItem {
  conteo_id: string
  display: CajeroObservationDisplayData
  error: CajeroBatchRejectedItem | null
}

export interface CajeroObservationInput {
  grupo_id: string
  stock_fisico: number
  contado_at: string
  display: CajeroObservationDisplayData
}

export interface CajeroBuffer {
  version: 4
  scope: CajeroBufferScope
  items: CajeroPendingObservation[]
}

export interface CajeroRecountStartPayload {
  device_token: string
  conteo_id: string
  detalle_id: string
}

export interface CajeroRecountStartResponse {
  conteo_id: string
  detalle_id: string
  snapshot_reconteo_id: string
  stock_teorico_reconteo: number
}

export interface CajeroRecountPayload extends CajeroRecountStartPayload {
  stock_fisico: number
  contado_at: string
}

export interface CajeroRecountResponse {
  conteo_id: string
  detalle_id: string
  snapshot_reconteo_id: string
  stock_teorico_reconteo: number
  stock_reconteo: number
  diferencia_reconteo: number
  diferencia: number
  estado_diferencia: Exclude<SologDifferenceState, 'Recontar'>
  recontado_at: string
}
