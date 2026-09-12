import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError, SologApiError } from '../errors'
import type {
  CashierV3Action, CashierV3Bootstrap, CashierV3GroupPatch, CashierV3Kpis,
  CashierV3MutationResultFor, CashierV3Panel, CashierV3PanelDelta,
  CashierV3Revisions, CashierV3SessionCapability, CashierV3Stock,
} from './cajero.v3'

function invalid(): never { throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE') }
function check(condition: unknown): asserts condition { if (!condition) invalid() }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function timestamp(value: unknown, nullable = false) {
  check((nullable && value === null) || (typeof value === 'string' && Number.isFinite(Date.parse(value))))
}
function nullableString(value: unknown) { check(value === null || typeof value === 'string') }
function finite(value: unknown) { check(typeof value === 'number' && Number.isFinite(value)) }
function nonNegativeInteger(value: unknown) { check(Number.isSafeInteger(value) && Number(value) >= 0) }

function validateRevisions(value: unknown): CashierV3Revisions {
  const revisions = record(value)
  for (const key of ['groups', 'devices', 'operational']) nonNegativeInteger(revisions[key])
  return value as CashierV3Revisions
}
function validateStock(value: unknown): CashierV3Stock {
  const stock = record(value)
  nullableString(stock.snapshot_id)
  timestamp(stock.capturado_at, true)
  timestamp(stock.confirmado_at, true)
  timestamp(stock.snapshot_expira_at, true)
  check(stock.version_catalogo === null || Number.isSafeInteger(stock.version_catalogo))
  return value as CashierV3Stock
}
function validateCapability(value: unknown): CashierV3SessionCapability {
  const capability = record(value)
  check(['none', 'active', 'recovery'].includes(String(capability.mode)))
  check(typeof capability.capture_allowed === 'boolean' && typeof capability.pending_delivery_allowed === 'boolean')
  timestamp(capability.recovery_until, true)
  if (capability.mode === 'none') {
    check(!capability.capture_allowed && !capability.pending_delivery_allowed && capability.recovery_until === null)
  } else {
    check(capability.pending_delivery_allowed && capability.capture_allowed === (capability.mode === 'active') && capability.recovery_until !== null)
  }
  return value as CashierV3SessionCapability
}
function validateKpis(value: unknown): CashierV3Kpis {
  const kpis = record(value)
  for (const key of ['groups_total', 'coverage_counted', 'count_pending', 'review_pending']) nonNegativeInteger(kpis[key])
  finite(kpis.coverage_percent)
  check(Number(kpis.coverage_percent) >= 0)
  return value as CashierV3Kpis
}
function validateBasis(value: unknown) {
  const basis = record(value)
  nullableString(basis.snapshot_referencia_id)
  check(basis.version_catalogo === null || Number.isSafeInteger(basis.version_catalogo))
  nonNegativeInteger(basis.groups_revision)
  check(typeof basis.periodo_desde === 'string' && typeof basis.periodo_hasta === 'string')
  return basis
}
function validateSession(value: unknown) {
  const session = record(value)
  check(typeof session.id === 'string' && typeof session.sede_id === 'string' && typeof session.usuario_id === 'string')
  check(['activo', 'finalizado', 'expirado'].includes(String(session.estado)))
  timestamp(session.iniciado_at); timestamp(session.expira_at); timestamp(session.recovery_until); timestamp(session.finalizado_at, true)
  check(Date.parse(String(session.recovery_until)) > Date.parse(String(session.expira_at)))
  validateBasis(session)
  return session
}
function validateGroup(value: unknown) {
  const group = record(value)
  for (const key of ['grupo_id', 'nombre', 'categoria_id', 'categoria', 'tipo', 'estado_stock']) check(typeof group[key] === 'string')
  for (const key of ['precio', 'stock_teorico']) finite(group[key])
  check(group.unidades_por_paquete === null || Number.isSafeInteger(group.unidades_por_paquete))
  check(group.precio_paquete === null || (typeof group.precio_paquete === 'number' && Number.isFinite(group.precio_paquete)))
  check(Array.isArray(group.codigos_internos) && group.codigos_internos.every(Number.isSafeInteger))
  check(Array.isArray(group.productos))
  for (const productValue of group.productos) {
    const product = record(productValue)
    check(Number.isSafeInteger(product.c_interno) && typeof product.producto === 'string')
    nullableString(product.marca); finite(product.precio)
  }
  nullableString(group.snapshot_referencia_id)
  for (const key of ['cobertura_periodo', 'requiere_conteo', 'requiere_reconteo']) check(typeof group[key] === 'boolean')
  for (const key of ['detalle_reconteo_id', 'contado_detalle_id']) nullableString(group[key])
  timestamp(group.contado_at, true); timestamp(group.recontado_at, true)
  return group
}
export function validateCashierV3Panel(value: unknown): CashierV3Panel {
  const panel = record(value)
  check(panel.source === 'session' && panel.frozen === true)
  const basis = validateBasis(panel.basis)
  const session = validateSession(panel.session)
  for (const key of ['snapshot_referencia_id', 'version_catalogo', 'groups_revision', 'periodo_desde', 'periodo_hasta']) {
    check(basis[key] === session[key])
  }
  check(Array.isArray(panel.groups) && Array.isArray(panel.count_queue) && Array.isArray(panel.review_queue))
  const groups = new Set<string>()
  for (const value of panel.groups) {
    const group = validateGroup(value)
    check(!groups.has(String(group.grupo_id))); groups.add(String(group.grupo_id))
  }
  const countIds = new Set<string>()
  for (const value of panel.count_queue) {
    check(typeof value === 'string' && groups.has(value) && !countIds.has(value)); countIds.add(value)
  }
  const detailIds = new Set<string>()
  for (const value of panel.review_queue) {
    const item = record(value)
    check(typeof item.grupo_id === 'string' && groups.has(item.grupo_id) && typeof item.detalle_id === 'string' && !detailIds.has(item.detalle_id))
    finite(item.ultima_diferencia); timestamp(item.contado_at); detailIds.add(item.detalle_id)
  }
  validateKpis(panel.kpis)
  return value as CashierV3Panel
}
function validateSummary(value: unknown) {
  const summary = record(value)
  validateKpis(summary)
  const stockTypes = record(summary.stock_types)
  for (const kind of ['positive', 'zero', 'negative']) {
    const item = record(stockTypes[kind]); nonNegativeInteger(item.total); nonNegativeInteger(item.covered)
  }
}
function validateBootstrapBase(value: unknown) {
  const response = record(value)
  check(response.contract_version === 3 && !('session_state' in response))
  timestamp(response.generated_at); timestamp(response.server_now)
  validateRevisions(response.revisions)
  const identity = record(response.identity)
  check(identity.rol === 'cajero' && typeof identity.id === 'string' && typeof identity.nombre === 'string')
  const site = record(response.site)
  check(typeof site.id === 'string' && typeof site.nombre === 'string')
  const device = record(response.device)
  nullableString(device.id)
  check(device.sede_correcta === null || typeof device.sede_correcta === 'boolean')
  check(typeof device.estado === 'string' && typeof device.autorizado === 'boolean' && typeof device.sede_tiene_dispositivo_autorizado === 'boolean')
  validateStock(response.stock)
  const start = record(response.start_capability)
  check(typeof start.allowed === 'boolean'); nullableString(start.reason)
  return { response, identity, site, device, capability: validateCapability(response.session_capability) }
}
export function parseCashierV3Bootstrap(value: unknown): CashierV3Bootstrap {
  const { response, identity, site, device, capability } = validateBootstrapBase(value)
  if (!device.autorizado) {
    check(response.panel_state === null && response.pre_session_summary === null && !record(response.start_capability).allowed)
    check(record(response.start_capability).reason === 'SOLOG_DEVICE_UNAUTHORIZED' && capability.mode === 'none')
  } else if (response.panel_state === null) {
    check(response.pre_session_summary !== null && capability.mode === 'none')
    validateSummary(response.pre_session_summary)
  } else {
    check(response.pre_session_summary === null && capability.mode !== 'none')
    const panel = validateCashierV3Panel(response.panel_state)
    check(panel.session.usuario_id === identity.id && panel.session.sede_id === site.id)
    check(capability.recovery_until === panel.session.recovery_until)
  }
  return value as CashierV3Bootstrap
}
function validateMutationBase(value: unknown, action: CashierV3Action) {
  const response = record(value)
  check(response.contract_version === 3 && response.action === action && typeof response.replay === 'boolean')
  check(!('state' in response) && !('session_state' in response))
  timestamp(response.generated_at); validateRevisions(response.revisions); validateCapability(response.session_capability)
  return response
}
function validatePatch(value: unknown): CashierV3GroupPatch {
  const patch = record(value)
  check(typeof patch.grupo_id === 'string')
  for (const key of ['cobertura_periodo', 'requiere_conteo', 'requiere_reconteo']) check(typeof patch[key] === 'boolean')
  for (const key of ['detalle_reconteo_id', 'contado_detalle_id']) nullableString(patch[key])
  timestamp(patch.contado_at, true); timestamp(patch.recontado_at, true)
  return value as CashierV3GroupPatch
}
export function validateCashierV3PanelDelta(value: unknown): CashierV3PanelDelta {
  const delta = record(value)
  check(Array.isArray(delta.groups_patch) && Array.isArray(delta.count_queue_remove) && Array.isArray(delta.review_queue_remove))
  const patches = delta.groups_patch.map(validatePatch)
  check(new Set(patches.map((patch) => patch.grupo_id)).size === patches.length)
  for (const key of ['count_queue_remove', 'review_queue_remove'] as const) {
    const ids = delta[key] as unknown[]
    check(ids.every((id) => typeof id === 'string'))
    check(new Set(ids).size === ids.length)
  }
  validateKpis(delta.kpis)
  return value as CashierV3PanelDelta
}
function validateSavedItem(value: unknown) {
  const item = record(value)
  for (const key of ['client_observation_id', 'detalle_id', 'grupo_id', 'estado_diferencia']) check(typeof item[key] === 'string')
  for (const key of ['stock_teorico', 'stock_fisico', 'diferencia']) finite(item[key])
  timestamp(item.contado_at)
}
function validateRecountItem(value: unknown) {
  const item = record(value)
  for (const key of ['detalle_id', 'grupo_id', 'snapshot_reconteo_id']) check(typeof item[key] === 'string')
  for (const key of ['stock_teorico_reconteo', 'stock_reconteo', 'diferencia_reconteo', 'diferencia', 'valor_diferencia']) finite(item[key])
  check(['Coincide', 'Confirmada', 'Inconsistente'].includes(String(item.estado_diferencia)))
  timestamp(item.recontado_at)
}
export function parseCashierV3Mutation<A extends CashierV3Action>(value: unknown, action: A): CashierV3MutationResultFor<A> {
  const response = validateMutationBase(value, action)
  if (action === 'start') {
    check(!('conteo_id' in response) && !('panel_delta' in response))
    validateStock(response.stock)
    const panel = validateCashierV3Panel(response.panel_state)
    const capability = validateCapability(response.session_capability)
    check(capability.mode !== 'none' && capability.recovery_until === panel.session.recovery_until)
  } else if (action === 'save_batch' || action === 'recount_save_batch') {
    check(!('panel_state' in response) && typeof response.conteo_id === 'string' && Array.isArray(response.items))
    nonNegativeInteger(response.saved); check(response.saved === response.items.length)
    validateCashierV3PanelDelta(response.panel_delta)
    response.items.forEach(action === 'save_batch' ? validateSavedItem : validateRecountItem)
  } else {
    check(!('panel_state' in response) && !('panel_delta' in response) && !('items' in response))
    check(typeof response.conteo_id === 'string' && ['finalizado', 'expirado'].includes(String(response.status)))
    timestamp(response.finalizado_at)
    check(validateCapability(response.session_capability).mode === 'none')
  }
  return value as CashierV3MutationResultFor<A>
}
export type CashierV3Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw normalizeSologError(error)
  return data as unknown
}
export async function fetchCashierV3Bootstrap(deviceToken?: string, call: CashierV3Rpc = rpc) {
  const payload = deviceToken ? { device_token: deviceToken } : {}
  return parseCashierV3Bootstrap(await call('rpc_solog_cashier_bootstrap_v3', { p_payload: payload }))
}
export async function mutateCashierV3<A extends CashierV3Action>(action: A, payload: Record<string, unknown>, call: CashierV3Rpc = rpc) {
  return parseCashierV3Mutation(await call('rpc_solog_cashier_mutate_v3', { p_action: action, p_payload: payload }), action)
}
