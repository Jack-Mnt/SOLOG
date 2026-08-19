import { supabase } from '../../lib/supabase'
import {
  createSologConfigurationError,
  createSologEmptyResponseError,
  normalizeSologError,
} from './errors'
import type {
  SologAdminBootstrap,
  SologAuthorizeDeviceResponse,
  SologCountFinishPayload,
  SologCountFinishResponse,
  SologCountSavePayload,
  SologCountSaveResponse,
  SologCountStartPayload,
  SologCountStartResponse,
  SologGroupView,
  SologGroupsResponse,
  SologOperationalBootstrap,
  SologRecountPayload,
  SologRecountResponse,
  SologAdminReportPayload,
  SologAdminReportResponse,
  SologRevokeDeviceResponse,
} from './types'

type SologRpcName =
  | 'rpc_solog_state'
  | 'rpc_solog_count'
  | 'rpc_solog_admin'

function getClient() {
  if (!supabase) throw createSologConfigurationError()
  return supabase
}

async function callSologRpc<T>(
  rpcName: SologRpcName,
  action: string,
  payload: object,
): Promise<T> {
  const { data, error } = await getClient().rpc(rpcName, {
    p_action: action,
    p_payload: payload,
  })

  if (error) throw normalizeSologError(error)
  if (data === null) throw createSologEmptyResponseError()

  const contractData: unknown = data
  return contractData as T
}

export function getSologBootstrap(
  deviceToken?: string,
): Promise<SologOperationalBootstrap> {
  return callSologRpc(
    'rpc_solog_state',
    'bootstrap',
    deviceToken ? { device_token: deviceToken } : {},
  )
}

export function getSologGroups(input: {
  device_token: string
  vista: SologGroupView
}): Promise<SologGroupsResponse> {
  return callSologRpc('rpc_solog_state', 'groups', input)
}

export function startCount(
  input: SologCountStartPayload,
): Promise<SologCountStartResponse> {
  return callSologRpc('rpc_solog_count', 'start', input)
}

export function saveGroupCount(
  input: SologCountSavePayload,
): Promise<SologCountSaveResponse> {
  return callSologRpc('rpc_solog_count', 'save', input)
}

export function finishCount(
  input: SologCountFinishPayload,
): Promise<SologCountFinishResponse> {
  return callSologRpc('rpc_solog_count', 'finish', input)
}

export function recountSologGroup(
  input: SologRecountPayload,
): Promise<SologRecountResponse> {
  return callSologRpc('rpc_solog_count', 'recount', input)
}

export function getSologAdminBootstrap(): Promise<SologAdminBootstrap> {
  return callSologRpc('rpc_solog_admin', 'bootstrap', {})
}

export function authorizeSologDevice(
  deviceId: string,
): Promise<SologAuthorizeDeviceResponse> {
  return callSologRpc('rpc_solog_admin', 'authorize_device', {
    device_id: deviceId,
  })
}

export function revokeSologDevice(
  deviceId: string,
): Promise<SologRevokeDeviceResponse> {
  return callSologRpc('rpc_solog_admin', 'revoke_device', {
    device_id: deviceId,
  })
}

export function getSologAdminReport(
  input: SologAdminReportPayload,
): Promise<SologAdminReportResponse> {
  return callSologRpc('rpc_solog_admin', 'report', input)
}
