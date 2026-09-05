import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError, SologApiError } from '../errors'
import type { CashierAction, CashierBootstrap, CashierMutation, CashierState } from './cajero.v2'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
  return value as Record<string, unknown>
}
function check(condition: unknown): asserts condition {
  if (!condition) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
}
function validateState(value: unknown, preSession = false) {
  const state = record(value)
  if (preSession) check(state.session === null)
  else {
    const session = record(state.session)
    check(typeof session.id === 'string' && typeof session.usuario_id === 'string' && typeof session.sede_id === 'string')
    check(Number.isFinite(Date.parse(String(session.expira_at))))
  }
  check(Array.isArray(state.groups) && Array.isArray(state.count_queue) && Array.isArray(state.review_queue))
  const ids = new Set<string>()
  for (const value of state.groups) {
    const group = record(value)
    check(typeof group.grupo_id === 'string' && typeof group.nombre === 'string' && typeof group.categoria_id === 'string' && typeof group.categoria === 'string')
    check(!ids.has(group.grupo_id))
    ids.add(group.grupo_id)
    check(typeof group.stock_teorico === 'number' && Number.isFinite(group.stock_teorico) && Array.isArray(group.productos))
    check(typeof group.cobertura_periodo === 'boolean' && typeof group.requiere_conteo === 'boolean' && typeof group.requiere_reconteo === 'boolean')
  }
  check(state.count_queue.every((id) => typeof id === 'string' && ids.has(id)))
  check(state.review_queue.every((item) => {
    const queueItem = record(item)
    return typeof queueItem.detalle_id === 'string' && ids.has(String(queueItem.grupo_id)) &&
      typeof queueItem.ultima_diferencia === 'number' && Number.isFinite(queueItem.ultima_diferencia) &&
      typeof queueItem.contado_at === 'string' && Number.isFinite(Date.parse(queueItem.contado_at))
  }))
  for (const name of ['groups_total', 'coverage_counted', 'coverage_percent', 'count_pending', 'review_pending']) {
    const n = record(state.kpis)[name]
    check(typeof n === 'number' && Number.isFinite(n) && n >= 0)
  }
}
function validateEnvelope(value: unknown) {
  const response = record(value)
  check(response.contract_version === 2 && typeof response.generated_at === 'string' && Number.isFinite(Date.parse(response.generated_at)))
  const revisions = record(response.revisions)
  check(['groups', 'devices', 'operational'].every((key) => Number.isSafeInteger(revisions[key]) && Number(revisions[key]) >= 0))
  return response
}
export function parseCashierBootstrap(value: unknown): CashierBootstrap {
  const response = validateEnvelope(value)
  const identity = record(response.identity)
  check(identity.rol === 'cajero' && typeof identity.id === 'string' && typeof identity.nombre === 'string')
  check(typeof record(response.site).id === 'string' && typeof record(response.site).nombre === 'string')
  check(typeof record(response.device).autorizado === 'boolean')
  check(typeof record(response.start_capability).allowed === 'boolean')
  check(typeof response.server_now === 'string' && Number.isFinite(Date.parse(response.server_now)))
  const panel = record(response.panel_state)
  check((panel.source === 'pre_session' && panel.frozen === false) || (panel.source === 'session' && panel.frozen === true))
  validateState(panel, panel.source === 'pre_session')
  check(Number.isSafeInteger(record(panel.basis).groups_revision))
  if (panel.source === 'session') {
    const session = record(panel.session)
    check(session.usuario_id === identity.id && session.sede_id === record(response.site).id)
  }
  return value as CashierBootstrap
}
export function parseCashierMutation(value: unknown, action: CashierAction): CashierMutation {
  const response = validateEnvelope(value)
  check(response.action === action && typeof response.replay === 'boolean')
  validateState(response.state)
  if (action === 'save_batch' || action === 'recount_save_batch') {
    check(Array.isArray(response.items) && Number.isSafeInteger(response.saved) && Number(response.saved) >= 0)
  }
  if (action === 'recount_save_batch') {
    for (const value of response.items as unknown[]) {
      const item = record(value)
      check(typeof item.detalle_id === 'string' && typeof item.grupo_id === 'string' && typeof item.snapshot_reconteo_id === 'string')
      for (const key of ['stock_teorico_reconteo', 'stock_reconteo', 'diferencia_reconteo', 'diferencia', 'valor_diferencia']) {
        check(typeof item[key] === 'number' && Number.isFinite(item[key]))
      }
      check(['Coincide', 'Confirmada', 'Inconsistente'].includes(String(item.estado_diferencia)))
      check(typeof item.recontado_at === 'string' && Number.isFinite(Date.parse(item.recontado_at)))
    }
  }
  return value as CashierMutation
}
async function rpc(name: string, args: object) {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw normalizeSologError(error)
  return data as unknown
}
export async function fetchCashierBootstrap(deviceToken?: string) {
  return parseCashierBootstrap(await rpc('rpc_solog_cashier_bootstrap_v2', { p_payload: deviceToken ? { device_token: deviceToken } : {} }))
}
export async function mutateCashier(action: CashierAction, payload: Record<string, unknown>) {
  return parseCashierMutation(await rpc('rpc_solog_cashier_mutate_v2', { p_action: action, p_payload: payload }), action)
}
export function panelFromState(state: CashierState) {
  const { snapshot_referencia_id, version_catalogo, groups_revision, periodo_desde, periodo_hasta } = state.session
  return { ...state, source: 'session' as const, frozen: true as const, basis: { snapshot_referencia_id, version_catalogo, groups_revision, periodo_desde, periodo_hasta } }
}
