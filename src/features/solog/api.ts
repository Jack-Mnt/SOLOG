import { supabase } from '../../lib/supabase'
import {
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
  SologAdminReportPayload,
  SologAdminReportResponse,
  SologDashboardResponse,
  SologAuthorizeDeviceResponse,
  SologCatalogChangeActionPayload,
  SologCatalogChangeActionResponse,
  SologCatalogChangesFilters,
  SologCatalogChangesResponse,
  SologCatalogReference,
  SologCountBatchPayload,
  SologCountBatchResponse,
  SologCountFinishPayload,
  SologCountFinishResponse,
  SologCountStartPayload,
  SologCountStartResponse,
  SologGroupsPayload,
  SologGroupsResponse,
  SologOperationalBootstrap,
  CatalogPublicationPreview,
  PublishCatalogResponse,
  SologRecountPayload,
  SologRecountResponse,
  SologRevokeDeviceResponse,
} from './types'

type SologRpcName = 'rpc_solog_state' | 'rpc_solog_count' | 'rpc_solog_admin'

function getClient() {
  if (!supabase) throw createSologConfigurationError()
  return supabase
}

async function callSologRpc<T>(rpcName: SologRpcName, action: string, payload: object): Promise<T> {
  const { data, error } = await getClient().rpc(rpcName, {
    p_action: action,
    p_payload: payload,
  })

  if (error) throw normalizeSologError(error)
  if (data === null) throw createSologEmptyResponseError()
  return data as T
}

export function getSologBootstrap(deviceToken?: string) {
  return callSologRpc<SologOperationalBootstrap>(
    'rpc_solog_state',
    'bootstrap',
    deviceToken ? { device_token: deviceToken } : {},
  )
}

export function getSologGroups(input: SologGroupsPayload) {
  return callSologRpc<SologGroupsResponse>('rpc_solog_state', 'groups', input)
}

export function startCount(input: SologCountStartPayload) {
  return callSologRpc<SologCountStartResponse>('rpc_solog_count', 'start', input)
}

export function saveCountBatch(input: SologCountBatchPayload) {
  return callSologRpc<SologCountBatchResponse>('rpc_solog_count', 'save_batch', input)
}

export function finishCount(input: SologCountFinishPayload) {
  return callSologRpc<SologCountFinishResponse>('rpc_solog_count', 'finish', input)
}

export function recountSologGroup(input: SologRecountPayload) {
  return callSologRpc<SologRecountResponse>('rpc_solog_count', 'recount', input)
}

export function getSologAdminBootstrap() {
  return callSologRpc<SologAdminBootstrap>('rpc_solog_admin', 'bootstrap', {})
}

export async function getSologDashboard(): Promise<SologDashboardResponse> {
  const { data, error } = await getClient().rpc('rpc_solog_dashboard')

  if (error) throw normalizeSologError(error)
  if (data === null) throw createSologEmptyResponseError()
  return data as SologDashboardResponse
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

export function getSologAdminReport(input: SologAdminReportPayload) {
  return callSologRpc<SologAdminReportResponse>('rpc_solog_admin', 'report', input)
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

export function getCatalogChanges(filters: SologCatalogChangesFilters = {}) {
  return callSologRpc<SologCatalogChangesResponse>(
    'rpc_solog_admin',
    'catalog_changes',
    filters,
  )
}

export function applyCatalogDecision(input: SologCatalogChangeActionPayload) {
  return callSologRpc<SologCatalogChangeActionResponse>(
    'rpc_solog_admin',
    'catalog_change_action',
    input,
  )
}

export function getCatalogPublicationPreview() {
  return callSologRpc<CatalogPublicationPreview>(
    'rpc_solog_admin',
    'catalog_publication_preview',
    {},
  )
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
