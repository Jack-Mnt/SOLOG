import { callSologRpc } from '../api'
import type {
  CajeroBatchPayload,
  CajeroBatchResponse,
  CajeroFinishPayload,
  CajeroFinishResponse,
  CajeroGroupsPayload,
  CajeroGroupsResponse,
  CajeroHistoryPayload,
  CajeroHistoryResponse,
  CajeroStartPayload,
  CajeroStartResponse,
} from './cajero.types'

export function getCajeroGroups(input: CajeroGroupsPayload) {
  return callSologRpc<CajeroGroupsResponse>('rpc_solog_state', 'groups', input)
}

export function startCajeroSession(input: CajeroStartPayload) {
  return callSologRpc<CajeroStartResponse>('rpc_solog_count', 'start', input)
}

export function saveCajeroBatch(input: CajeroBatchPayload) {
  return callSologRpc<CajeroBatchResponse>('rpc_solog_count', 'save_batch', input)
}

export function finishCajeroSession(input: CajeroFinishPayload) {
  return callSologRpc<CajeroFinishResponse>('rpc_solog_count', 'finish', input)
}

export function getCajeroHistory(input: CajeroHistoryPayload) {
  return callSologRpc<CajeroHistoryResponse>('rpc_solog_count', 'history', input)
}
