import { FunctionsHttpError, type PostgrestError } from '@supabase/supabase-js'

export const SOLOG_BACKEND_ERROR_CODES = [
  'SOLOG_AUTH_REQUIRED',
  'SOLOG_INVALID_PAYLOAD',
  'SOLOG_USER_DISABLED',
  'SOLOG_ROLE_NOT_ALLOWED',
  'SOLOG_INVALID_ACTION',
  'SOLOG_INVALID_DEVICE_TOKEN',
  'SOLOG_DEVICE_REQUIRED',
  'SOLOG_DEVICE_NOT_AUTHORIZED',
  'SOLOG_INVALID_DEVICE_ID',
  'SOLOG_DEVICE_ID_REQUIRED',
  'SOLOG_PENDING_DEVICE_NOT_FOUND',
  'SOLOG_DEVICE_NOT_REVOCABLE',
  'SOLOG_CASHIER_WITHOUT_SEDE',
  'SOLOG_OPERATIONAL_ROLE_REQUIRED',
  'SOLOG_SEDE_DEVICE_ALREADY_AUTHORIZED',
  'SOLOG_DEVICE_SEDE_MISMATCH',
  'SOLOG_INVALID_DETAILS_ACTION',
  'SOLOG_ADMIN_ROLE_REQUIRED',
  'SOLOG_CATEGORY_REQUIRED',
  'SOLOG_CATEGORY_NOT_AVAILABLE',
  'SOLOG_ACTIVE_COUNT_EXISTS',
  'SOLOG_CONFIRMED_SNAPSHOT_REQUIRED',
  'SOLOG_COUNT_NOT_AVAILABLE',
  'SOLOG_COUNT_NOT_ACTIVE',
  'SOLOG_COUNT_EXPIRED',
  'SOLOG_STOCK_EXPIRED',
  'SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY',
  'SOLOG_STOCK_EXPIRED_AT_COUNT',
  'SOLOG_ACTIVE_COUNT_REQUIRED',
  'SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE',
  'SOLOG_INVALID_COUNT_PAYLOAD',
  'SOLOG_INVALID_BATCH_PAYLOAD',
  'SOLOG_BATCH_TOO_LARGE',
  'SOLOG_INVALID_BATCH_ITEM',
  'SOLOG_INVALID_OBSERVATION_TYPE',
  'SOLOG_CLIENT_OBSERVATION_CONFLICT',
  'SOLOG_INVALID_COUNT_TIMESTAMP',
  'SOLOG_DUPLICATE_GROUP_IN_BATCH',
  'SOLOG_GROUP_ALREADY_COVERED_PERIOD',
  'SOLOG_PERIOD_COVERAGE_REQUIRED',
  'SOLOG_GROUP_NOT_AVAILABLE',
  'SOLOG_GROUP_NOT_IN_CATALOG',
  'SOLOG_GROUP_ALREADY_COVERED',
  'SOLOG_GROUP_NOT_YET_COVERED',
  'SOLOG_GROUP_NOT_REQUIRED',
  'SOLOG_GROUP_NOT_ALLOWED_IN_COUNT',
  'SOLOG_USE_RECOUNT_ACTION',
  'SOLOG_VIEW_REQUIRED',
  'SOLOG_INVALID_RECOUNT_PAYLOAD',
  'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD',
  'SOLOG_INVALID_RECOUNT_BATCH_ITEM',
  'SOLOG_RECOUNT_NOT_PENDING',
  'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN',
  'SOLOG_RECOUNT_THEORETICAL_REQUIRED',
  'SOLOG_RECOUNT_NOT_AVAILABLE',
  'SOLOG_RECOUNT_NOT_ELIGIBLE',
  'SOLOG_RECOUNT_ALREADY_SAVED',
  'SOLOG_OPERATIONAL_PERIOD_NOT_STARTED',
  'SOLOG_EXPIRED_SESSION_SUPERSEDED',
  'SOLOG_RECOUNT_ORIGIN_REQUIRED',
  'SOLOG_RECOUNT_ORIGIN_STALE',
  'SOLOG_RECOUNT_ALREADY_DONE',
  'SOLOG_STOCK_UPDATED_BEFORE_COUNT',
  'SOLOG_LATE_BATCH_WINDOW_EXPIRED',
  'SOLOG_INVALID_HISTORY_PERIOD',
  'SOLOG_SEDE_REQUIRED',
  'SOLOG_SEDE_NOT_FOUND',
  'SOLOG_INVALID_CONTROL_FILTER',
  'SOLOG_INVALID_CONTROL_EXPORT_FILTER',
  'SOLOG_INVALID_CONTROL_SCOPE',
  'SOLOG_INVALID_CONTROL_STATE',
  'SOLOG_DATE_RANGE_TOO_LARGE',
  'SOLOG_INVALID_CONTROL_DETAIL',
  'SOLOG_DETALLE_REQUIRED',
  'SOLOG_DETALLE_NOT_FOUND',
  'SOLOG_INVALID_INCIDENT_ACTION',
  'SOLOG_INCIDENT_ACTION_NOT_ALLOWED',
  'SOLOG_INVALID_CATALOG_ACTION',
  'SOLOG_CATALOG_CHANGE_NOT_FOUND',
  'SOLOG_CATALOG_CONFLICT',
  'SOLOG_CATALOG_INCOMPLETE_NEW_PRODUCT',
  'SOLOG_INVALID_GROUP_FILTER',
  'SOLOG_INVALID_GROUP_TYPE',
  'SOLOG_INVALID_GROUP_PRODUCT_FILTER',
  'SOLOG_INVALID_PRODUCT_MODE',
  'SOLOG_INVALID_GROUP_CHANGE_KIND',
  'SOLOG_INVALID_GROUP_DEFINITION',
  'SOLOG_GROUP_NOT_FOUND',
  'SOLOG_GROUP_CHANGE_NOOP',
  'SOLOG_INVALID_GROUP_VALUATION',
  'SOLOG_GROUP_VALUATION_NOOP',
  'SOLOG_GROUP_PROPOSAL_PREVIOUSLY_IGNORED',
  'SOLOG_INVALID_PRODUCT_CLASSIFICATION',
  'SOLOG_PRODUCT_NOT_FOUND',
  'SOLOG_GROUP_REQUIRED',
  'SOLOG_INVALID_CATALOG_CHANGE_ID',
  'SOLOG_INVALID_CATALOG_CHANGE_ACTION',
  'SOLOG_CATALOG_CHANGE_NOT_APPROVED',
  'SOLOG_CATALOG_CHANGE_CONFLICT',
] as const

export type SologBackendErrorCode =
  (typeof SOLOG_BACKEND_ERROR_CODES)[number]

export const SOLOG_CATALOG_FUNCTION_ERROR_CODES = [
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'USER_DISABLED',
  'ADMIN_REQUIRED',
  'NO_APPROVED_CATALOG_CHANGES',
  'CATALOG_UPLOAD_FAILED',
  'CATALOG_COMMIT_FAILED',
  'INVALID_CATALOG_PREVIEW',
] as const

export type SologCatalogFunctionErrorCode =
  (typeof SOLOG_CATALOG_FUNCTION_ERROR_CODES)[number]

export const SOLOG_CATALOG_VALIDATION_ERROR_CODES = [
  'GROUP_PRICE_MISMATCH',
  'GROUP_CATEGORY_MISMATCH',
  'INVALID_GROUP_CARDINALITY',
  'INVALID_UNIQUE_GROUP',
  'PRODUCT_GROUP_NOT_FOUND',
  'PRODUCT_DELETE_CLASSIFICATION_CONFLICT',
  'SKU_DELETE_CLASSIFICATION_CONFLICT',
  'CATALOG_CHANGE_STALE',
  'STALE_PRODUCT_CHANGE',
  'GROUP_NOT_AVAILABLE',
] as const

export type SologCatalogValidationErrorCode =
  (typeof SOLOG_CATALOG_VALIDATION_ERROR_CODES)[number]

export type SologErrorCode =
  | SologBackendErrorCode
  | SologCatalogFunctionErrorCode
  | SologCatalogValidationErrorCode
  | `SOLOG_${string}`

const ERROR_MESSAGES: Partial<Record<SologErrorCode, string>> = {
  SOLOG_DEVICE_UNAUTHORIZED: 'Esta tablet perdió la autorización. Los borradores operativos se han eliminado.',
  SOLOG_SESSION_CONFLICT: 'Ya existe una sesión activa en esta sede. Actualiza el panel.',
  SOLOG_SESSION_EXPIRED: 'La sesión venció. No se permiten nuevas capturas.',
  SOLOG_SESSION_REVISION_CONFLICT: 'La sesión no corresponde a la revisión operativa requerida. Actualiza el panel.',
  SOLOG_GROUPS_REVISION_CONFLICT: 'La revisión de grupos cambió. Actualiza antes de crear una nueva operación.',
  SOLOG_SESSION_NOT_FOUND: 'La sesión ya no está disponible.',
  SOLOG_RECOUNT_NOT_PENDING: 'Este caso ya no está disponible para reconteo.',
  SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN: 'El reconteo debe realizarse en una sesión posterior a la del conteo original.',
  SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD: 'El lote de reconteos no es válido.',
  SOLOG_INVALID_RECOUNT_BATCH_ITEM: 'Uno de los reconteos del lote no es válido.',
  SOLOG_RECOUNT_THEORETICAL_REQUIRED: 'El reconteo no tiene un stock teórico válido para esta sesión.',
  SOLOG_INVALID_OPERATION: 'La operación no es válida. Vuelve a cargar el panel.',
  SOLOG_AUTH_REQUIRED: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  SOLOG_USER_DISABLED: 'Este usuario está deshabilitado.',
  SOLOG_ROLE_NOT_ALLOWED: 'Tu rol no permite realizar esta operación.',
  SOLOG_INVALID_ACTION: 'La acción solicitada no está disponible.',
  SOLOG_DEVICE_NOT_AUTHORIZED: 'Esta tablet todavía no está autorizada.',
  SOLOG_INVALID_DEVICE_ID: 'El dispositivo seleccionado no es válido.',
  SOLOG_DEVICE_ID_REQUIRED: 'Selecciona un dispositivo para continuar.',
  SOLOG_PENDING_DEVICE_NOT_FOUND:
    'La solicitud ya no está pendiente. Se actualizará la administración.',
  SOLOG_DEVICE_NOT_REVOCABLE:
    'El dispositivo ya no puede revocarse. Se actualizará la administración.',
  SOLOG_SEDE_DEVICE_ALREADY_AUTHORIZED:
    'La sede ya tiene otro dispositivo autorizado. Este dispositivo permanece en modo de solo lectura.',
  SOLOG_DEVICE_SEDE_MISMATCH:
    'Este dispositivo no corresponde a la sede asignada a tu usuario.',
  SOLOG_INVALID_DETAILS_ACTION:
    'La acción solicitada no está disponible en Detalles.',
  SOLOG_INVALID_DETAILS_EXPORT_RESPONSE:
    'El backend devolvió datos incompletos para generar el Excel de la sede.',
  SOLOG_ADMIN_ROLE_REQUIRED:
    'Tu usuario ya no tiene permisos para administrar SOLOG.',
  SOLOG_SEDE_REQUIRED: 'Selecciona una sede para consultar Control.',
  SOLOG_SEDE_NOT_FOUND: 'La sede seleccionada ya no está disponible.',
  SOLOG_INVALID_CONTROL_FILTER: 'Uno o más filtros de Control no son válidos.',
  SOLOG_INVALID_CONTROL_EXPORT_FILTER:
    'La sede o el período de exportación no son válidos.',
  SOLOG_INVALID_CONTROL_SCOPE: 'El modo de Control seleccionado no es válido.',
  SOLOG_INVALID_CONTROL_STATE: 'El estado seleccionado no es válido.',
  SOLOG_DATE_RANGE_TOO_LARGE: 'El período no puede superar 366 días.',
  SOLOG_INVALID_CONTROL_DETAIL: 'No se pudo identificar el detalle solicitado.',
  SOLOG_DETALLE_REQUIRED: 'Selecciona una observación para ver su detalle.',
  SOLOG_DETALLE_NOT_FOUND: 'La observación ya no está disponible.',
  SOLOG_INVALID_INCIDENT_ACTION:
    'La decisión seleccionada no es válida para esta incidencia.',
  SOLOG_INCIDENT_ACTION_NOT_ALLOWED:
    'La decisión seleccionada no es válida para esta incidencia.',
  SOLOG_INVALID_CATALOG_ACTION:
    'La decisión seleccionada no es válida para este cambio de catálogo.',
  SOLOG_CATALOG_CHANGE_NOT_FOUND:
    'La propuesta de catálogo ya no está disponible.',
  SOLOG_CATALOG_CONFLICT:
    'La propuesta entra en conflicto con el estado actual del catálogo.',
  SOLOG_CATALOG_INCOMPLETE_NEW_PRODUCT:
    'Completa la marca, categoría, estado y grupo requeridos para aprobar el producto.',
  SOLOG_INVALID_GROUP_FILTER: 'Uno o más filtros de grupos no son válidos.',
  SOLOG_INVALID_GROUP_TYPE: 'El tipo de grupo seleccionado no es válido.',
  SOLOG_INVALID_GROUP_PRODUCT_FILTER: 'La búsqueda de productos no es válida.',
  SOLOG_INVALID_PRODUCT_MODE: 'La modalidad de conteo seleccionada no es válida.',
  SOLOG_INVALID_GROUP_CHANGE_KIND: 'El tipo de cambio de grupo no es válido.',
  SOLOG_INVALID_GROUP_DEFINITION: 'Completa una definición de grupo válida.',
  SOLOG_GROUP_NOT_FOUND: 'El grupo seleccionado ya no está disponible.',
  SOLOG_GROUP_CHANGE_NOOP: 'No hay cambios respecto del estado actual.',
  SOLOG_GROUP_PRICE_CATALOG_MANAGED: 'El precio pertenece al catálogo del producto y no puede modificarse desde Grupos.',
  SOLOG_GROUP_PRICE_MISMATCH: 'El producto no puede agregarse a este grupo porque tiene un precio diferente.',
  SOLOG_INVALID_GROUP_VALUATION: 'Completa una valorización de grupo válida.',
  SOLOG_GROUP_VALUATION_NOOP: 'La valorización del grupo ya tiene esos valores.',
  SOLOG_GROUP_PROPOSAL_PREVIOUSLY_IGNORED: 'Esta propuesta exacta fue ignorada anteriormente. Modifica el cambio para continuar.',
  SOLOG_INVALID_PRODUCT_CLASSIFICATION: 'La clasificación seleccionada no es válida.',
  SOLOG_PRODUCT_NOT_FOUND: 'El producto seleccionado ya no está disponible.',
  SOLOG_GROUP_REQUIRED: 'Selecciona un grupo para la modalidad Agrupado.',
  SOLOG_INVALID_CATALOG_CHANGE_ID: 'No se pudo identificar el cambio de catálogo.',
  SOLOG_INVALID_CATALOG_CHANGE_ACTION: 'La acción seleccionada no es válida para este cambio.',
  SOLOG_CATALOG_CHANGE_NOT_APPROVED: 'El cambio ya no está aprobado. Actualiza la bandeja.',
  SOLOG_CATALOG_CHANGE_CONFLICT: 'El cambio entra en conflicto con la estructura futura del catálogo.',
  AUTH_REQUIRED: 'Inicia sesión para continuar con la publicación del catálogo.',
  AUTH_INVALID: 'La sesión no es válida. Inicia sesión nuevamente.',
  USER_DISABLED: 'Este usuario está deshabilitado.',
  ADMIN_REQUIRED: 'Solo un administrador puede publicar el catálogo.',
  NO_APPROVED_CATALOG_CHANGES:
    'No hay cambios aprobados pendientes de incorporación.',
  CATALOG_UPLOAD_FAILED:
    'No se pudo almacenar el archivo de la nueva versión. No se publicó ningún cambio.',
  CATALOG_COMMIT_FAILED:
    'No se pudo completar la publicación del catálogo.',
  INVALID_CATALOG_PREVIEW:
    'La propuesta de catálogo ya no es válida. Actualiza la información e inténtalo nuevamente.',
  GROUP_PRICE_MISMATCH: 'El producto y el grupo propuesto no tienen el mismo precio.',
  GROUP_CATEGORY_MISMATCH: 'El producto y el grupo propuesto no pertenecen a la misma categoría.',
  INVALID_GROUP_CARDINALITY: 'La composición futura del grupo no cumple la cardinalidad requerida.',
  INVALID_UNIQUE_GROUP: 'El grupo unitario propuesto no es válido.',
  PRODUCT_GROUP_NOT_FOUND: 'El grupo propuesto para el producto no está disponible.',
  PRODUCT_DELETE_CLASSIFICATION_CONFLICT: 'El producto no puede eliminarse y reclasificarse en la misma versión.',
  SKU_DELETE_CLASSIFICATION_CONFLICT: 'El producto no puede eliminarse y reclasificarse en la misma versión.',
  CATALOG_CHANGE_STALE: 'El cambio quedó obsoleto respecto del catálogo publicado actual.',
  STALE_PRODUCT_CHANGE: 'El cambio quedó obsoleto respecto del catálogo publicado actual.',
  GROUP_NOT_AVAILABLE: 'El grupo relacionado ya no estará disponible en la versión futura.',
  SOLOG_ACTIVE_COUNT_EXISTS: 'Ya existe un conteo activo en esta sede.',
  SOLOG_COUNT_NOT_AVAILABLE: 'Este conteo ya no está disponible.',
  SOLOG_COUNT_NOT_ACTIVE: 'La sesión de conteo ya no está activa.',
  SOLOG_COUNT_EXPIRED: 'La sesión de conteo venció. Inicia una nueva.',
  SOLOG_STOCK_EXPIRED:
    'El stock venció. Actualiza el inventario desde ConeXion para iniciar un nuevo conteo.',
  SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY:
    'El stock está próximo a vencer. Actualiza el inventario antes de iniciar un nuevo conteo.',
  SOLOG_STOCK_EXPIRED_AT_COUNT:
    'La captura ocurrió después del cierre de la sesión y no puede registrarse.',
  SOLOG_CONFIRMED_SNAPSHOT_REQUIRED:
    'Todavía no existe stock actualizado para esta sede.',
  SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE:
    'El snapshot de referencia de esta sesión ya no está disponible.',
  SOLOG_INVALID_BATCH_PAYLOAD: 'El lote de capturas no es válido.',
  SOLOG_BATCH_TOO_LARGE: 'El lote supera el máximo de 500 capturas.',
  SOLOG_INVALID_BATCH_ITEM: 'Una captura del lote no es válida.',
  SOLOG_INVALID_OBSERVATION_TYPE: 'El tipo de observación no es válido.',
  SOLOG_CLIENT_OBSERVATION_CONFLICT:
    'La observación local entra en conflicto con otra captura ya registrada.',
  SOLOG_INVALID_COUNT_TIMESTAMP:
    'La hora física de una captura no es válida.',
  SOLOG_DUPLICATE_GROUP_IN_BATCH:
    'El lote contiene el mismo grupo más de una vez.',
  SOLOG_GROUP_ALREADY_COVERED_PERIOD:
    'Uno de los grupos ya estaba cubierto en el período. Actualiza la vista antes de reintentar.',
  SOLOG_GROUP_ALREADY_COVERED: 'El grupo ya fue cubierto en este período.',
  SOLOG_GROUP_NOT_YET_COVERED: 'El grupo todavía requiere su observación base.',
  SOLOG_GROUP_NOT_REQUIRED: 'El grupo ya no requiere una nueva verificación.',
  SOLOG_PERIOD_COVERAGE_REQUIRED:
    'Completa primero la cobertura del período para usar esta vista.',
  SOLOG_GROUP_NOT_ALLOWED_IN_COUNT:
    'Este grupo no pertenece al conteo activo.',
  SOLOG_RECOUNT_ALREADY_SAVED:
    'El reconteo ya fue guardado. Actualiza Revisar para consultar su estado.',
  SOLOG_OPERATIONAL_PERIOD_NOT_STARTED:
    'El período operativo todavía no ha comenzado.',
  SOLOG_EXPIRED_SESSION_SUPERSEDED:
    'Otra sesión comenzó en esta sede. Se descartaron los pendientes anteriores y se actualizó el estado operativo.',
  SOLOG_INVALID_RECOUNT_PAYLOAD:
    'Los datos del reconteo no son válidos.',
  SOLOG_RECOUNT_NOT_AVAILABLE:
    'Este reconteo ya no está disponible.',
  SOLOG_RECOUNT_NOT_ELIGIBLE:
    'Este grupo ya no requiere un reconteo.',
  SOLOG_RECOUNT_ORIGIN_REQUIRED:
    'El reconteo no tiene una observación de origen válida.',
  SOLOG_RECOUNT_ORIGIN_STALE:
    'Existe una observación más reciente para este grupo.',
  SOLOG_RECOUNT_ALREADY_DONE:
    'Este grupo ya fue recontado.',
  SOLOG_STOCK_UPDATED_BEFORE_COUNT:
    'El stock TumiSoft cambió antes de realizar esta captura.',
  SOLOG_LATE_BATCH_WINDOW_EXPIRED:
    'Venció el plazo de recuperación para enviar este conteo.',
  SOLOG_INVALID_HISTORY_PERIOD: 'El período del historial no es válido.',
  SOLOG_INVALID_RECOUNT_GROUP:
    'El backend no devolvió el detalle original necesario para recontar este grupo.',
  SOLOG_CLIENT_NOT_CONFIGURED:
    'SOLOG todavía no tiene configurada la conexión con Supabase.',
  SOLOG_EMPTY_RESPONSE: 'El backend no devolvió una respuesta.',
  SOLOG_INVALID_CONTROL_EXPORT_RESPONSE:
    'El backend devolvió datos incompletos para generar el Excel.',
  SOLOG_INVALID_CONTRACT_RESPONSE:
    'El backend devolvió una respuesta incompatible con esta versión de SOLOG.',
}

const ERROR_CODE_PATTERN = /SOLOG_[A-Z0-9_]+/

function extractKnownErrorCode(value: string): SologErrorCode | null {
  const backendCode = value.match(ERROR_CODE_PATTERN)?.[0]
  if (backendCode) return backendCode as SologErrorCode

  return (
    SOLOG_CATALOG_FUNCTION_ERROR_CODES.find((code) => value.includes(code)) ??
    SOLOG_CATALOG_VALIDATION_ERROR_CODES.find((code) => value.includes(code)) ??
    null
  )
}

function getStringProperty(value: unknown, property: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const propertyValue = (value as Record<string, unknown>)[property]
  return typeof propertyValue === 'string' ? propertyValue : null
}

async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  if (!(error instanceof FunctionsHttpError)) return null
  const context = error.context
  if (!(context instanceof Response)) return null

  try {
    return await context.clone().json()
  } catch {
    return null
  }
}

export class SologApiError extends Error {
  readonly code: SologErrorCode
  readonly backendCode: string | null
  readonly details: string | null
  readonly hint: string | null
  readonly original: PostgrestError | null

  constructor(
    code: SologErrorCode,
    options: {
      backendCode?: string | null
      details?: string | null
      hint?: string | null
      original?: PostgrestError | null
    } = {},
  ) {
    super(ERROR_MESSAGES[code] ?? 'No se pudo completar la operación en SOLOG.')
    this.name = 'SologApiError'
    this.code = code
    this.backendCode = options.backendCode ?? null
    this.details = options.details ?? null
    this.hint = options.hint ?? null
    this.original = options.original ?? null
  }
}

export function getSologErrorMessage(code: SologErrorCode): string {
  return ERROR_MESSAGES[code] ?? 'No se pudo completar la operación en SOLOG.'
}

export function getSologErrorMessageFromUnknown(error: unknown): string {
  if (error instanceof SologApiError) return error.message
  if (error instanceof Error) return error.message
  return 'No se pudo completar la operación en SOLOG.'
}

export function isSologApiErrorCode(
  error: unknown,
  ...codes: SologErrorCode[]
): error is SologApiError {
  return error instanceof SologApiError && codes.includes(error.code)
}

export function normalizeSologError(error: PostgrestError): SologApiError {
  const diagnosticText = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
  const extractedCode = extractKnownErrorCode(diagnosticText)

  return new SologApiError(extractedCode ?? 'SOLOG_UNKNOWN_ERROR', {
    backendCode: error.code,
    details: error.details,
    hint: error.hint,
    original: error,
  })
}

export async function normalizeSologFunctionError(
  error: unknown,
): Promise<SologApiError> {
  const body = await readFunctionErrorBody(error)
  const bodyCode =
    getStringProperty(body, 'codigo') ??
    getStringProperty(body, 'code') ??
    getStringProperty(body, 'error')
  const errorMessage = error instanceof Error ? error.message : ''
  const extractedCode = extractKnownErrorCode(
    [bodyCode, errorMessage].filter(Boolean).join(' '),
  )

  return new SologApiError(extractedCode ?? 'SOLOG_FUNCTION_ERROR', {
    backendCode: bodyCode,
    details: getStringProperty(body, 'message'),
  })
}

export function createSologConfigurationError(): SologApiError {
  return new SologApiError('SOLOG_CLIENT_NOT_CONFIGURED')
}

export function createSologEmptyResponseError(): SologApiError {
  return new SologApiError('SOLOG_EMPTY_RESPONSE')
}
