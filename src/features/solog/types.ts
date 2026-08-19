export type SologRole = 'cajero' | 'moderador' | 'admin'

export type SologDeviceState =
  | 'token_requerido'
  | 'pendiente'
  | 'autorizado'
  | 'revocado'

export type SologCountType =
  | 'categoria'
  | 'cambios_recientes'
  | 'stock_cero'
  | 'stock_negativo'
  | 'reconteo'

export type SologGroupView =
  | 'categoria'
  | 'cambios_recientes'
  | 'stock_cero'
  | 'stock_negativo'
  | 'contar_detalladamente'

export type SologRegularCountType = Exclude<SologCountType, 'reconteo'>

export type SologRegularGroupView = Exclude<
  SologGroupView,
  'contar_detalladamente'
>

export type SologDifferenceState =
  | 'coincide'
  | 'pendiente'
  | 'probablemente_explicada'
  | 'parcialmente_explicada'
  | 'persistente'
  | 'confirmada_reconteo'
  | 'conteos_inconsistentes'

export type SologCountCompletionState = 'completado' | 'parcial'

export type SologAdminReportType =
  | 'summary'
  | 'counts'
  | 'differences'
  | 'history'
  | 'pos_adjustments'

export type SologAdminCountState =
  | 'activo'
  | 'parcial'
  | 'completado'
  | 'expirado'

export type SologAdminDifferenceState = Exclude<
  SologDifferenceState,
  'coincide'
>

export type SologAdminPosAdjustmentState =
  | 'parcialmente_explicada'
  | 'persistente'
  | 'confirmada_reconteo'
  | 'conteos_inconsistentes'

export interface SologUser {
  id: string
  nombre: string
  rol: SologRole
  activo?: boolean
}

export interface SologSede {
  id: string
  nombre: string
  activo: boolean
}

export interface SologDevice {
  id: string
  estado: SologDeviceState
  sede_correcta: boolean
  autorizado: boolean
}

export interface SologActiveSession {
  id: string
  tipo: SologCountType
  categoria_id?: string | null
  iniciado_at: string
  expira_at: string
  snapshot_referencia_id: string
  snapshot_referencia_at: string
  grupos_contados: number
}

export interface SologStockState {
  disponible: boolean
  snapshot_id: string | null
  snapshot_at: string | null
  version_catalogo: number | null
}

export interface SologCoverage {
  grupos_contados: number
  grupos_totales: number
  pendientes: number
  porcentaje: number
}

export interface SologCategory {
  id: string
  nombre: string
  orden: number
  grupos_inventariables: number
}

export interface SologViewCounts {
  cambios_recientes: number
  stock_cero: number
  stock_negativo: number
  contar_detalladamente: number
}

export interface SologOperationalBootstrap {
  usuario: SologUser
  sede: SologSede
  dispositivo: SologDevice
  sesion_activa: SologActiveSession | null
  stock: SologStockState
  cobertura_hoy: SologCoverage
  categorias: SologCategory[]
  vistas: SologViewCounts
}

export interface SologGroupProduct {
  c_interno: number
  producto: string
  marca: string
}

export interface SologCountGroupBase {
  grupo_id: string
  nombre: string
  categoria_id: string
  categoria: string
  precio: number
  stock_teorico: number
  productos: SologGroupProduct[]
  contado: boolean
}

export interface SologRegularCountGroup extends SologCountGroupBase {
  conteo_origen_id: string | null
  estado_diferencia: 'parcialmente_explicada' | 'persistente' | null
  stock_fisico_original: number | null
  contado_at_original: string | null
}

export interface SologRecountGroup extends SologCountGroupBase {
  /** ID del conteo original. Se usa solo en `rpc_solog_count/recount`. */
  conteo_origen_id: string
  estado_diferencia: 'parcialmente_explicada' | 'persistente'
  stock_fisico_original: number
  contado_at_original: string
}

export type SologCountGroup = SologRegularCountGroup | SologRecountGroup

export function isSologRecountGroup(
  group: SologCountGroup,
): group is SologRecountGroup {
  return (
    typeof group.conteo_origen_id === 'string' &&
    group.conteo_origen_id.length > 0 &&
    (group.estado_diferencia === 'parcialmente_explicada' ||
      group.estado_diferencia === 'persistente') &&
    Number.isInteger(group.stock_fisico_original) &&
    typeof group.contado_at_original === 'string' &&
    group.contado_at_original.length > 0
  )
}

export interface SologGroupsResponse {
  conteo_id: string
  vista: SologGroupView
  snapshot_referencia_id: string
  snapshot_referencia_at: string
  grupos: SologCountGroup[]
}

export type SologCountStartPayload =
  | {
      device_token: string
      tipo: 'categoria'
      categoria_id: string
    }
  | {
      device_token: string
      tipo: Exclude<SologCountType, 'categoria'>
    }

export interface SologCountStartResponse {
  ok: true
  codigo: 'COUNT_STARTED'
  conteo_id: string
  tipo: SologCountType
  categoria_id?: string | null
  snapshot_referencia_id: string
  snapshot_referencia_at: string
  iniciado_at: string
  expira_at: string
}

export interface SologCountSavePayload {
  device_token: string
  conteo_id: string
  grupo_id: string
  stock_fisico: number
}

export interface SologCountSaveResponse {
  ok: true
  codigo: 'GROUP_COUNT_SAVED'
  conteo_id: string
  grupo_id: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  precio: number
  valor_diferencia: number
  estado_diferencia: SologDifferenceState
  contado_at: string
}

export interface SologCountFinishPayload {
  device_token: string
  conteo_id: string
}

export interface SologCountFinishResponse {
  ok: true
  codigo: 'COUNT_FINISHED'
  conteo_id: string
  estado: SologCountCompletionState
  grupos_elegibles: number | null
  grupos_contados: number | null
  reconteos_pendientes: number | null
  finalizado_at: string
}

export interface SologRecountPayload {
  device_token: string
  /** ID del conteo original; nunca el ID de la sesión activa de reconteo. */
  conteo_id: string
  grupo_id: string
  stock_fisico: number
}

export interface SologRecountResponse {
  ok: true
  codigo: 'RECOUNT_SAVED'
  conteo_id: string
  grupo_id: string
  stock_fisico_original: number
  reconteo_stock: number
  estado_diferencia: 'confirmada_reconteo' | 'conteos_inconsistentes'
  recontado_at: string
}

export interface SologAdminUser {
  id: string
  nombre: string
  rol: 'admin' | 'moderador'
}

export interface SologAuthorizedDevice {
  id: string
  estado: 'autorizado'
  autorizado_at: string
  ultimo_acceso_at: string | null
}

export interface SologAdminCoverage {
  grupos_contados: number
  grupos_totales: number
}

export interface SologAdminActiveSession {
  id: string
  tipo: SologCountType
  iniciado_at: string
  expira_at: string
  usuario_id: string
}

export interface SologAdminSite extends SologSede {
  dispositivo: SologAuthorizedDevice | null
  sesion_activa: SologAdminActiveSession | null
  cobertura_hoy: SologAdminCoverage
}

export interface SologPendingDevice {
  id: string
  sede_id: string
  sede: string
  solicitado_por: string
  solicitante: string
  solicitado_at: string
  ultimo_acceso_at: string | null
}

export interface SologAdminBootstrap {
  usuario: SologAdminUser
  sedes: SologAdminSite[]
  dispositivos_pendientes: SologPendingDevice[]
}

export interface SologAuthorizeDeviceResponse {
  ok: true
  codigo: 'DEVICE_AUTHORIZED'
  device_id: string
  sede_id: string
  autorizado_por: string
}

export interface SologRevokeDeviceResponse {
  ok: true
  codigo: 'DEVICE_REVOKED'
  device_id: string
  sede_id: string
}

export interface SologAdminReportFilters {
  sede_id?: string
  date_from: string
  date_to: string
}

export type SologAdminReportPayload =
  | (SologAdminReportFilters & {
      report_type: 'summary'
    })
  | (SologAdminReportFilters & {
      report_type: 'counts'
      estado?: SologAdminCountState
      limit: number
      offset: number
    })
  | (SologAdminReportFilters & {
      report_type: 'differences'
      estado?: SologAdminDifferenceState
      limit: number
      offset: number
    })
  | (SologAdminReportFilters & {
      report_type: 'history'
      estado?: SologDifferenceState
      c_interno?: number
      limit: number
      offset: number
    })
  | (SologAdminReportFilters & {
      report_type: 'pos_adjustments'
      estado?: SologAdminPosAdjustmentState
      c_interno?: number
      limit: number
      offset: number
    })

export interface SologAdminSummaryRow {
  sede_id: string
  sede: string
  grupos_totales: number
  grupos_contados: number
  sesiones: number
  coincide: number
  pendiente: number
  probablemente_explicada: number
  parcialmente_explicada: number
  persistente: number
  confirmada_reconteo: number
  conteos_inconsistentes: number
}

export interface SologAdminCountRow {
  conteo_id: string
  sede_id: string
  sede: string
  usuario_id: string
  usuario: string
  tipo: SologCountType
  categoria_id: string | null
  estado: SologAdminCountState
  iniciado_at: string
  expira_at: string
  finalizado_at: string | null
  snapshot_referencia_id: string
  grupos_contados: number
}

export interface SologAdminObservationRow<
  TState extends SologDifferenceState = SologDifferenceState,
> {
  conteo_id: string
  grupo_id: string
  grupo: string
  categoria_id: string
  categoria: string
  sede_id: string
  sede: string
  usuario_id: string
  usuario: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  precio: number
  valor_diferencia: number
  estado_diferencia: TState
  contado_at: string
  snapshot_referencia_id: string
  snapshot_posterior_id: string | null
  stock_posterior: number | null
  reconteo_stock: number | null
  recontado_at: string | null
  sku_count: number
  sku_unico: number | null
}

export type SologAdminDifferenceRow =
  SologAdminObservationRow<SologAdminDifferenceState>

export type SologAdminHistoryRow = SologAdminObservationRow

export type SologAdminPosAdjustmentRow =
  SologAdminObservationRow<SologAdminPosAdjustmentState>

export interface SologAdminSummaryResponse {
  report_type: 'summary'
  date_from: string
  date_to: string
  rows: SologAdminSummaryRow[]
}

export interface SologAdminCountsResponse {
  report_type: 'counts'
  limit: number
  offset: number
  rows: SologAdminCountRow[]
}

export interface SologAdminDifferencesResponse {
  report_type: 'differences'
  limit?: number
  offset?: number
  rows: SologAdminDifferenceRow[]
}

export interface SologAdminHistoryResponse {
  report_type: 'history'
  limit?: number
  offset?: number
  rows: SologAdminHistoryRow[]
}

export interface SologAdminPosAdjustmentsResponse {
  report_type: 'pos_adjustments'
  limit?: number
  offset?: number
  rows: SologAdminPosAdjustmentRow[]
}

export type SologAdminReportResponse =
  | SologAdminSummaryResponse
  | SologAdminCountsResponse
  | SologAdminDifferencesResponse
  | SologAdminHistoryResponse
  | SologAdminPosAdjustmentsResponse
