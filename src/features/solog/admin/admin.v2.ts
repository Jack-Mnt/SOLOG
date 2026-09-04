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
export interface DailyDetail extends Envelope {
  site_id: string; origin_date: string
  summary: { pending_recount: number; confirmed: number; inconsistent: number }
  items: { case_id: string; grupo_id: string; grupo: string; estado: DifferenceState; contado_at: string; recontado_at: string | null; theoretical: number; physical: number; difference: number; value: number | null; source: 'initial' | 'posterior' | 'recount' }[]
}
export interface StateSummary { total: number; coincide: number; pending_recount: number; confirmed: number; inconsistent: number }
export interface ControlPage extends Envelope {
  site_id: string; period: { key: ControlPeriod; from: string; to: string }; summary: StateSummary
  items: { case_id: string; grupo_id: string; grupo: string; categoria: string; contado_at: string; recontado_at: string | null; estado_diferencia: DifferenceState; diferencia: number; valor_diferencia: number | null }[]
  page: number; page_size: number
}
export interface ControlDetail extends Envelope {
  site_id: string; group_id: string
  chronology: { case_id: string; contado_at: string; recontado_at: string | null; stock_teorico: number; stock_fisico: number; diferencia_inicial: number; stock_posterior: number | null; stock_teorico_reconteo: number | null; stock_reconteo: number | null; diferencia: number; estado_diferencia: DifferenceState; valor_diferencia: number | null }[]
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
  daily_detail: { site_id: string; origin_date: string }
  control_page: { site_id: string; period: ControlPeriod; state: DifferenceState | null; search?: string; page: number; page_size: number; date_from?: string; date_to?: string }
  control_detail: { site_id: string; group_id: string }
  export: { site_id: string; period: Biweekly }
}
export interface AdminResponses { bootstrap: AdminBootstrap; dashboard_cards: DashboardCards; shift_grid: ShiftGrid; daily_detail: DailyDetail; control_page: ControlPage; control_detail: ControlDetail; export: ControlExport }
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
    case 'daily_detail': valid = strings(value, ['site_id', 'origin_date']) && numbers(value.summary, ['pending_recount', 'confirmed', 'inconsistent']) && rows(value.items); break
    case 'control_page': valid = strings(value, ['site_id']) && strings(value.period, ['key', 'from', 'to']) && numbers(value.summary, ['total', 'coincide', 'pending_recount', 'confirmed', 'inconsistent']) && rows(value.items) && Number.isInteger(value.page) && Number(value.page) >= 0 && Number.isInteger(value.page_size) && Number(value.page_size) >= 1 && Number(value.page_size) <= 100; break
    case 'control_detail': valid = strings(value, ['site_id', 'group_id']) && rows(value.chronology); break
    case 'export': valid = strings(value.site, ['id', 'nombre']) && strings(value.period, ['key', 'from', 'to']) && numbers(value.summary, ['total', 'coincide', 'pending_recount', 'confirmed', 'inconsistent']) && [value.adjustments, value.pending_recount, value.inconsistent, value.all].every(rows); break
  }
  if (valid) {
    const requiredRevisions = action === 'bootstrap' ? ['groups', 'catalog'] : action === 'dashboard_cards' ? ['groups'] : action === 'shift_grid' || action === 'export' ? ['operational', 'groups'] : ['operational']
    valid = numbers(value.revisions, requiredRevisions)
    if (action === 'daily_detail') valid = valid && array(value.items, r => strings(r, ['case_id', 'grupo_id', 'grupo', 'contado_at']) && state(r.estado) && source(r.source) && numbers(r, ['theoretical', 'physical', 'difference']) && nullableNumbers(r, ['value']) && nullableTime(r.recontado_at))
    if (action === 'control_page') valid = valid && array(value.items, r => strings(r, ['case_id', 'grupo_id', 'grupo', 'categoria', 'contado_at']) && state(r.estado_diferencia) && numbers(r, ['diferencia']) && nullableNumbers(r, ['valor_diferencia']) && nullableTime(r.recontado_at)) && Array.isArray(value.items) && value.items.length <= Number(value.page_size)
    if (action === 'control_detail') valid = valid && array(value.chronology, r => strings(r, ['case_id', 'contado_at']) && nullableTime(r.recontado_at) && state(r.estado_diferencia) && numbers(r, ['stock_teorico', 'stock_fisico', 'diferencia_inicial', 'diferencia']) && nullableNumbers(r, ['stock_posterior', 'stock_teorico_reconteo', 'stock_reconteo', 'valor_diferencia']))
    if (action === 'export') valid = valid && array(value.adjustments, exportResult) && array(value.all, r => exportResult(r) && nullableTime(r.recontado_at)) && array(value.pending_recount, r => exportBase(r) && numbers(r, ['teorico_conteo', 'fisico_conteo', 'diferencia']) && nullableNumbers(r, ['stock_posterior'])) && array(value.inconsistent, r => exportBase(r) && r.estado === 'Inconsistente' && numbers(r, ['teorico_conteo', 'fisico_conteo', 'diferencia_conteo']) && nullableNumbers(r, ['teorico_reconteo', 'fisico_reconteo', 'diferencia_reconteo']))
  }
  if (!valid) throw new Error(`Respuesta ${action} incompatible con contrato v2.`)
  return value as unknown as AdminResponses[A]
}
export async function adminRpc<A extends AdminAction>(action: A, payload: AdminPayloads[A]): Promise<AdminResponses[A]> {
  if (!supabase) throw createSologConfigurationError()
  const rpc = action === 'bootstrap' ? 'rpc_solog_admin_bootstrap_v2' : action === 'export' ? 'rpc_solog_control_export_v2' : 'rpc_solog_operational_v2'
  const args = action === 'bootstrap' || action === 'export' ? { p_payload: payload } : { p_action: action, p_payload: payload }
  const { data, error } = await supabase.rpc(rpc, args)
  if (error) throw normalizeSologError(error)
  return validateAdminResponse(action, data)
}
