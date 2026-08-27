import type {
  SologDailyCoverage,
  SologDifferenceState,
  SologFortnightCoverage,
} from '../types'

export type CajeroRoute =
  | '/cajero'
  | '/cajero/conteo'
  | '/cajero/seguimiento'
  | '/cajero/historial'

export type CajeroCountView =
  | 'categoria'
  | 'stock_cero'
  | 'stock_negativo'
  | 'seguimiento'

export type CajeroObservationType =
  | 'auto'
  | 'base'
  | 'seguimiento'
  | 'reconteo'

export type CajeroHistoryPeriod = 'hoy' | 'ayer'

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
  productos: CajeroProduct[]
  detalle_origen_id: string | null
  motivo_seguimiento: string | null
  estado_diferencia: SologDifferenceState | null
  contado_at_original: string | null
  ultima_diferencia: number | null
}

export type CajeroGroupsPayload =
  | {
      device_token: string
      vista: 'categoria'
      categoria_id: string
    }
  | {
      device_token: string
      vista: Exclude<CajeroCountView, 'categoria'>
    }

export interface CajeroGroupsResponse {
  conteo_id: string
  vista: CajeroCountView
  snapshot_referencia_id: string
  snapshot_referencia_at: string
  snapshot_actual_id: string | null
  stock_actualizado: boolean
  grupos: CajeroCountGroup[]
}

export interface CajeroStartPayload {
  device_token: string
}

export interface CajeroStartResponse {
  ok: true
  codigo: 'COUNT_STARTED'
  conteo_id: string
  snapshot_referencia_id: string
  snapshot_referencia_at: string
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
  tipo_observacion: CajeroObservationType
  observacion_origen_id: string | null
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
  tipo_observacion: Exclude<CajeroObservationType, 'auto'>
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  precio: number
  valor_diferencia: number
  estado_diferencia: SologDifferenceState
  diferencia_confirmada: number | null
  contado_at: string
}

export interface CajeroBatchRejectedItem {
  client_observation_id: string | null
  grupo_id: string | null
  codigo: string
  detalle?: string
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
  sesion_expirada: boolean
  stock_actualizado: boolean
  requiere_nueva_sesion: boolean
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
  estado: 'finalizado'
  grupos_guardados: number
  cobertura_diaria: SologDailyCoverage
  cobertura_quincenal: SologFortnightCoverage
  finalizado_at: string
}

export interface CajeroHistoryPayload {
  device_token: string
  periodo: CajeroHistoryPeriod
}

export interface CajeroHistoryItem {
  detalle_id: string
  contado_at: string
  grupo_id: string
  grupo: string
  tipo_observacion: Exclude<CajeroObservationType, 'auto'>
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  precio: number
  valor_diferencia: number
  estado_diferencia: SologDifferenceState
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
}

export interface CajeroObservationDisplayData {
  vista: CajeroCountView
  categoria_id: string | null
  grupo: string
  categoria: string
  stock_teorico: number
  precio: number
  ultima_diferencia: number | null
  motivo_seguimiento: string | null
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
  tipo_observacion: CajeroObservationType
  observacion_origen_id: string | null
  display: CajeroObservationDisplayData
}

export interface CajeroBuffer {
  version: 3
  scope: CajeroBufferScope
  items: CajeroPendingObservation[]
}
