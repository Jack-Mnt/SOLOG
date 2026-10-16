import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../../errors'
import { validateMetricsPayload, validateMetricsResponse } from './admin.dashboard.metrics.contract'
import type { MetricsAction, MetricsPayloads, MetricsResponses } from './admin.dashboard.metrics.types'

// No usa adminRpc() ni el Envelope V2 del resto del Admin.
const ERROR_MESSAGES: Record<string, string> = {
  SOLOG_AUTH_REQUIRED: 'Tu sesión no está disponible. Inicia sesión nuevamente.',
  SOLOG_USER_DISABLED: 'Tu usuario está deshabilitado.',
  SOLOG_ADMIN_ROLE_REQUIRED: 'No tienes permisos para consultar el Dashboard.',
  SOLOG_INVALID_SITE: 'La sede seleccionada no es válida.',
  SOLOG_SITE_FORBIDDEN: 'La sede seleccionada ya no está disponible.',
  SOLOG_INVALID_PAYLOAD: 'La consulta contiene parámetros incompatibles.',
  SOLOG_INVALID_ACTION: 'La vista solicitada no está disponible.',
  SOLOG_METRICS_INVALID_DATE: 'La fecha consultada no es válida.',
  SOLOG_METRICS_INVALID_RANGE: 'El período solicitado es demasiado extenso.',
  SOLOG_METRICS_INVALID_LIMIT: 'La cantidad de filas solicitada no es válida.',
  SOLOG_METRICS_INVALID_SORT: 'La ordenación solicitada no está disponible.',
  SOLOG_METRICS_INVALID_CURSOR: 'La página venció o cambió de contexto. Vuelve a la primera página.',
}
export const dashboardMetricsAuthErrors = new Set([
  'SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED', 'SOLOG_SITE_FORBIDDEN',
])

export class DashboardMetricsRpcError extends Error {
  constructor(readonly code: string, message: string, readonly causeCode?: string) {
    super(message)
    this.name = 'DashboardMetricsRpcError'
  }
}

function normalizedDashboardError(error: PostgrestError): Error {
  const backend = normalizeSologError(error)
  const code = [error.message, error.details, error.hint]
    .filter(Boolean).join(' ').match(/SOLOG_[A-Z0-9_]+/)?.[0] ?? backend.code
  return new DashboardMetricsRpcError(
    code,
    ERROR_MESSAGES[code] ?? backend.message,
    error.code,
  )
}

/** Única puerta remota del Dashboard: contrato administrado V1, separado del Admin V2. */
export async function dashboardMetricsRpc<A extends MetricsAction>(
  action: A,
  payload: MetricsPayloads[A],
): Promise<MetricsResponses[A]> {
  validateMetricsPayload(action, payload)
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('metrics_dashboard_v1', {
    p_action: action,
    p_payload: payload,
  })
  if (error) throw normalizedDashboardError(error)
  return validateMetricsResponse(action, payload, data)
}
