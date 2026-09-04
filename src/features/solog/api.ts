import { supabase } from '../../lib/supabase'
import {
  SologApiError,
  createSologConfigurationError,
  createSologEmptyResponseError,
  normalizeSologError,
  normalizeSologFunctionError,
} from './errors'
import type {
  SologAdminBootstrap,
  SologAdminIncidentActionPayload,
  SologAdminIncidentActionResponse,
  SologAdminIncidentsFilters,
  SologAdminIncidentsResponse,
  SologAuthorizeDeviceResponse,
  SologCatalogChangeActionPayload,
  SologCatalogChangeActionResponse,
  SologCatalogChangesFilters,
  SologCatalogChangesResponse,
  SologCatalogReference,
  SologCatalogStatus,
  SologAdminGroupsFilters,
  SologAdminGroupsResponse,
  SologGroupProductsFilters,
  SologGroupProductsResponse,
  SologGroupChangePayload,
  SologGroupChangeResponse,
  SologGroupValuationSavePayload,
  SologGroupValuationSaveResponse,
  SologOperationalBootstrap,
  SologRouteResponse,
  SologRole,
  CatalogPublicationPreview,
  PublishCatalogResponse,
  SologRevokeDeviceResponse,
} from './types'

type SologRpcName =
  | 'rpc_solog_state'
  | 'rpc_solog_count'
  | 'rpc_solog_admin'
  | 'rpc_solog_catalog'
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

export function getSologAdminBootstrap() {
  return callSologRpc<SologAdminBootstrap>('rpc_solog_admin', 'bootstrap', {})
}

export function authorizeSologDevice(deviceId: string) {
  return callSologRpc<SologAuthorizeDeviceResponse>('rpc_solog_admin', 'authorize_device', {
    device_id: deviceId,
  })
}

export function revokeSologDevice(deviceId: string) {
  return callSologRpc<SologRevokeDeviceResponse>('rpc_solog_admin', 'revoke_device', {
    device_id: deviceId,
  })
}

export function getAdminIncidents(filters: SologAdminIncidentsFilters = {}) {
  return callSologRpc<SologAdminIncidentsResponse>(
    'rpc_solog_admin',
    'incidents',
    filters,
  )
}

export function applyAdminIncidentDecision(
  input: SologAdminIncidentActionPayload,
) {
  return callSologRpc<SologAdminIncidentActionResponse>(
    'rpc_solog_admin',
    'incident_action',
    input,
  )
}

export function getCatalogReference() {
  return callSologRpc<SologCatalogReference>(
    'rpc_solog_admin',
    'catalog_reference',
    {},
  )
}

export function getSologCatalogReference() {
  return callSologRpc<SologCatalogReference>(
    'rpc_solog_catalog',
    'reference',
    {},
  )
}

export function getSologCatalogStatus() {
  return callSologRpc<SologCatalogStatus>('rpc_solog_catalog', 'status', {})
}

export function getCatalogChanges(filters: SologCatalogChangesFilters = {}) {
  return callSologRpc<SologCatalogChangesResponse>(
    'rpc_solog_admin',
    'catalog_changes',
    filters,
  )
}

export function applyCatalogDecision(input: SologCatalogChangeActionPayload) {
  const payload = {
    propuesta_fingerprint: input.propuesta_fingerprint,
    action: input.decision,
    ...('config' in input && input.config ? input.config : {}),
  }
  return callSologRpc<SologCatalogChangeActionResponse>(
    'rpc_solog_admin',
    'catalog_change_action',
    payload,
  )
}

export function getCatalogPublicationPreview() {
  return callSologRpc<CatalogPublicationPreview>(
    'rpc_solog_admin',
    'catalog_publication_preview',
    {},
  )
}

export function getAdminGroups(filters: SologAdminGroupsFilters = {}) {
  return callSologRpc<SologAdminGroupsResponse>('rpc_solog_admin', 'groups', filters)
}

export function getAdminGroupProducts(filters: SologGroupProductsFilters = {}) {
  return callSologRpc<SologGroupProductsResponse>('rpc_solog_admin', 'group_products', filters)
}

export function saveAdminGroupChange(input: SologGroupChangePayload) {
  return callSologRpc<SologGroupChangeResponse>('rpc_solog_admin', 'group_change_save', input)
}

export function saveAdminGroupValuation(input: SologGroupValuationSavePayload) {
  return callSologRpc<SologGroupValuationSaveResponse>('rpc_solog_admin', 'group_valuation_save', input)
}

export async function publishCatalog(): Promise<PublishCatalogResponse> {
  const { data, error } = await getClient().functions.invoke<PublishCatalogResponse>(
    'conexion-admin',
    { body: { action: 'publish_catalog' } },
  )

  if (error) throw await normalizeSologFunctionError(error)
  if (data === null) throw createSologEmptyResponseError()
  return data
}
