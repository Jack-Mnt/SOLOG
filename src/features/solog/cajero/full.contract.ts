export type FullAction = 'start' | 'save_batch' | 'recount_save_batch' | 'finish'
export interface FullSession {
  session_id: string; status: 'active' | 'recovery' | 'expired' | 'finished'; session_started_at: string
  reference_snapshot_id: string; reference_snapshot_captured_at: string; reference_stock_expires_at: string
  capture_interval_number: 1 | 2; capture_interval_starts_at: string; capture_interval_ends_at: string
  session_expires_at: string; pending_delivery_until: string; capture_allowed: boolean; pending_delivery_allowed: boolean
  groups_revision: number
}
export interface FullGroup {
  group_id: string; group_name: string; category_id: string; category_name: string
  reference_snapshot_id: string; groups_revision: number; stock_theoretical: number; member_codes: number[]
  members: { c_interno: number; product: string; barcode: string | null; price: number }[]
  price: number; units_per_package: number | null; package_price: number | null
  action: 'recount' | 'coverage' | 'daily' | 'none'; priority_class: string; recount_detail_id: string | null
}
export interface FullCashierGroup extends FullGroup {
  coverage_pending_round: boolean
}
export interface FullOperationalSummary {
  basis: { coverage_round: 1 | 2; round_starts_at: string; round_ends_at: string }
  coverage_total: number; coverage_counted: number; coverage_pending: number; coverage_percent: number
  review_pending: number; daily_pending: number
  next_action: 'coverage' | 'review' | 'daily' | 'none'
}
export interface FullRecoveryDeliveryState {
  session_id: string; groups_revision: number
  current_priority_class: 'round_coverage' | 'review_for_coverage' | 'review_regular' | 'shift_coverage' | 'none'
  eligible_groups: {
    group_id: string; action: 'coverage' | 'daily' | 'recount'; priority_class: string
    recount_detail_id: string | null; reference_snapshot_id: string
  }[]
}
export interface FullState {
  timezone: 'America/Lima'
  site: { id: string; nombre: string }
  stock: null | { snapshot_id: string; snapshot_captured_at: string; snapshot_confirmed_at: string; stock_expires_at: string; is_fresh: boolean; is_fallback: boolean; catalog_version: number; groups_revision: number }
  session: FullSession | null; recovery_sessions: FullSession[]; groups: FullCashierGroup[]
  operational_summary: FullOperationalSummary
  confirmed_observation_ids: string[]; recovery_manifests: { session_id: string; observation_ids: string[] }[]
  recovery_delivery_states?: FullRecoveryDeliveryState[]
  capabilities: { can_start_session: boolean; can_capture_in_current_session: boolean; block_reason: string | null }
}
export interface FullMutation {
  action: FullAction; replay: boolean; session: FullSession; affected_groups: FullGroup[]
  observation_results: { client_observation_id: string; detail_id: string; state: string; difference: number; replay: boolean }[]
}
export interface FullEnvelope { ok: boolean; code: string; contract_version: 2; server_now: string; retryable: boolean; request_id: string; data: FullState | FullMutation | null }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isUuid(value: unknown): value is string { return typeof value === 'string' && uuidPattern.test(value) }
function check(value: unknown): asserts value { if (!value) throw new Error('FULL_INVALID_RESPONSE') }
function object(value: unknown): Record<string, unknown> { check(value !== null && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown> }
function list(value: unknown): unknown[] { check(Array.isArray(value) && value.length <= 10000); return value }
function text(value: unknown): asserts value is string { check(typeof value === 'string') }
function date(value: unknown): asserts value is string { text(value); check(/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value))) }
function integer(value: unknown): asserts value is number { check(Number.isSafeInteger(value)) }
function boolean(value: unknown): asserts value is boolean { check(typeof value === 'boolean') }
function uniqueIds(value: unknown) { const ids = list(value); ids.forEach(id => check(isUuid(id))); check(new Set(ids).size === ids.length) }
function session(value: unknown) {
  const s = object(value); check(isUuid(s.session_id) && isUuid(s.reference_snapshot_id))
  check(['active', 'recovery', 'expired', 'finished'].includes(String(s.status)))
  for (const field of ['session_started_at', 'reference_snapshot_captured_at', 'reference_stock_expires_at', 'capture_interval_starts_at', 'capture_interval_ends_at', 'session_expires_at', 'pending_delivery_until']) date(s[field])
  integer(s.groups_revision); check(s.groups_revision > 0); check(s.capture_interval_number === 1 || s.capture_interval_number === 2)
  boolean(s.capture_allowed); boolean(s.pending_delivery_allowed)
  const capture = Date.parse(String(s.reference_snapshot_captured_at)), end = Date.parse(String(s.session_expires_at))
  check(end > Date.parse(String(s.session_started_at)) && end <= Date.parse(String(s.capture_interval_ends_at)))
  check(Date.parse(String(s.reference_stock_expires_at)) === capture + 7200000)
  check(Date.parse(String(s.pending_delivery_until)) === end + 7200000)
  check(!s.capture_allowed || s.status === 'active' && s.pending_delivery_allowed)
}
function operationalSummary(value: unknown, serverNow: string) {
  const s = object(value), basis = object(s.basis)
  check(basis.coverage_round === 1 || basis.coverage_round === 2)
  date(basis.round_starts_at); date(basis.round_ends_at)
  const start = Date.parse(basis.round_starts_at), end = Date.parse(basis.round_ends_at)
  check(start < end && start <= Date.parse(serverNow) && Date.parse(serverNow) < end)
  for (const key of ['coverage_total', 'coverage_counted', 'coverage_pending', 'review_pending', 'daily_pending']) {
    integer(s[key]); check(Number(s[key]) >= 0)
  }
  const total = Number(s.coverage_total), counted = Number(s.coverage_counted), pending = Number(s.coverage_pending)
  check(counted <= total && pending === total - counted)
  check(typeof s.coverage_percent === 'number' && Number.isFinite(s.coverage_percent))
  const expected = total ? Math.round(counted * 1000 / total) / 10 : 0
  check(Math.abs(s.coverage_percent - expected) < 1e-9)
  check(['coverage', 'review', 'daily', 'none'].includes(String(s.next_action)))
}
function group(value: unknown) {
  const g = object(value); check(isUuid(g.group_id) && isUuid(g.reference_snapshot_id) && isUuid(g.category_id))
  text(g.group_name); text(g.category_name); integer(g.groups_revision); integer(g.stock_theoretical)
  check(typeof g.price === 'number' && Number.isFinite(g.price)); check(g.units_per_package === null || Number.isSafeInteger(g.units_per_package)); check(g.package_price === null || typeof g.package_price === 'number' && Number.isFinite(g.package_price))
  list(g.member_codes).forEach(integer)
  for (const member of list(g.members)) { const p = object(member); integer(p.c_interno); text(p.product); check(p.barcode === null || typeof p.barcode === 'string'); check(typeof p.price === 'number' && Number.isFinite(p.price)) }
  check(['recount', 'coverage', 'daily', 'none'].includes(String(g.action))); text(g.priority_class)
  check(g.recount_detail_id === null || isUuid(g.recount_detail_id))
}
export function parseFullEnvelope(value: unknown): FullEnvelope {
  const r = object(value); check(r.contract_version === 2 && isUuid(r.request_id)); boolean(r.ok); boolean(r.retryable); text(r.code); date(r.server_now)
  if (!r.ok) { check(r.data === null); check(Array.isArray(r.errors)); return value as FullEnvelope }
  const d = object(r.data)
  if (r.code === 'CASHIER_STATE') {
    check(d.timezone === 'America/Lima'); const site = object(d.site)
    check(isUuid(site.id)); text(site.nombre); check(site.nombre.trim().length > 0)
    if (d.session !== null) session(d.session)
    list(d.recovery_sessions).forEach(session); operationalSummary(d.operational_summary, r.server_now)
    list(d.groups).forEach(item => { group(item); boolean(object(item).coverage_pending_round) }); uniqueIds(d.confirmed_observation_ids)
    const groups = list(d.groups).map(object); check(new Set(groups.map(g => g.group_id)).size === groups.length)
    check(d.session !== null || groups.length === 0)
    if (d.session !== null) { const s = object(d.session); check(groups.every(g => g.reference_snapshot_id === s.reference_snapshot_id && g.groups_revision === s.groups_revision)) }
    for (const entry of list(d.recovery_manifests)) { const m = object(entry); check(isUuid(m.session_id)); uniqueIds(m.observation_ids) }
    // Contrato aditivo de recovery ya desplegado; las fixtures anteriores
    // pueden no incluirlo, pero si se entrega, debe ser estructuralmente válido.
    if (d.recovery_delivery_states !== undefined) {
      const seen = new Set<string>()
      const allowed = ['round_coverage', 'review_for_coverage', 'review_regular', 'shift_coverage', 'none']
      for (const entry of list(d.recovery_delivery_states)) {
        const item = object(entry)
        check(isUuid(item.session_id) && !seen.has(item.session_id))
        seen.add(item.session_id)
        integer(item.groups_revision); check(Number(item.groups_revision) > 0)
        check(allowed.includes(String(item.current_priority_class)))
        const ids = new Set<string>()
        for (const raw of list(item.eligible_groups)) {
          const group = object(raw)
          check(isUuid(group.group_id) && isUuid(group.reference_snapshot_id))
          check(!ids.has(String(group.group_id))); ids.add(String(group.group_id))
          check(['coverage', 'daily', 'recount'].includes(String(group.action)))
          text(group.priority_class)
          check(group.recount_detail_id === null || isUuid(group.recount_detail_id))
        }
      }
    }
    const c = object(d.capabilities); boolean(c.can_start_session); boolean(c.can_capture_in_current_session); check(c.block_reason === null || typeof c.block_reason === 'string')
    if (d.stock !== null) { const s = object(d.stock); check(isUuid(s.snapshot_id)); for (const field of ['snapshot_captured_at', 'snapshot_confirmed_at', 'stock_expires_at']) date(s[field]); boolean(s.is_fresh); boolean(s.is_fallback); integer(s.catalog_version); integer(s.groups_revision) }
  } else {
    check(['SESSION_STARTED', 'OBSERVATIONS_CONFIRMED', 'SESSION_FINISHED'].includes(r.code)); session(d.session); boolean(d.replay)
    check(['start', 'save_batch', 'recount_save_batch', 'finish'].includes(String(d.action)))
    check(r.code === 'SESSION_STARTED' ? d.action === 'start' : r.code === 'SESSION_FINISHED' ? d.action === 'finish' && object(d.session).status === 'finished' : d.action === 'save_batch' || d.action === 'recount_save_batch')
    list(d.affected_groups).forEach(group)
    for (const item of list(d.observation_results)) { const i = object(item); check(isUuid(i.client_observation_id) && isUuid(i.detail_id)); integer(i.difference); check(['Coincide', 'Recontar', 'Confirmada', 'Inconsistente', 'Inválido'].includes(String(i.state))); boolean(i.replay) }
  }
  return value as FullEnvelope
}
