import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError, SologApiError } from '../errors'
import type {
  CashierV4Action, CashierV4Bootstrap, CashierV4BootstrapRequest, CashierV4MutationResultFor,
  CashierV4Panel, CashierV4PanelDelta, CashierV4RequestFor,
} from './cajero.v4'

function check(condition: unknown): asserts condition {
  if (!condition) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
}
function record(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] { check(Array.isArray(value)); return value }
function text(value: unknown): asserts value is string { check(typeof value === 'string') }
function boolean(value: unknown) { check(typeof value === 'boolean') }
function oneOf(value: unknown, values: readonly unknown[]) { check(values.includes(value)) }
function uuid(value: unknown, nullable = false) {
  if (nullable && value === null) return
  text(value)
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
}
function finite(value: unknown): asserts value is number { check(typeof value === 'number' && Number.isFinite(value)) }
function integer(value: unknown) { check(Number.isSafeInteger(value)) }
function count(value: unknown) { integer(value); check(Number(value) >= 0) }
function date(value: unknown) {
  text(value)
  check(/^\d{4}-\d{2}-\d{2}$/.test(value))
  const time = Date.parse(value + 'T00:00:00Z')
  check(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value)
}
function timestamp(value: unknown, nullable = false) {
  if (nullable && value === null) return
  text(value)
  check(/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))
  date(value.slice(0, 10))
  check(Number.isFinite(Date.parse(value)))
}
function instantEqual(left: unknown, right: unknown) {
  return left === right || (typeof left === 'string' && typeof right === 'string' && Date.parse(left) === Date.parse(right))
}
function ordered(from: unknown, to: unknown) { check(Date.parse(String(from)) < Date.parse(String(to))) }
function unique(values: unknown[]) { check(new Set(values).size === values.length) }
const states = ['activo', 'recovery', 'finalizado', 'expirado'] as const
const actions = ['start', 'save_batch', 'recount_save_batch', 'finish'] as const
const nextActions = ['review', 'coverage', 'daily', 'none'] as const
const groupActions = ['recount', 'coverage', 'daily', 'none'] as const
function round(value: unknown) { oneOf(value, [1, 2]) }
function shift(value: unknown) { oneOf(value, ['early', 'day', 'night']) }
function revisions(value: unknown) {
  const r = record(value)
  for (const key of ['groups', 'devices', 'operational']) count(r[key])
}
function stock(value: unknown, required = false) {
  const s = record(value)
  uuid(s.snapshot_id, !required)
  for (const key of ['capturado_at', 'confirmado_at', 'snapshot_expira_at']) timestamp(s[key], !required)
  if (required || s.version_catalogo !== null) count(s.version_catalogo)
}
function capability(value: unknown, finish = false) {
  const c = record(value)
  oneOf(c.mode, ['active', 'recovery', 'none'])
  oneOf(c.estado, [null, ...states])
  boolean(c.capture_allowed); boolean(c.pending_delivery_allowed)
  for (const key of ['iniciado_at', 'expira_at', 'recovery_until', 'finalizado_at']) {
    // The finish shape in section 16 explicitly omits iniciado_at.
    if (finish && key === 'iniciado_at' && !Object.hasOwn(c, key)) continue
    timestamp(c[key], true)
  }
  if (c.mode === 'none') check(!c.capture_allowed && !c.pending_delivery_allowed)
  if (c.mode === 'active') check(c.estado === 'activo')
  if (c.mode === 'recovery') check(c.estado === 'recovery' && !c.capture_allowed)
  if (c.capture_allowed) check(c.pending_delivery_allowed)
  if (c.mode !== 'none') {
    timestamp(c.iniciado_at); timestamp(c.expira_at); timestamp(c.recovery_until)
    ordered(c.iniciado_at, c.expira_at); ordered(c.expira_at, c.recovery_until)
  }
  if (finish) {
    check(c.mode === 'none' && c.estado === 'finalizado')
    timestamp(c.expira_at); timestamp(c.recovery_until); timestamp(c.finalizado_at)
  }
  return c
}
function temporalBasis(value: unknown) {
  const b = record(value)
  date(b.periodo_desde); date(b.periodo_hasta)
  check(String(b.periodo_desde) <= String(b.periodo_hasta))
  round(b.ronda); shift(b.turno)
  for (const key of ['ronda_desde', 'ronda_hasta', 'turno_desde', 'turno_hasta']) timestamp(b[key])
  ordered(b.ronda_desde, b.ronda_hasta); ordered(b.turno_desde, b.turno_hasta)
  return b
}
function basis(value: unknown) {
  const b = temporalBasis(value)
  uuid(b.snapshot_referencia_id); count(b.version_catalogo); count(b.groups_revision)
  return b
}
function session(value: unknown) {
  const s = record(value)
  for (const key of ['id', 'sede_id', 'usuario_id']) uuid(s[key])
  oneOf(s.estado, states)
  for (const key of ['iniciado_at', 'expira_at', 'recovery_until']) timestamp(s[key])
  timestamp(s.finalizado_at, true)
  ordered(s.iniciado_at, s.expira_at); ordered(s.expira_at, s.recovery_until)
  return s
}
function kpis(value: unknown) {
  const k = record(value)
  round(k.coverage_round)
  for (const key of ['coverage_total', 'coverage_counted', 'coverage_pending', 'review_pending',
    'coverage_queue_pending', 'daily_pending', 'coverage_blocked_waiting_snapshot']) count(k[key])
  finite(k.coverage_percent); check(k.coverage_percent >= 0 && k.coverage_percent <= 100)
  return k
}
function patch(value: unknown) {
  const g = record(value)
  uuid(g.grupo_id); oneOf(g.accion, groupActions)
  uuid(g.detalle_reconteo_id, true); uuid(g.contado_detalle_id, true)
  timestamp(g.contado_at, true); timestamp(g.recontado_at, true)
  return g
}
function group(value: unknown) {
  const g = patch(value)
  text(g.nombre); text(g.categoria); uuid(g.categoria_id)
  oneOf(g.tipo, ['Individual', 'Agrupado'])
  finite(g.precio); finite(g.stock_teorico)
  if (g.unidades_por_paquete !== null) integer(g.unidades_por_paquete)
  if (g.precio_paquete !== null) finite(g.precio_paquete)
  array(g.codigos_internos).forEach(integer)
  for (const value of array(g.productos)) {
    const p = record(value)
    integer(p.c_interno); text(p.producto); finite(p.precio)
    if (p.marca !== null) text(p.marca)
  }
  uuid(g.snapshot_referencia_id)
  return g
}
function queues(value: Record<string, unknown>) {
  const review = array(value.review_queue).map((value) => {
    const q = record(value)
    uuid(q.grupo_id); uuid(q.detalle_id); finite(q.ultima_diferencia); timestamp(q.contado_at)
    return q
  })
  const coverage = array(value.coverage_queue)
  const daily = array(value.daily_queue)
  coverage.forEach((id) => uuid(id)); daily.forEach((id) => uuid(id))
  unique(review.map((q) => q.detalle_id))
  unique([...review.map((q) => q.grupo_id), ...coverage, ...daily])
  return { review, coverage, daily }
}
function sessionCapabilityMatches(s: Record<string, unknown>, c: Record<string, unknown>) {
  check(s.estado === c.estado)
  for (const key of ['iniciado_at', 'expira_at', 'recovery_until', 'finalizado_at']) check(instantEqual(s[key], c[key]))
}
function capabilitiesMatch(left: unknown, right: unknown) {
  const a = record(left), b = record(right)
  for (const key of ['mode', 'estado', 'capture_allowed', 'pending_delivery_allowed']) check(a[key] === b[key])
  for (const key of ['iniciado_at', 'expira_at', 'recovery_until', 'finalizado_at']) check(instantEqual(a[key], b[key]))
}

export function validateCashierV4Panel(value: unknown): CashierV4Panel {
  const p = record(value)
  check(p.source === 'session' && p.frozen === true)
  const b = basis(p.basis), s = session(p.session)
  const groups = array(p.groups).map(group)
  unique(groups.map((g) => g.grupo_id))
  const byId = new Map(groups.map((g) => [g.grupo_id, g]))
  const q = queues(p)
  for (const item of q.review) {
    const g = byId.get(item.grupo_id)
    check(g?.accion === 'recount' && g.detalle_reconteo_id === item.detalle_id)
  }
  for (const id of q.coverage) check(byId.get(id)?.accion === 'coverage')
  for (const id of q.daily) check(byId.get(id)?.accion === 'daily')
  const queued = new Set([...q.review.map((item) => item.grupo_id), ...q.coverage, ...q.daily])
  for (const g of groups) {
    check(queued.has(g.grupo_id) === (g.accion !== 'none'))
    check(g.snapshot_referencia_id === b.snapshot_referencia_id)
  }
  check(kpis(p.kpis).coverage_round === b.ronda)
  oneOf(p.next_action, nextActions)
  sessionCapabilityMatches(s, capability(p.session_capability))
  return value as CashierV4Panel
}
export function validateCashierV4PanelDelta(value: unknown): CashierV4PanelDelta {
  const d = record(value)
  const patches = array(d.groups_patch).map(patch)
  unique(patches.map((g) => g.grupo_id))
  // A delta does not contain the full group universe; cross-panel checks belong to the reducer.
  queues(d); kpis(d.kpis); oneOf(d.next_action, nextActions); capability(d.session_capability)
  return value as CashierV4PanelDelta
}
export function parseCashierV4Bootstrap(value: unknown): CashierV4Bootstrap {
  const r = record(value)
  check(r.contract_version === 4)
  timestamp(r.generated_at); timestamp(r.server_now); revisions(r.revisions)
  const identity = record(r.identity), site = record(r.site), device = record(r.device)
  uuid(identity.id); text(identity.nombre); check(identity.rol === 'cajero')
  uuid(site.id); text(site.nombre)
  uuid(device.id, true); text(device.estado)
  if (device.sede_correcta !== null) boolean(device.sede_correcta)
  boolean(device.autorizado); boolean(device.sede_tiene_dispositivo_autorizado)
  stock(r.stock)
  const start = record(r.start_capability)
  boolean(start.allowed)
  if (start.reason !== null) text(start.reason)
  const c = capability(r.session_capability)
  const recoveries = array(r.recovery_sessions).map((value) => {
    const s = record(value)
    uuid(s.id); uuid(s.snapshot_referencia_id); round(s.ronda); shift(s.turno)
    for (const key of ['iniciado_at', 'expira_at', 'recovery_until']) timestamp(s[key])
    ordered(s.iniciado_at, s.expira_at); ordered(s.expira_at, s.recovery_until)
    const recovery = capability(s.session_capability)
    check(!recovery.capture_allowed && recovery.mode !== 'active')
    for (const key of ['iniciado_at', 'expira_at', 'recovery_until']) check(instantEqual(s[key], recovery[key]))
    return s
  })
  unique(recoveries.map((s) => s.id))
  if (r.pre_session_summary !== null) {
    const summary = record(r.pre_session_summary)
    const b = temporalBasis(summary.basis)
    check(kpis(summary.kpis).coverage_round === b.ronda)
    oneOf(summary.next_action, nextActions)
  }
  if (r.panel_state !== null) {
    const panel = validateCashierV4Panel(r.panel_state)
    check(panel.session.usuario_id === identity.id && panel.session.sede_id === site.id && device.autorizado)
    check(!recoveries.some((s) => s.id === panel.session.id))
    check(record(r.stock).snapshot_id === panel.basis.snapshot_referencia_id)
    check(record(r.stock).version_catalogo === panel.basis.version_catalogo)
    capabilitiesMatch(c, panel.session_capability)
  }
  if (!device.autorizado) check(r.panel_state === null && !start.allowed && !c.capture_allowed && !c.pending_delivery_allowed)
  return value as CashierV4Bootstrap
}
function savedItem(value: unknown, recount: boolean) {
  const i = record(value)
  uuid(i.detalle_id); uuid(i.grupo_id)
  if (recount) {
    uuid(i.snapshot_reconteo_id)
    for (const key of ['stock_teorico_reconteo', 'stock_reconteo', 'diferencia_reconteo', 'diferencia', 'valor_diferencia']) finite(i[key])
    check(Number(i.stock_reconteo) >= 0)
    oneOf(i.estado_diferencia, ['Coincide', 'Confirmada', 'Inconsistente'])
    timestamp(i.recontado_at)
  } else {
    uuid(i.client_observation_id)
    for (const key of ['stock_teorico', 'stock_fisico', 'diferencia']) finite(i[key])
    check(Number(i.stock_fisico) >= 0)
    oneOf(i.estado_diferencia, ['Coincide', 'Recontar'])
    timestamp(i.contado_at)
  }
  return i
}
export function parseCashierV4Mutation<A extends CashierV4Action>(value: unknown, action: A): CashierV4MutationResultFor<A> {
  oneOf(action, actions)
  const r = record(value)
  check(r.contract_version === 4 && r.action === action)
  boolean(r.replay); uuid(r.conteo_id); timestamp(r.generated_at); revisions(r.revisions)
  capability(r.session_capability, action === 'finish')
  if (action === 'start') {
    check(!('panel_delta' in r) && !('items' in r))
    stock(r.stock, true)
    const p = validateCashierV4Panel(r.panel_state)
    check(r.conteo_id === p.session.id)
    check(record(r.stock).snapshot_id === p.basis.snapshot_referencia_id)
    check(record(r.stock).version_catalogo === p.basis.version_catalogo)
    capabilitiesMatch(r.session_capability, p.session_capability)
  } else if (action === 'finish') {
    check(!('panel_state' in r) && !('panel_delta' in r) && !('items' in r))
    check(r.status === 'finalizado'); timestamp(r.finalizado_at)
    check(instantEqual(r.finalizado_at, record(r.session_capability).finalizado_at))
  } else {
    check(!('panel_state' in r))
    const items = array(r.items).map((value) => savedItem(value, action === 'recount_save_batch'))
    count(r.saved); check(r.saved === items.length)
    unique(items.map((i) => i.detalle_id)); unique(items.map((i) => i.grupo_id))
    if (action === 'save_batch') unique(items.map((i) => i.client_observation_id))
    const delta = validateCashierV4PanelDelta(r.panel_delta)
    capabilitiesMatch(r.session_capability, delta.session_capability)
  }
  return value as CashierV4MutationResultFor<A>
}

export type CashierV4Rpc = (name: 'rpc_solog_cashier_bootstrap_v4' | 'rpc_solog_cashier_mutate_v4', args: Record<string, unknown>) => Promise<unknown>
async function rpc(name: Parameters<CashierV4Rpc>[0], args: Record<string, unknown>) {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw normalizeSologError(error)
  return data as unknown
}
export async function fetchCashierV4Bootstrap(payload: CashierV4BootstrapRequest, call: CashierV4Rpc = rpc) {
  return parseCashierV4Bootstrap(await call('rpc_solog_cashier_bootstrap_v4', { p_payload: payload }))
}
export async function mutateCashierV4<A extends CashierV4Action>(
  action: A, payload: CashierV4RequestFor<NoInfer<A>>, call: CashierV4Rpc = rpc,
): Promise<CashierV4MutationResultFor<A>> {
  // IDs, observation times and operation identity belong to the caller; never regenerate them here.
  return parseCashierV4Mutation(await call('rpc_solog_cashier_mutate_v4', { p_action: action, p_payload: payload }), action)
}
