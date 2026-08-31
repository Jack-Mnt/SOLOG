export type SologRole = 'cajero' | 'moderador' | 'admin'

export type SologDeviceState =
  | 'token_requerido'
  | 'pendiente'
  | 'autorizado'
  | 'revocado'

export type SologSessionState = 'activo' | 'finalizado' | 'expirado'

export type SologDifferenceState = 'Coincide' | 'Recontar' | 'Confirmada' | 'Inconsistente'

export type SologControlStateGroup =
  | 'recontar'
  | 'confirmadas'
  | 'inconsistentes'
  | 'coinciden'
  | 'todos'

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
  iniciado_at: string
  expira_at: string
  grupos_guardados: number
}

export interface SologAvailableStockState {
  disponible: true
  snapshot_id: string
  snapshot_at: string
  confirmado_at: string
  puede_iniciar_conteo: boolean
}

export interface SologUnavailableStockState {
  disponible: false
  snapshot_id: null
  snapshot_at: null
  confirmado_at: null
  puede_iniciar_conteo: false
}

export type SologStockState = SologAvailableStockState | SologUnavailableStockState

export interface SologCoverage {
  grupos_contados: number
  grupos_totales: number
  pendientes: number
  porcentaje: number
}

export interface SologDailyCoverage {
  fecha: string
  grupos_requeridos: number
  grupos_verificados: number
  pendientes: number
  porcentaje: number
  sin_requerimientos: boolean
}

export interface SologFortnightCoverage extends SologCoverage {
  completa: boolean
  inaugurada: boolean
  desde: string
  hasta: string
}

export interface SologCategory {
  id: string
  nombre: string
  orden: number
  grupos_totales: number
  grupos_pendientes_quincena: number
  pendientes?: number
}

export interface SologMainCountState {
  categorias: SologCategory[]
  stock_cero_pendientes: number
}

export interface SologOperationalViewState {
  cantidad: number
  habilitado: boolean
}

export interface SologIntelligentViews {
  conteo_diario: SologOperationalViewState
  revisar: SologOperationalViewState
}

export interface SologOperationalBootstrap {
  usuario: SologUser
  sede: SologSede
  dispositivo: SologDevice
  sesion_activa: SologActiveSession | null
  stock: SologStockState
  server_now: string
  cobertura_diaria: SologDailyCoverage
  cobertura_quincenal: SologFortnightCoverage
  conteo_principal: SologMainCountState
  vistas_inteligentes: SologIntelligentViews
}

export type SologAdminOperationalBootstrap = Omit<
  SologOperationalBootstrap,
  'stock'
> & {
  stock: SologStockState | null
}

export interface SologAdminUser {
  id: string
  nombre: string
  rol: 'admin' | 'moderador'
}

export interface SologAuthorizedDevice {
  id: string
  estado: 'autorizado'
  autorizado_at: string | null
  ultimo_acceso_at: string | null
}

export interface SologAdminActiveSession {
  id: string
  estado: 'activo'
  iniciado_at: string
  expira_at: string
  usuario_id: string
  grupos_registrados: number
}

export interface SologAdminSite extends SologSede {
  dispositivo: SologAuthorizedDevice | null
  sesion_activa: SologAdminActiveSession | null
  cobertura_diaria: SologDailyCoverage
  cobertura_quincenal: SologFortnightCoverage
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

export interface SologDashboardCoverage {
  grupos_contados: number
  grupos_totales: number
  porcentaje: number
}

export type SologDashboardDailyCoverage = SologDailyCoverage

export interface SologDashboardActivity {
  ultima_actividad_at: string | null
  sesion_activa: boolean
}

export interface SologDashboardSite {
  sede_id: string
  sede: string
  cobertura_quincenal: SologDashboardCoverage
  cobertura_hoy: SologDashboardDailyCoverage
  recontar: number
  confirmadas: number
  inconsistentes: number
  actividad: SologDashboardActivity
}

export interface SologDashboardResponse {
  kpis: {
    cobertura_quincenal: SologDashboardCoverage
    contados_hoy: {
      grupos_contados: number
    }
    recontar: number
    confirmadas: number
    inconsistentes: number
  }
  sedes: SologDashboardSite[]
  periodo: {
    fecha: string
    quincena_desde: string
    quincena_hasta: string
  }
  server_now: string
}

export type SologDashboardSiteActivityState =
  | 'activo'
  | 'finalizado'
  | 'expirado'

export interface SologDashboardSiteActivitySession {
  conteo_id: string
  usuario: string
  estado: SologDashboardSiteActivityState
  iniciado_at: string
  finalizado_at: string | null
  duracion_segundos: number
  observaciones_registradas: number
  grupos_verificados_distintos: number
}

export interface SologDashboardSiteActivityResponse {
  server_now: string
  sede_id: string
  sede: string
  summary: {
    sesiones_hoy: number
    observaciones_registradas_hoy: number
    grupos_verificados_distintos_hoy: number
    sesion_activa: boolean
    ultima_actividad_at: string | null
  }
  sessions: SologDashboardSiteActivitySession[]
  limit: number
}

export type SologAdminIncidentType =
  | 'producto_ausente'
  | 'codigo_interno_invalido'
  | 'codigo_interno_duplicado'
  | 'stock_invalido'

export type SologAdminIncidentDecision =
  | 'reviewed'
  | 'ignore_15d'
  | 'deleted'

export interface SologAdminIncidentRow {
  id: string
  tipo: SologAdminIncidentType
  estado: string
  sede_id: string | null
  sede: string | null
  c_interno: number | null
  c_interno_original: string | null
  producto: string | null
  datos: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  occurrence_count: number
  stock_actual: number | null
  categoria: string | null
  grupo: string | null
  primer_snapshot_id: string | null
  ultimo_snapshot_id: string | null
  producto_eliminado_stock: boolean | null
}

export interface SologAdminIncidentsFilters {
  sede_id?: string
  tipo?: SologAdminIncidentType
  estado?: string
  c_interno?: number
  producto?: string
  desde?: string
  hasta?: string
  limit?: number
  offset?: number
}

export interface SologAdminIncidentsResponse {
  rows: SologAdminIncidentRow[]
  limit: number
  offset: number
  counts: Record<string, number>
}

export interface SologAdminIncidentActionPayload {
  incident_id: string
  action: SologAdminIncidentDecision
}

export interface SologAdminIncidentActionResponse {
  ok: true
  codigo: string
  [key: string]: unknown
}

export type SologCatalogChangeType =
  | 'agregar_producto'
  | 'eliminar_producto'
  | 'nombre'
  | 'precio'
  | 'codigo'

export type SologCatalogChangeScope = 'producto'

export type SologCatalogChangeSection = 'urgente' | 'pendiente'

export type SologCatalogChangeStatus =
  | 'pendiente'
  | 'aprobado'
  | 'ignorado'
  | 'incorporado'

export type SologCatalogDecision = 'approve' | 'ignore' | 'withdraw'

export interface SologCatalogChangeSite {
  id: string
  nombre: string
}

export interface SologCurrentCatalogProduct {
  producto: string | null
  marca: string | null
  categoria: string | null
  precio: number | null
  c_barras: string | null
  estado: string | null
  grupo: string | null
}

export interface SologCatalogChangeRow {
  propuesta_fingerprint: string
  cambio_id: string | null
  ambito: SologCatalogChangeScope
  tipo: SologCatalogChangeType
  seccion: SologCatalogChangeSection
  estado: SologCatalogChangeStatus
  c_interno: number | null
  grupo_id: string | null
  producto: string | null
  datos: Record<string, unknown>
  sedes: SologCatalogChangeSite[]
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  catalogo_actual: SologCurrentCatalogProduct
  aprobado_at: string | null
  ignorado_at: string | null
  incorporado_at?: string | null
  version_aplicada: number | null
}

export interface SologCatalogChangesFilters {
  seccion?: SologCatalogChangeSection
  tipo?: SologCatalogChangeType
  estado?: SologCatalogChangeStatus
  ambito?: SologCatalogChangeScope
  c_interno?: number
  producto?: string
  limit?: number
  offset?: number
}

export interface SologCatalogChangeCounts {
  pendiente?: number
  aprobado?: number
  ignorado?: number
  incorporado?: number
  urgentes_pendientes?: number
  cambios_pendientes?: number
  producto_aprobado?: number
  grupo_aprobado?: number
  [key: string]: number | undefined
}

export interface SologCatalogChangesResponse {
  rows: SologCatalogChangeRow[]
  limit: number
  offset: number
  counts: SologCatalogChangeCounts
}

interface SologCatalogNewProductConfigBase {
  marca: string
  categoria_id: string
}

export type SologCatalogNewProductConfig = SologCatalogNewProductConfigBase &
  (
    | { estado: 'Único' | 'Excluido'; grupo_conteo_id: null }
    | { estado: 'Agrupado'; grupo_conteo_id: string }
  )

export type SologCatalogChangeActionPayload =
  | {
      propuesta_fingerprint: string
      decision: 'ignore'
    }
  | {
      propuesta_fingerprint: string
      decision: 'approve'
      config?: SologCatalogNewProductConfig
    }
  | {
      propuesta_fingerprint: string
      decision: 'withdraw'
    }

export interface SologCatalogChangeActionResponse {
  ok: true
  codigo: string
  [key: string]: unknown
}

export interface SologCatalogReferenceCategory {
  id: string
  nombre: string
  orden?: number | null
}

export interface SologCatalogReferenceGroup {
  id: string
  nombre: string
  categoria_id: string
  precio: number
  activo?: boolean
}

export interface SologCatalogReference {
  categorias: SologCatalogReferenceCategory[]
  grupos: SologCatalogReferenceGroup[]
}

export interface SologCatalogStatus {
  version_actual: number | null
  publicado_at: string | null
}

export type SologGroupProductMode = 'Único' | 'Agrupado' | 'Excluido'

export interface SologAdminGroupProduct {
  c_interno: number
  producto: string
  marca: string | null
  precio: number
  estado: SologGroupProductMode
}

export interface SologGroupSummary {
  id: string
  nombre: string
  categoria_id: string
  categoria: string
  precio: number
  unidades_por_paquete: number | null
  precio_paquete: number | null
  activo: boolean
  tipo: 'Único' | 'Agrupado'
  sku_count: number
  integrantes: SologAdminGroupProduct[]
}

export type SologGroupDetail = SologGroupSummary

export interface SologAdminGroupsFilters {
  categoria_id?: string
  precio?: number
  tipo?: 'Único' | 'Agrupado'
  buscar?: string
  limit?: number
  offset?: number
}

export interface SologAdminGroupsResponse {
  rows: SologGroupSummary[]
  limit: number
  offset: number
}

export interface SologGroupProductSearchRow extends SologAdminGroupProduct {
  categoria_id: string
  categoria: string
  grupo_id: string | null
  grupo: string | null
}

export interface SologGroupProductsFilters {
  categoria_id?: string
  grupo_id?: string
  estado?: SologGroupProductMode
  buscar?: string
  limit?: number
  offset?: number
}

export interface SologGroupProductsResponse {
  rows: SologGroupProductSearchRow[]
  limit: number
  offset: number
}

export type SologGroupChangePayload =
  | {
      kind: 'definition'
      grupo_id?: string
      nombre: string
      categoria_id: string
      precio: number
    }
  | {
      kind: 'classification'
      c_interno: number
      estado: 'Único' | 'Excluido'
      grupo_conteo_id: null
    }
  | {
      kind: 'classification'
      c_interno: number
      estado: 'Agrupado'
      grupo_conteo_id: string
    }

export type SologGroupChangeResponse =
  | {
      ok: true
      codigo: 'GROUP_CREATED'
      grupo_id: string
      aplicado: true
    }
  | {
      ok: true
      codigo: 'GROUP_CHANGE_SAVED'
      grupo_id: string
      aplicado: true
      sku_afectados?: number
    }
  | {
      ok: true
      codigo: 'GROUP_CHANGE_SAVED'
      c_interno: number
      aplicado: true
      estado: SologGroupProductMode
      grupo_id: string | null
    }

export interface SologGroupValuationSavePayload {
  grupo_id: string
  unidades_por_paquete: number | null
  precio_paquete: number | null
}

export interface SologGroupValuationSaveResponse {
  ok: true
  codigo: 'GROUP_VALUATION_SAVED'
  grupo_id: string
  unidades_por_paquete: number | null
  precio_paquete: number | null
  updated_at: string
}

export interface SologCatalogConflict {
  codigo: string
  mensaje: string
  entidad_tipo: 'producto' | 'grupo' | null
  entidad_id: string | null
  change_ids: string[]
}

export type SologCatalogPublicationSummary = Partial<
  Record<SologCatalogChangeType, number>
> & Record<string, number | undefined>

export type CatalogPublicationPreview =
  | {
      ok: true
      codigo: 'CATALOG_PREVIEW_READY'
      version_actual: number
      version_nueva: number
      schema_version: number
      sku_actuales: number
      sku_nuevos: number
      cambios_total: number
      cambios: SologCatalogPublicationSummary
      change_ids: string[]
      productos: Array<Record<string, unknown>>
      conflictos: SologCatalogConflict[]
      errores: string[]
      puede_publicar: boolean
    }
  | {
      ok: false
      codigo: string
      errores?: string[]
      conflictos?: SologCatalogConflict[]
      [key: string]: unknown
    }

export type PublishCatalogResponse =
  | {
      ok: true
      codigo: 'CATALOG_PUBLISHED'
      version: number
      [key: string]: unknown
    }
  | {
      ok: false
      codigo: string
      [key: string]: unknown
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

export type SologControlScope = 'resolver' | 'historial'

export interface SologControlPayload {
  sede_id: string
  date_from: string
  date_to: string
  scope: SologControlScope
  grupo_estado?: SologControlStateGroup
  categoria_id?: string
  search?: string
  limit: number
  offset: number
}

export interface SologControlSummary {
  total: number
  recontar: number
  confirmadas: number
  inconsistentes: number
  coincide: number
}

export interface SologControlRow {
  detalle_id: string
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
  estado_diferencia: SologDifferenceState
  contado_at: string
  snapshot_referencia_id: string
  primer_snapshot_posterior_id: string | null
  snapshot_posterior_id: string | null
  stock_posterior: number | null
  snapshot_reconteo_id: string | null
  stock_reconteo: number | null
  recontado_at: string | null
  es_observacion_vigente: boolean
}

export interface SologControlResponse {
  sede_id: string
  sede: string
  date_from: string
  date_to: string
  scope: SologControlScope
  grupo_estado: SologControlStateGroup | null
  summary: SologControlSummary
  rows: SologControlRow[]
  total: number
  limit: number
  offset: number
  server_now: string
}

export interface SologControlExportPayload {
  sede_id: string
  date_from: string
  date_to: string
}

export type SologControlExportState = 'Confirmada'

export type SologControlExportGroupType = 'Individual' | 'Agrupado'

export interface SologControlExportRow {
  fecha: string
  categoria: string
  grupo: string
  tipo: SologControlExportGroupType
  codigos_internos: number[]
  teorico: number
  fisico: number
  reconteo: number | null
  ajuste: number
  valor_economico: number
  detalle_id: string
  estado: SologControlExportState
}

export interface SologControlExportResponse {
  sede_id: string
  sede: string
  date_from: string
  date_to: string
  registros: number
  faltantes: number
  sobrantes: number
  balance: number
  rows: SologControlExportRow[]
  server_now: string
}

export interface SologControlDetailPayload {
  detalle_id: string
}

export type SologControlDetailCase = Omit<
  SologControlRow,
  'categoria_id' | 'es_observacion_vigente'
>

export interface SologControlSku {
  c_interno: number
  c_barras: string | null
  producto: string
  marca: string | null
  precio: number
  estado: string
}

export interface SologControlHistoryRow {
  detalle_id: string
  conteo_id: string
  stock_teorico: number
  stock_fisico: number
  diferencia: number
  valor_diferencia: number
  estado_diferencia: SologDifferenceState
  contado_at: string
  snapshot_referencia_id: string
  primer_snapshot_posterior_id: string | null
  snapshot_posterior_id: string | null
  stock_posterior: number | null
  snapshot_reconteo_id: string | null
  stock_reconteo: number | null
  recontado_at: string | null
}

export interface SologControlDetailResponse {
  detalle: SologControlDetailCase
  historial: SologControlHistoryRow[]
  historial_total: number
  skus: SologControlSku[]
  server_now: string
}
