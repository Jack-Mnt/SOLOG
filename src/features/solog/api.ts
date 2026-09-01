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
  SologDashboardResponse,
  SologDashboardSiteActivityResponse,
  SologDetailsExportResponse,
  SologDetailsHistoryPeriod,
  SologDetailsHistoryResponse,
  SologDetailsRequestAccessResponse,
  SologDetailsSummaryResponse,
  SologAuthorizeDeviceResponse,
  SologCatalogChangeActionPayload,
  SologCatalogChangeActionResponse,
  SologCatalogChangesFilters,
  SologCatalogChangesResponse,
  SologCatalogReference,
  SologCatalogStatus,
  SologControlDetailPayload,
  SologControlDetailResponse,
  SologControlExportPayload,
  SologControlExportResponse,
  SologControlPayload,
  SologControlResponse,
  SologAdminGroupsFilters,
  SologAdminGroupsResponse,
  SologGroupProductsFilters,
  SologGroupProductsResponse,
  SologGroupChangePayload,
  SologGroupChangeResponse,
  SologGroupValuationSavePayload,
  SologGroupValuationSaveResponse,
  SologOperationalBootstrap,
  CatalogPublicationPreview,
  PublishCatalogResponse,
  SologRevokeDeviceResponse,
} from './types'

type SologRpcName =
  | 'rpc_solog_state'
  | 'rpc_solog_count'
  | 'rpc_solog_admin'
  | 'rpc_solog_catalog'
  | 'rpc_solog_details'
type SologPayloadRpcName =
  | 'rpc_solog_control'
  | 'rpc_solog_control_detalle'
  | 'rpc_solog_control_export'

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

export function getSologBootstrap(deviceToken?: string) {
  return callSologRpc<SologOperationalBootstrap>(
    'rpc_solog_state',
    'bootstrap',
    deviceToken ? { device_token: deviceToken } : {},
  )
}

export function getSologDetailsSummary(deviceToken?: string) {
  return callSologRpc<SologDetailsSummaryResponse>(
    'rpc_solog_details',
    'summary',
    deviceToken ? { device_token: deviceToken } : {},
  )
}

export function getSologDetailsHistory(periodo: SologDetailsHistoryPeriod) {
  return callSologRpc<SologDetailsHistoryResponse>(
    'rpc_solog_details',
    'history',
    { periodo },
  )
}

export function getSologDetailsExport() {
  return callSologRpc<SologDetailsExportResponse>(
    'rpc_solog_details',
    'export',
    {},
  )
}

export function requestSologDetailsAccess(deviceToken: string) {
  return callSologRpc<SologDetailsRequestAccessResponse>(
    'rpc_solog_details',
    'request_access',
    { device_token: deviceToken },
  )
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

export async function getSologDashboardSiteActivity(
  sedeId: string,
  limit = 20,
): Promise<SologDashboardSiteActivityResponse> {
  const { data, error } = await getClient().rpc(
    'rpc_solog_dashboard_site_activity',
    {
      p_sede_id: sedeId,
      p_limit: limit,
    },
  )

  if (error) throw normalizeSologError(error)
  if (data === null) throw createSologEmptyResponseError()
  return data as SologDashboardSiteActivityResponse
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

export function getSologControl(input: SologControlPayload) {
  return callSologPayloadRpc<SologControlResponse>('rpc_solog_control', input)
}

export function getSologControlDetail(input: SologControlDetailPayload) {
  return callSologPayloadRpc<SologControlDetailResponse>(
    'rpc_solog_control_detalle',
    input,
  )
}

export function getSologControlExport(input: SologControlExportPayload) {
  return callSologPayloadRpc<SologControlExportResponse>(
    'rpc_solog_control_export',
    input,
  )
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
