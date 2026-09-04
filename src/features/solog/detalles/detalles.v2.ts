import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError, SologApiError } from '../errors'
import type { SologDifferenceState } from '../types'

export type DetailsPeriod = 'today' | 'yesterday'
export type DetailsExportPeriod = 'current_biweekly' | 'previous_biweekly'
interface Envelope { contract_version: 2; generated_at: string }
export interface DetailsSummary extends Envelope {
  revisions: { operational: number; devices: number }
  site: { id: string; nombre: string }
  summary: {
    periodo: { desde: string; hasta: string; inaugurada: boolean; grupos_contados: number; grupos_totales: number; pendientes: number; porcentaje: number; completa: boolean }
    diaria: { fecha: string; grupos_requeridos: number; grupos_verificados: number; pendientes: number; porcentaje: number; sin_requerimientos: boolean }
    conteo_diario_pendientes: number; revisar_pendientes: number
    ultimo_snapshot: { id: string; capturado_at: string; confirmado_at: string; version_catalogo: number } | null
  }
  access: { authorized_device_id: string | null; current_device_id: string | null; current_device_state: string; current_device_matches_site: boolean; can_request: boolean }
}
export interface DetailsHistoryItem {
  case_id: string; grupo_id: string; grupo: string | null; categoria: string | null
  contado_at: string; stock_teorico: number; stock_fisico: number; diferencia: number
  estado_diferencia: SologDifferenceState; valor_diferencia: number; recontado_at: string | null
}
export interface DetailsHistory extends Envelope {
  revisions: { operational: number }; period: DetailsPeriod; date: string
  items: DetailsHistoryItem[]; next_cursor: string | null; page_size: number
}
export interface DetailsCase extends DetailsHistoryItem {
  tipo_grupo: string | null; codigos_internos: number[] | null; snapshot_referencia_id: string | null
  diferencia_inicial: number; primer_snapshot_posterior_id: string | null; snapshot_posterior_id: string | null
  stock_posterior: number | null; snapshot_reconteo_id: string | null; stock_teorico_reconteo: number | null
  stock_reconteo: number | null; diferencia_reconteo: number | null; precio: number
  unidades_por_paquete: number | null; precio_paquete: number | null
}
export interface DetailsDetail extends Envelope {
  revisions: { operational: number }; case: DetailsCase
  skus: { c_interno: number; producto: string | null; marca: string | null; precio_actual: number | null }[]
  chronology: Pick<DetailsHistoryItem, 'case_id' | 'contado_at' | 'estado_diferencia' | 'diferencia' | 'recontado_at'>[]
}
export interface DetailsExportRow {
  case_id: string; fecha_origen: string; grupo: string | null; categoria: string | null
  estado: 'Confirmada' | 'Inconsistente'; teorico: number | null; fisico: number; diferencia: number
  valorizado: number | null; precio: number; unidades_por_paquete: number | null; precio_paquete: number | null; recontado_at: string | null
}
export interface DetailsExport extends Envelope {
  revisions: { operational: number }; site: { id: string; nombre: string }
  period: { key: DetailsExportPeriod; from: string; to: string }
  summary: { diferencias_finales: number; confirmadas: number; inconsistentes: number; faltantes: number; sobrantes: number; valorizado_faltantes: number; valorizado_sobrantes: number }
  rows: DetailsExportRow[]
}
export type DetailsAccess = Envelope & { replay: boolean; revisions: { devices: number } } & (
  { status: 'pending' | 'authorized'; device_id: string } |
  { status: 'site_already_authorized'; authorized_device_id: string }
)
export interface DetailsResponses { summary: DetailsSummary; history: DetailsHistory; detail: DetailsDetail; export: DetailsExport; request_access: DetailsAccess }
export interface DetailsPayloads {
  summary: { device_token?: string }
  history: { period: DetailsPeriod; page_size: number; cursor?: string }
  detail: { case_id: string }
  export: { period: DetailsExportPeriod }
  request_access: { operation_id: string; device_token: string }
}
export type DetailsAction = keyof DetailsResponses
export function detailsDate(now: number, period: DetailsPeriod = 'today') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now - (period === 'yesterday' ? 86400000 : 0))
}
function check(value: unknown): asserts value { if (!value) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE') }
function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) }
function text(value: unknown) { return typeof value === 'string' }
function nullableText(value: unknown) { return value === null || text(value) }
function timestamp(value: unknown) { return text(value) && Number.isFinite(Date.parse(value as string)) }
function nullableNumber(value: unknown) { return value === null || number(value) }
function state(value: unknown) { return ['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'].includes(String(value)) }
function historyItem(value: unknown) {
  const row = record(value)
  check(text(row.case_id) && text(row.grupo_id) && nullableText(row.grupo) && nullableText(row.categoria) && timestamp(row.contado_at))
  check(['stock_teorico', 'stock_fisico', 'diferencia', 'valor_diferencia'].every((k) => number(row[k])))
  check(state(row.estado_diferencia) && (row.recontado_at === null || timestamp(row.recontado_at)))
}
export function parseDetailsResponse<A extends DetailsAction>(action: A, value: unknown): DetailsResponses[A] {
  const r = record(value)
  check(r.contract_version === 2 && timestamp(r.generated_at))
  const revisions = record(r.revisions)
  for (const k of action === 'summary' ? ['operational', 'devices'] : action === 'request_access' ? ['devices'] : ['operational']) {
    check(Number.isSafeInteger(revisions[k]) && Number(revisions[k]) >= 0)
  }
  if (action === 'summary' || action === 'export') {
    const site = record(r.site); check(text(site.id) && text(site.nombre))
  }
  if (action === 'summary') {
    const s = record(r.summary), p = record(s.periodo), d = record(s.diaria), a = record(r.access)
    check(text(p.desde) && text(p.hasta) && typeof p.completa === 'boolean' && typeof p.inaugurada === 'boolean')
    check(['grupos_contados', 'grupos_totales', 'pendientes', 'porcentaje'].every((k) => number(p[k])))
    check(text(d.fecha) && typeof d.sin_requerimientos === 'boolean' && ['grupos_requeridos', 'grupos_verificados', 'pendientes', 'porcentaje'].every((k) => number(d[k])))
    check(number(s.conteo_diario_pendientes) && number(s.revisar_pendientes))
    if (s.ultimo_snapshot !== null) {
      const snapshot = record(s.ultimo_snapshot)
      check(text(snapshot.id) && timestamp(snapshot.capturado_at) && timestamp(snapshot.confirmado_at) && number(snapshot.version_catalogo))
    }
    check(nullableText(a.authorized_device_id) && nullableText(a.current_device_id) && text(a.current_device_state) &&
      typeof a.current_device_matches_site === 'boolean' && typeof a.can_request === 'boolean')
  } else if (action === 'history') {
    check(r.period === 'today' || r.period === 'yesterday')
    check(r.date === detailsDate(Date.parse(String(r.generated_at)), r.period))
    check(Number.isInteger(r.page_size) && Number(r.page_size) >= 1 && Number(r.page_size) <= 100 &&
      Array.isArray(r.items) && r.items.length <= Number(r.page_size) && nullableText(r.next_cursor))
    const ids = new Set()
    for (const item of r.items) {
      historyItem(item)
      const row = record(item)
      check(!ids.has(row.case_id) && detailsDate(Date.parse(String(row.contado_at))) === r.date)
      ids.add(row.case_id)
    }
  } else if (action === 'detail') {
    historyItem(r.case)
    const c = record(r.case)
    check(nullableText(c.tipo_grupo) && (c.codigos_internos === null || (Array.isArray(c.codigos_internos) && c.codigos_internos.every(Number.isInteger))))
    check(['stock_posterior', 'stock_teorico_reconteo', 'stock_reconteo', 'diferencia_reconteo', 'unidades_por_paquete', 'precio_paquete'].every((k) => nullableNumber(c[k])))
    check(['snapshot_referencia_id', 'primer_snapshot_posterior_id', 'snapshot_posterior_id', 'snapshot_reconteo_id'].every((k) => nullableText(c[k])))
    check(number(c.diferencia_inicial) && number(c.precio) && Array.isArray(r.skus) && Array.isArray(r.chronology))
    for (const value of r.skus) { const sku = record(value); check(Number.isInteger(sku.c_interno) && nullableText(sku.producto) && nullableText(sku.marca) && nullableNumber(sku.precio_actual)) }
    for (const value of r.chronology) { const event = record(value); check(text(event.case_id) && timestamp(event.contado_at) && state(event.estado_diferencia) && number(event.diferencia) && (event.recontado_at === null || timestamp(event.recontado_at))) }
  } else if (action === 'export') {
    const p = record(r.period), s = record(r.summary)
    check(['current_biweekly', 'previous_biweekly'].includes(String(p.key)) && text(p.from) && text(p.to) && Array.isArray(r.rows))
    check(['diferencias_finales', 'confirmadas', 'inconsistentes', 'faltantes', 'sobrantes', 'valorizado_faltantes', 'valorizado_sobrantes'].every((k) => number(s[k])))
    for (const value of r.rows) {
      const row = record(value)
      check(text(row.case_id) && timestamp(row.fecha_origen) && nullableText(row.grupo) && nullableText(row.categoria))
      check(['Confirmada', 'Inconsistente'].includes(String(row.estado)) && ['fisico', 'diferencia', 'precio'].every((k) => number(row[k])))
      check(['teorico', 'valorizado', 'unidades_por_paquete', 'precio_paquete'].every((k) => nullableNumber(row[k])))
      check(row.recontado_at === null || timestamp(row.recontado_at))
      if (row.estado === 'Inconsistente') check(row.valorizado === null)
    }
    check(s.diferencias_finales === r.rows.length)
    check(s.confirmadas === r.rows.filter((row) => record(row).estado === 'Confirmada').length &&
      s.inconsistentes === r.rows.filter((row) => record(row).estado === 'Inconsistente').length)
  } else {
    check(typeof r.replay === 'boolean')
    if (r.status === 'site_already_authorized') check(text(r.authorized_device_id))
    else check((r.status === 'pending' || r.status === 'authorized') && text(r.device_id))
  }
  return value as DetailsResponses[A]
}
export async function detailsRpc<A extends DetailsAction>(action: A, payload: DetailsPayloads[A]): Promise<DetailsResponses[A]> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_details_v2', { p_action: action, p_payload: payload })
  if (error) throw normalizeSologError(error)
  return parseDetailsResponse(action, data)
}
