import { SologApiError, getSologErrorMessageFromUnknown } from '../errors'

export type CashierV4ErrorOutcome = 'known_rejection' | 'uncertain' | 'in_progress' | 'conflict'

export interface CashierV4ErrorPolicy {
  code: string | null
  message: string
  outcome: CashierV4ErrorOutcome
  retryable: boolean
  requiresRefresh: boolean
  sessionInvalid: boolean
  userFeedback: boolean
  // No policy may replace an uncertain/conflicting operation with a new UUID.
  regenerateOperationId: false
}

const policies: Record<string, { message: string; retryable?: boolean; requiresRefresh?: boolean; sessionInvalid?: boolean }> = {
  SOLOG_DEVICE_UNAUTHORIZED: { message: 'Esta tablet no está autorizada. Actualiza el panel.', requiresRefresh: true, sessionInvalid: true },
  SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE: { message: 'El inventario recibido está incompleto. Se necesita una actualización completa del inventario.', requiresRefresh: true },
  SOLOG_SESSION_DELIVERY_NOT_ALLOWED: { message: 'Esta sesión ya no permite registrar conteos pendientes.', requiresRefresh: true, sessionInvalid: true },
  SOLOG_SESSION_PRIORITY_CONFLICT: { message: 'Cambió la prioridad de trabajo. Actualiza el panel.', requiresRefresh: true },
  SOLOG_GROUP_ALREADY_COUNTED: { message: 'Este grupo ya fue contado. Actualiza el panel.', requiresRefresh: true },
  SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT: { message: 'Este grupo ya tiene un conteo normal en este turno.', requiresRefresh: true },
  SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT: { message: 'Este caso requiere un nuevo reconteo físico.' },
  SOLOG_IDEMPOTENCY_CONFLICT: { message: 'La operación ya existe con información distinta. No se puede continuar automáticamente.' },
  SOLOG_OPERATION_IN_PROGRESS: { message: 'La operación sigue en curso. Puedes reintentar la misma operación.', retryable: true },
  SOLOG_SESSION_CONFLICT: { message: 'Ya existe una sesión activa. Actualiza el panel.', requiresRefresh: true },
  SOLOG_STOCK_EXPIRED: { message: 'El inventario está desactualizado. Se necesita una nueva actualización.', requiresRefresh: true },
  SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY: { message: 'El inventario está próximo a quedar desactualizado. Se necesita una nueva actualización.', requiresRefresh: true },
  SOLOG_SESSION_WINDOW_CLOSED: { message: 'La ventana de inicio está cerrada. Actualiza el panel.', requiresRefresh: true },
  SOLOG_GROUPS_REVISION_CONFLICT: { message: 'La lista de grupos cambió. Actualiza el panel y conserva los pendientes de esta sesión.', requiresRefresh: true },
  SOLOG_SESSION_NOT_FOUND: { message: 'Esta sesión ya no está disponible.', requiresRefresh: true, sessionInvalid: true },
  SOLOG_INVALID_SESSION: { message: 'Esta sesión no es válida.', requiresRefresh: true, sessionInvalid: true },
  SOLOG_SESSION_REVISION_CONFLICT: { message: 'La sesión no corresponde a la revisión requerida. Actualiza el panel.', requiresRefresh: true, sessionInvalid: true },
  SOLOG_AUTH_REQUIRED: { message: 'Inicia sesión nuevamente.', sessionInvalid: true },
  SOLOG_USER_DISABLED: { message: 'Este usuario está deshabilitado.', sessionInvalid: true },
  SOLOG_ROLE_NOT_ALLOWED: { message: 'Tu rol no permite esta operación.', sessionInvalid: true },
}

// Scoped to Cajero V4: shared Admin/V3 messages and behavior remain untouched.
export function getCashierV4ErrorPolicy(error: unknown): CashierV4ErrorPolicy {
  const code = error instanceof SologApiError ? error.code : null
  const policy = code ? policies[code] : undefined
  const clientUncertain = code === 'SOLOG_INVALID_CONTRACT_RESPONSE' || code === 'SOLOG_EMPTY_RESPONSE' ||
    code === 'SOLOG_UNKNOWN_ERROR' || code === 'SOLOG_CLIENT_NOT_CONFIGURED'
  const outcome: CashierV4ErrorOutcome = code === 'SOLOG_IDEMPOTENCY_CONFLICT' ? 'conflict'
    : code === 'SOLOG_OPERATION_IN_PROGRESS' ? 'in_progress'
    : error instanceof SologApiError && !clientUncertain ? 'known_rejection'
    : 'uncertain'
  return {
    code, message: policy?.message ?? getSologErrorMessageFromUnknown(error), outcome,
    retryable: policy?.retryable ?? false, requiresRefresh: policy?.requiresRefresh ?? false,
    sessionInvalid: policy?.sessionInvalid ?? false, userFeedback: true, regenerateOperationId: false,
  }
}
