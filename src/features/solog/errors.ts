import type { PostgrestError } from '@supabase/supabase-js'

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
  'SOLOG_ADMIN_ROLE_REQUIRED',
  'SOLOG_CATEGORY_REQUIRED',
  'SOLOG_CATEGORY_NOT_AVAILABLE',
  'SOLOG_ACTIVE_COUNT_EXISTS',
  'SOLOG_CONFIRMED_SNAPSHOT_REQUIRED',
  'SOLOG_COUNT_NOT_AVAILABLE',
  'SOLOG_COUNT_NOT_ACTIVE',
  'SOLOG_COUNT_EXPIRED',
  'SOLOG_SNAPSHOT_EXPIRED',
  'SOLOG_SNAPSHOT_EXPIRING',
  'SOLOG_ACTIVE_COUNT_REQUIRED',
  'SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE',
  'SOLOG_INVALID_COUNT_PAYLOAD',
  'SOLOG_INVALID_BATCH_PAYLOAD',
  'SOLOG_BATCH_TOO_LARGE',
  'SOLOG_INVALID_BATCH_ITEM',
  'SOLOG_INVALID_COUNT_TIMESTAMP',
  'SOLOG_DUPLICATE_GROUP_IN_BATCH',
  'SOLOG_GROUP_ALREADY_COVERED_QUINCENA',
  'SOLOG_QUINCENAL_COVERAGE_REQUIRED',
  'SOLOG_GROUP_NOT_AVAILABLE',
  'SOLOG_GROUP_NOT_IN_CATALOG',
  'SOLOG_GROUP_NOT_ALLOWED_IN_COUNT',
  'SOLOG_USE_RECOUNT_ACTION',
  'SOLOG_VIEW_REQUIRED',
  'SOLOG_INVALID_RECOUNT_PAYLOAD',
  'SOLOG_RECOUNT_NOT_AVAILABLE',
  'SOLOG_RECOUNT_NOT_ELIGIBLE',
  'SOLOG_RECOUNT_ALREADY_DONE',
  'SOLOG_REPORT_TYPE_REQUIRED',
  'SOLOG_INVALID_REPORT_FILTER',
  'SOLOG_INVALID_DATE_RANGE',
  'SOLOG_INVALID_REPORT_TYPE',
] as const

export type SologBackendErrorCode =
  (typeof SOLOG_BACKEND_ERROR_CODES)[number]

export type SologErrorCode =
  | SologBackendErrorCode
  | `SOLOG_${string}`

const ERROR_MESSAGES: Partial<Record<SologErrorCode, string>> = {
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
  SOLOG_ADMIN_ROLE_REQUIRED:
    'Tu usuario ya no tiene permisos para administrar SOLOG.',
  SOLOG_REPORT_TYPE_REQUIRED: 'Selecciona un reporte para continuar.',
  SOLOG_INVALID_REPORT_FILTER:
    'Uno o más filtros del reporte no son válidos.',
  SOLOG_INVALID_DATE_RANGE:
    'El rango de fechas no es válido. Revisa Desde y Hasta.',
  SOLOG_INVALID_REPORT_TYPE: 'El reporte seleccionado no está disponible.',
  SOLOG_ACTIVE_COUNT_EXISTS: 'Ya existe un conteo activo en esta sede.',
  SOLOG_COUNT_NOT_AVAILABLE: 'Este conteo ya no está disponible.',
  SOLOG_COUNT_NOT_ACTIVE: 'La sesión de conteo ya no está activa.',
  SOLOG_COUNT_EXPIRED: 'La sesión de conteo venció. Inicia una nueva.',
  SOLOG_SNAPSHOT_EXPIRED:
    'El inventario de referencia venció. Se requiere un Excel actualizado.',
  SOLOG_SNAPSHOT_EXPIRING:
    'El inventario está por vencer y ya no permite iniciar una sesión nueva.',
  SOLOG_CONFIRMED_SNAPSHOT_REQUIRED:
    'Todavía no existe stock actualizado para esta sede.',
  SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE:
    'El snapshot de referencia de esta sesión ya no está disponible.',
  SOLOG_INVALID_BATCH_PAYLOAD: 'El lote de capturas no es válido.',
  SOLOG_BATCH_TOO_LARGE: 'El lote supera el máximo de 500 capturas.',
  SOLOG_INVALID_BATCH_ITEM: 'Una captura del lote no es válida.',
  SOLOG_INVALID_COUNT_TIMESTAMP:
    'La hora física de una captura no es válida.',
  SOLOG_DUPLICATE_GROUP_IN_BATCH:
    'El lote contiene el mismo grupo más de una vez.',
  SOLOG_GROUP_ALREADY_COVERED_QUINCENA:
    'Uno de los grupos ya estaba cubierto en la quincena. Actualiza la vista antes de reintentar.',
  SOLOG_QUINCENAL_COVERAGE_REQUIRED:
    'Completa primero la cobertura quincenal para usar esta vista.',
  SOLOG_GROUP_NOT_ALLOWED_IN_COUNT:
    'Este grupo no pertenece al conteo activo.',
  SOLOG_INVALID_RECOUNT_PAYLOAD:
    'Los datos del reconteo no son válidos.',
  SOLOG_RECOUNT_NOT_AVAILABLE:
    'Este reconteo ya no está disponible.',
  SOLOG_RECOUNT_NOT_ELIGIBLE:
    'Este grupo ya no requiere conteo detallado.',
  SOLOG_RECOUNT_ALREADY_DONE:
    'Este grupo ya fue recontado.',
  SOLOG_INVALID_RECOUNT_GROUP:
    'El backend no devolvió el detalle original necesario para recontar este grupo.',
  SOLOG_CLIENT_NOT_CONFIGURED:
    'SOLOG todavía no tiene configurada la conexión con Supabase.',
  SOLOG_EMPTY_RESPONSE: 'El backend no devolvió una respuesta.',
}

const ERROR_CODE_PATTERN = /SOLOG_[A-Z0-9_]+/

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
  const extractedCode = diagnosticText.match(ERROR_CODE_PATTERN)?.[0] as
    | SologErrorCode
    | undefined

  return new SologApiError(extractedCode ?? 'SOLOG_UNKNOWN_ERROR', {
    backendCode: error.code,
    details: error.details,
    hint: error.hint,
    original: error,
  })
}

export function createSologConfigurationError(): SologApiError {
  return new SologApiError('SOLOG_CLIENT_NOT_CONFIGURED')
}

export function createSologEmptyResponseError(): SologApiError {
  return new SologApiError('SOLOG_EMPTY_RESPONSE')
}
