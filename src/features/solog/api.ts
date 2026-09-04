import { supabase } from '../../lib/supabase'
import {
  SologApiError,
  createSologConfigurationError,
  createSologEmptyResponseError,
  normalizeSologError,
} from './errors'
import type { SologOperationalBootstrap, SologRouteResponse, SologRole } from './types'

type SologRpcName =
  | 'rpc_solog_state'
type SologPayloadRpcName =
  | 'rpc_solog_route_v2'

function getClient() {
  if (!supabase) throw createSologConfigurationError()
  return supabase
}

export async function callSologRpc<T>(rpcName: SologRpcName, action: string, payload: object): Promise<T> {
  const { data, error } = await getClient().rpc(rpcName, {
    p_action: action,
    p_payload: payload,
  })

  if (error) throw normalizeSologError(error)
  if (data === null) throw createSologEmptyResponseError()
  return data as T
}

async function callSologPayloadRpc<T>(
  rpcName: SologPayloadRpcName,
  payload: object,
): Promise<T> {
  const { data, error } = await getClient().rpc(rpcName, { p_payload: payload })

  if (error) throw normalizeSologError(error)
  if (data === null) throw createSologEmptyResponseError()
  return data as T
}

let pendingRouteRequest: Promise<SologRouteResponse> | null = null

function isSologRole(value: unknown): value is SologRole {
  return value === 'cajero' || value === 'moderador' || value === 'admin'
}

function parseSologRouteResponse(value: unknown): SologRouteResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
  }

  const response = value as Record<string, unknown>
  const identity =
    typeof response.identity === 'object' &&
    response.identity !== null &&
    !Array.isArray(response.identity)
      ? (response.identity as Record<string, unknown>)
      : null
  const role = identity?.rol
  const route = response.route
  const expectedRoute =
    role === 'cajero'
      ? '/cajero'
      : role === 'moderador' || role === 'admin'
        ? '/admin'
        : null

  if (
    response.contract_version !== 2 ||
    typeof response.generated_at !== 'string' ||
    !identity ||
    typeof identity.id !== 'string' ||
    typeof identity.nombre !== 'string' ||
    !isSologRole(role) ||
    route !== expectedRoute
  ) {
    throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
  }

  return value as SologRouteResponse
}

export function getSologRoute(): Promise<SologRouteResponse> {
  if (pendingRouteRequest) return pendingRouteRequest

  const request = callSologPayloadRpc<unknown>('rpc_solog_route_v2', {}).then(
    parseSologRouteResponse,
  )
  pendingRouteRequest = request

  const clearPendingRequest = () => {
    if (pendingRouteRequest === request) pendingRouteRequest = null
  }
  void request.then(clearPendingRequest, clearPendingRequest)

  return request
}

export function getSologBootstrap(deviceToken?: string) {
  return callSologRpc<SologOperationalBootstrap>(
    'rpc_solog_state',
    'bootstrap',
    deviceToken ? { device_token: deviceToken } : {},
  )
}
