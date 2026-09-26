import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError } from '../errors'

export type Biweekly = 'current_biweekly' | 'previous_biweekly'
export type ControlPeriod = 'today' | 'last_week' | Biweekly | 'custom'
export type DifferenceState = 'Coincide' | 'Recontar' | 'Confirmada' | 'Inconsistente'
export interface Envelope { contract_version: 2; generated_at: string; revisions: { groups?: number; catalog?: number; operational?: number } }
export interface AdminBootstrap extends Envelope {
  identity: { id: string; nombre: string; rol: 'admin' | 'moderador' }
  permissions: { can_admin: boolean; can_moderate: boolean }
  allowed_sites: { id: string; nombre: string; operational_revision: number; devices_revision: number; incidents_revision: number }[]
}
export interface DashboardCards extends Envelope {
  sites: { site_id: string; site: string; operational_revision: number
    period_coverage: { counted: number; total: number; percent: number; complete: boolean }
    daily_coverage: { counted_today: number; total: number; percent: number }
    pending_recount: number
    snapshot: { id: string; capturado_at: string; confirmado_at: string; version_catalogo: number } | null
  }[]
}
export interface Coverage { date: string; numerator: number; denominator: number; percentage: number; groups_revision: number | null }
export interface ShiftGrid extends Envelope {
  site_id: string; period: { key: Biweekly; from: string; to: string }
  data: { shifts: (Coverage & { shift: 'early' | 'day' | 'night'; calculated_at: string })[]; totals: Coverage[] }
}
export type DailyStockClass = 'positive' | 'zero'
export interface DailyBaseItem { case_id: string; grupo: string }
export interface DailyCoincideItem extends DailyBaseItem { stock: number }
export interface DailyRecountItem extends DailyBaseItem { physical: number; difference: number }
export interface DailyConfirmedItem extends DailyBaseItem { difference: number; valued_difference: number | null }
export interface DailyInconsistentItem extends DailyBaseItem { theoretical: number; initial_difference: number; found_difference: number }
export interface DailyDetailCounts {
  positive: Record<DifferenceState, number>
  zero: Record<DifferenceState, number>
}
export interface DailyDetailBootstrap extends Envelope {
  revisions: { operational: number }
  site_id: string
  origin_date: string
  stock_class: DailyStockClass
  page_size: 25
  counts: DailyDetailCounts
  views: {
    Coincide: DailyCoincideItem[]
    Recontar: DailyRecountItem[]
    Confirmada: DailyConfirmedItem[]
    Inconsistente: DailyInconsistentItem[]
  }
}
export type DailyDetailPage =
  | (Envelope & { revisions: { operational: number }; site_id: string; origin_date: string; stock_class: DailyStockClass; state: 'Coincide'; page: number; page_size: 25; items: DailyCoincideItem[] })
  | (Envelope & { revisions: { operational: number }; site_id: string; origin_date: string; stock_class: DailyStockClass; state: 'Recontar'; page: number; page_size: 25; items: DailyRecountItem[] })
  | (Envelope & { revisions: { operational: number }; site_id: string; origin_date: string; stock_class: DailyStockClass; state: 'Confirmada'; page: number; page_size: 25; items: DailyConfirmedItem[] })
  | (Envelope & { revisions: { operational: number }; site_id: string; origin_date: string; stock_class: DailyStockClass; state: 'Inconsistente'; page: number; page_size: 25; items: DailyInconsistentItem[] })
export interface StateSummary { total: number; coincide: number; pending_recount: number; confirmed: number; inconsistent: number }
export interface ControlGroupsPayload { site_id: string; period: ControlPeriod; date_from?: string; date_to?: string }
export interface ControlGroupItem {
  case_id: string; group_id: string; group_name: string; category: string; origin_at: string
  state: DifferenceState; difference: number; valued_difference: number
}
export interface ControlGroupsResponse extends Envelope {
  revisions: { operational: number }
  site_id: string; period: { key: ControlPeriod; from: string; to: string }; items: ControlGroupItem[]
}
export type ControlChronologyPeriod = Biweekly
export interface ControlChronologyPayload { site_id: string; group_id: string; period: ControlChronologyPeriod }
export type ControlChronologyViewRow =
  | { row_id: string; event_at: string; state: 'Coincide'; stock: number }
  | { row_id: string; event_at: string; state: 'Recontar' | 'Recontado'; physical: number; difference: number }
  | { row_id: string; event_at: string; state: 'Confirmada'; difference: number; valued_difference: number }
  | { row_id: string; event_at: string; state: 'Inconsistente'; theoretical: number; initial_difference: number; found_difference: number }
export interface ControlChronologyViewResponse extends Envelope {
  revisions: { operational: number }
  site_id: string
  group: { id: string; name: string; category: string | null; latest_unit_price: number | null }
  period: { key: ControlChronologyPeriod; from: string; to: string }
  chronology: ControlChronologyViewRow[]
}
interface ExportBase { case_id: string; grupo_id: string; grupo: string; categoria: string; fecha_origen: string }
interface ExportResult extends ExportBase { estado: DifferenceState; teorico: number; fisico: number; diferencia: number; valorizado: number | null; source: 'initial' | 'posterior' | 'recount' }
export interface ControlExport extends Envelope {
  site: { id: string; nombre: string }; period: { key: Biweekly; from: string; to: string }; summary: StateSummary
  adjustments: ExportResult[]
  pending_recount: (ExportBase & { teorico_conteo: number; fisico_conteo: number; diferencia: number; stock_posterior: number | null })[]
  inconsistent: (ExportBase & { teorico_conteo: number; fisico_conteo: number; diferencia_conteo: number; teorico_reconteo: number | null; fisico_reconteo: number | null; diferencia_reconteo: number | null; estado: DifferenceState })[]
  all: (ExportResult & { recontado_at: string | null })[]
}
export interface AdminPayloads {
  bootstrap: Record<string, never>
  dashboard_cards: Record<string, never>
  shift_grid: { site_id: string; period?: Biweekly }
  daily_detail_bootstrap: { site_id: string; origin_date: string; stock_class: DailyStockClass }
  daily_detail_page: { site_id: string; origin_date: string; stock_class: DailyStockClass; state: DifferenceState; page: number }
  control_groups: ControlGroupsPayload
  control_chronology_view: ControlChronologyPayload
  export: { site_id: string; period: Biweekly }
}
export interface AdminResponses { bootstrap: AdminBootstrap; dashboard_cards: DashboardCards; shift_grid: ShiftGrid; daily_detail_bootstrap: DailyDetailBootstrap; daily_detail_page: DailyDetailPage; control_groups: ControlGroupsResponse; control_chronology_view: ControlChronologyViewResponse; export: ControlExport }
export type AdminAction = keyof AdminPayloads

type RecordValue = Record<string, unknown>
function record(value: unknown): value is RecordValue { return !!value && typeof value === 'object' && !Array.isArray(value) }
function numbers(value: unknown, keys: string[]) { return record(value) && keys.every(k => typeof value[k] === 'number' && Number.isFinite(value[k])) }
function strings(value: unknown, keys: string[]) { return record(value) && keys.every(k => typeof value[k] === 'string') }
function array(value: unknown, validate: (row: RecordValue) => boolean) { return Array.isArray(value) && value.every(row => record(row) && validate(row)) }
function nullableNumbers(value: RecordValue, keys: string[]) { return keys.every(k => value[k] === null || typeof value[k] === 'number' && Number.isFinite(value[k])) }
function nullableTime(value: unknown) { return value === null || typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function state(value: unknown) { return ['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'].includes(String(value)) }
function source(value: unknown) { return ['initial', 'posterior', 'recount'].includes(String(value)) }
function dateOnly(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value }
const controlPeriods = ['today', 'last_week', 'current_biweekly', 'previous_biweekly', 'custom']
function controlRange(value: unknown, chronology = false) {
  return record(value) && (chronology ? ['current_biweekly', 'previous_biweekly'] : controlPeriods).includes(String(value.key)) && dateOnly(value.from) && dateOnly(value.to) && value.from <= value.to
}
function unique(rows: unknown, key: string) { return Array.isArray(rows) && new Set(rows.map(row => row[key])).size === rows.length }
function dailyStockClass(value: unknown): value is DailyStockClass { return value === 'positive' || value === 'zero' }
function countBlock(value: unknown) { return record(value) && (['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'] as DifferenceState[]).every(key => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0) }
function dailyBase(r: RecordValue) { return strings(r, ['case_id', 'grupo']) }
function dailyRows(value: unknown, stateValue: DifferenceState) {
  return array(value, r => {
    if (!dailyBase(r)) return false
    if (stateValue === 'Coincide') return numbers(r, ['stock'])
    if (stateValue === 'Recontar') return numbers(r, ['physical', 'difference'])
    if (stateValue === 'Confirmada') return numbers(r, ['difference']) && nullableNumbers(r, ['valued_difference'])
    return numbers(r, ['theoretical', 'initial_difference', 'found_difference'])
  })
}
function dailyBootstrapViews(value: unknown, counts: unknown, stockClass: unknown) {
  if (!record(value) || !record(counts) || !dailyStockClass(stockClass)) return false
  const countSet = counts[stockClass]
  if (!record(countSet)) return false
  return dailyRows(value.Coincide, 'Coincide')
    && dailyRows(value.Recontar, 'Recontar')
    && dailyRows(value.Confirmada, 'Confirmada')
    && dailyRows(value.Inconsistente, 'Inconsistente')
    && (['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'] as DifferenceState[]).every(key => {
      const rows = value[key]
      const expected = countSet[key]
      return Array.isArray(rows)
        && Number.isSafeInteger(expected)
        && rows.length === Math.min(25, Number(expected))
        && unique(rows, 'case_id')
    })
}
function chronologyViewRows(value: unknown) {
  return array(value, r => {
    if (!strings(r, ['row_id', 'event_at']) || !nullableTime(r.event_at)) return false
    if (r.state === 'Coincide') return numbers(r, ['stock'])
    if (r.state === 'Recontar' || r.state === 'Recontado') return numbers(r, ['physical', 'difference'])
    if (r.state === 'Confirmada') return numbers(r, ['difference', 'valued_difference'])
    if (r.state === 'Inconsistente') return numbers(r, ['theoretical', 'initial_difference', 'found_difference'])
    return false
  })
}
export function validateControlPayload(action: AdminAction, payload: unknown) {
  if (action === 'daily_detail_bootstrap' || action === 'daily_detail_page') {
    let valid = record(payload) && strings(payload, ['site_id', 'origin_date', 'stock_class']) && !!payload.site_id && dateOnly(payload.origin_date) && ['positive', 'zero'].includes(String(payload.stock_class))
    if (valid && record(payload)) {
      const allowed = action === 'daily_detail_bootstrap'
        ? ['site_id', 'origin_date', 'stock_class']
        : ['site_id', 'origin_date', 'stock_class', 'state', 'page']
      valid = Object.keys(payload).every(key => allowed.includes(key))
        && (action === 'daily_detail_bootstrap' || state(payload.state) && Number.isInteger(payload.page) && Number(payload.page) >= 0)
    }
    if (!valid) throw new Error(`Payload ${action} incompatible con contrato Admin.`)
    return
  }
  if (action !== 'control_groups' && action !== 'control_chronology_view') return
  const chronology = action === 'control_chronology_view'
  let valid = record(payload) && strings(payload, ['site_id', 'period']) && !!payload.site_id
  if (valid && record(payload)) {
    const allowed = chronology ? ['site_id', 'group_id', 'period'] : payload.period === 'custom' ? ['site_id', 'period', 'date_from', 'date_to'] : ['site_id', 'period']
    valid = Object.keys(payload).every(key => allowed.includes(key)) && (chronology
      ? strings(payload, ['group_id']) && !!payload.group_id && ['current_biweekly', 'previous_biweekly'].includes(String(payload.period))
      : controlPeriods.includes(String(payload.period)) && (payload.period !== 'custom' || dateOnly(payload.date_from) && dateOnly(payload.date_to) && payload.date_from <= payload.date_to && (Date.parse(payload.date_to) - Date.parse(payload.date_from)) / 86400000 + 1 <= 92))
  }
  if (!valid) throw new Error(`Payload ${action} incompatible con contrato Admin.`)
}
function exportBase(r: RecordValue) { return strings(r, ['case_id', 'grupo_id', 'grupo', 'categoria', 'fecha_origen']) && nullableTime(r.fecha_origen) }
function exportResult(r: RecordValue) { return exportBase(r) && state(r.estado) && source(r.source) && numbers(r, ['teorico', 'fisico', 'diferencia']) && nullableNumbers(r, ['valorizado']) }
export function validateAdminResponse<A extends AdminAction>(action: A, value: unknown): AdminResponses[A] {
  let valid = record(value) && value.contract_version === 2 && typeof value.generated_at === 'string' && Number.isFinite(Date.parse(value.generated_at)) && record(value.revisions) && Object.values(value.revisions).every(v => Number.isInteger(v) && Number(v) >= 0)
  if (!valid || !record(value)) throw new Error('Respuesta Admin incompatible con contrato v2.')
  const rows = (v: unknown) => array(v, r => strings(r, ['case_id']))
  switch (action) {
    case 'bootstrap': valid = strings(value.identity, ['id', 'nombre', 'rol']) && record(value.identity) && ['admin', 'moderador'].includes(String(value.identity.rol)) && record(value.permissions) && typeof value.permissions.can_admin === 'boolean' && value.permissions.can_moderate === true && array(value.allowed_sites, r => strings(r, ['id', 'nombre']) && numbers(r, ['operational_revision', 'devices_revision', 'incidents_revision'])); break
    case 'dashboard_cards': valid = array(value.sites, r => strings(r, ['site_id', 'site']) && numbers(r, ['pending_recount', 'operational_revision']) && numbers(r.period_coverage, ['counted', 'total', 'percent']) && record(r.period_coverage) && typeof r.period_coverage.complete === 'boolean' && numbers(r.daily_coverage, ['counted_today', 'total', 'percent']) && (r.snapshot === null || strings(r.snapshot, ['id', 'capturado_at', 'confirmado_at']))); break
    case 'shift_grid': valid = strings(value, ['site_id']) && strings(value.period, ['key', 'from', 'to']) && record(value.data) && array(value.data.shifts, r => strings(r, ['date', 'calculated_at']) && ['early', 'day', 'night'].includes(String(r.shift)) && numbers(r, ['numerator', 'denominator', 'percentage'])) && array(value.data.totals, r => strings(r, ['date']) && numbers(r, ['numerator', 'denominator', 'percentage'])); break
    case 'daily_detail_bootstrap': valid = strings(value, ['site_id', 'origin_date']) && dateOnly(value.origin_date) && dailyStockClass(value.stock_class) && value.page_size === 25 && record(value.counts) && countBlock(value.counts.positive) && countBlock(value.counts.zero) && dailyBootstrapViews(value.views, value.counts, value.stock_class); break
    case 'daily_detail_page': valid = strings(value, ['site_id', 'origin_date']) && dateOnly(value.origin_date) && dailyStockClass(value.stock_class) && state(value.state) && Number.isInteger(value.page) && Number(value.page) >= 0 && value.page_size === 25 && dailyRows(value.items, value.state as DifferenceState) && Array.isArray(value.items) && value.items.length <= 25 && unique(value.items, 'case_id'); break
    case 'control_groups': valid = strings(value, ['site_id']) && controlRange(value.period) && array(value.items, r => strings(r, ['case_id', 'group_id', 'group_name', 'category', 'origin_at']) && nullableTime(r.origin_at) && state(r.state) && numbers(r, ['difference', 'valued_difference'])) && unique(value.items, 'group_id') && unique(value.items, 'case_id'); break
    case 'control_chronology_view': valid = strings(value, ['site_id']) && strings(value.group, ['id', 'name']) && record(value.group) && (value.group.category === null || typeof value.group.category === 'string') && nullableNumbers(value.group, ['latest_unit_price']) && controlRange(value.period, true) && chronologyViewRows(value.chronology) && unique(value.chronology, 'row_id'); break
    case 'export': valid = strings(value.site, ['id', 'nombre']) && strings(value.period, ['key', 'from', 'to']) && numbers(value.summary, ['total', 'coincide', 'pending_recount', 'confirmed', 'inconsistent']) && [value.adjustments, value.pending_recount, value.inconsistent, value.all].every(rows); break
  }
  if (valid) {
    const requiredRevisions = action === 'bootstrap' ? ['groups', 'catalog'] : action === 'dashboard_cards' ? ['groups'] : action === 'shift_grid' || action === 'export' ? ['operational', 'groups'] : ['operational']
    valid = numbers(value.revisions, requiredRevisions)
    if (action === 'export') valid = valid && array(value.adjustments, exportResult) && array(value.all, r => exportResult(r) && nullableTime(r.recontado_at)) && array(value.pending_recount, r => exportBase(r) && numbers(r, ['teorico_conteo', 'fisico_conteo', 'diferencia']) && nullableNumbers(r, ['stock_posterior'])) && array(value.inconsistent, r => exportBase(r) && r.estado === 'Inconsistente' && numbers(r, ['teorico_conteo', 'fisico_conteo', 'diferencia_conteo']) && nullableNumbers(r, ['teorico_reconteo', 'fisico_reconteo', 'diferencia_reconteo']))
  }
  if (!valid) throw new Error(`Respuesta ${action} incompatible con contrato v2.`)
  return value as unknown as AdminResponses[A]
}
export async function adminRpc<A extends AdminAction>(action: A, payload: AdminPayloads[A]): Promise<AdminResponses[A]> {
  validateControlPayload(action, payload)
  if (!supabase) throw createSologConfigurationError()
  const rpc = action === 'bootstrap' ? 'rpc_solog_admin_bootstrap_v2' : action === 'export' ? 'rpc_solog_control_export_v2' : 'rpc_solog_operational_v2'
  const args = action === 'bootstrap' || action === 'export' ? { p_payload: payload } : { p_action: action, p_payload: payload }
  const { data, error } = await supabase.rpc(rpc, args)
  if (error) throw normalizeSologError(error)
  return validateAdminResponse(action, data)
}
