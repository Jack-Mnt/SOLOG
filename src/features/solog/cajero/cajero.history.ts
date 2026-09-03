import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError, SologApiError } from '../errors'
import type { SologDifferenceState } from '../types'

export type CashierHistoryPeriod = 'today' | 'yesterday'
export interface CashierHistoryItem {
  detalle_id: string; grupo_id: string; grupo: string | null; categoria: string | null
  stock_teorico: number; stock_fisico: number; diferencia: number
  precio: number; valor_diferencia: number; estado_diferencia: SologDifferenceState
  contado_at: string; recontado_at: string | null
  snapshot_referencia_id: string | null; primer_snapshot_posterior_id: string | null
  snapshot_posterior_id: string | null; snapshot_reconteo_id: string | null
  stock_posterior: number | null; stock_teorico_reconteo: number | null; stock_reconteo: number | null
}
export interface CashierHistory {
  contract_version: 2; generated_at: string; period: CashierHistoryPeriod
  date: string; items: CashierHistoryItem[]; revisions: { operational: number }
}
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
export function cashierHistoryDate(now: number, period: CashierHistoryPeriod = 'today') {
  return dateFormatter.format(now - (period === 'yesterday' ? 86400000 : 0))
}
export function parseCashierHistory(value: unknown, period: CashierHistoryPeriod): CashierHistory {
  const fail = () => { throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE') }
  if (!value || typeof value !== 'object') return fail()
  const r = value as CashierHistory
  if (r.contract_version !== 2 || r.period !== period || !Number.isFinite(Date.parse(r.generated_at)) ||
    r.date !== cashierHistoryDate(Date.parse(r.generated_at), period) || !Array.isArray(r.items) ||
    !Number.isSafeInteger(r.revisions?.operational) || r.revisions.operational < 0) return fail()
  const ids = new Set<string>()
  for (const item of r.items) {
    if (!item || ['detalle_id', 'grupo_id'].some((k) => typeof item[k as keyof CashierHistoryItem] !== 'string') ||
      ids.has(item.detalle_id) || !Number.isFinite(Date.parse(item.contado_at)) || cashierHistoryDate(Date.parse(item.contado_at)) !== r.date ||
      !['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'].includes(item.estado_diferencia)) return fail()
    for (const key of ['stock_teorico', 'stock_fisico', 'diferencia', 'precio', 'valor_diferencia'] as const) {
      if (typeof item[key] !== 'number' || !Number.isFinite(item[key])) return fail()
    }
    for (const key of ['stock_posterior', 'stock_teorico_reconteo', 'stock_reconteo'] as const) {
      if (item[key] !== null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]))) return fail()
    }
    for (const key of ['grupo', 'categoria', 'snapshot_referencia_id', 'primer_snapshot_posterior_id', 'snapshot_posterior_id', 'snapshot_reconteo_id', 'recontado_at'] as const) {
      if (item[key] !== null && typeof item[key] !== 'string') return fail()
    }
    ids.add(item.detalle_id)
  }
  return r
}
export async function fetchCashierHistory(period: CashierHistoryPeriod): Promise<CashierHistory> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_cashier_history_v2', { p_payload: { period } })
  if (error) throw normalizeSologError(error)
  return parseCashierHistory(data, period)
}

// Una instancia por store autenticado; fechas backend, sin persistencia ni paginación.
export class CashierHistoryCache {
  private entries = new Map<CashierHistoryPeriod, CashierHistory>()
  private requests = new Map<CashierHistoryPeriod, Promise<CashierHistory>>()
  private generation = 0
  private revision = 0
  clear() { this.entries.clear(); this.requests.clear(); this.revision = 0; this.generation++ }
  invalidate(revision: number, dates?: Set<string>, detailId?: string) {
    this.revision = Math.max(this.revision, revision)
    this.requests.clear()
    this.generation++
    for (const [period, response] of this.entries) {
      if ((!dates && !detailId) || dates?.has(response.date) || response.items.some((item) => item.detalle_id === detailId)) this.entries.delete(period)
    }
  }
  get(period: CashierHistoryPeriod, now: number) {
    const entry = this.entries.get(period)
    return entry?.date === cashierHistoryDate(now, period) ? entry : null
  }
  async load(period: CashierHistoryPeriod, now: () => number, fetcher = fetchCashierHistory) {
    const cached = this.get(period, now())
    if (cached) return cached
    const existing = this.requests.get(period)
    if (existing) return existing
    const generation = this.generation
    const request = fetcher(period).then((response) => {
      if (generation !== this.generation || response.revisions.operational < this.revision ||
        response.date !== cashierHistoryDate(now(), period)) throw new Error('El contexto del historial cambió. Vuelve a consultar el período.')
      // Una lectura puede detectar cambios externos que no proceden de nuestra mutación.
      if (response.revisions.operational > this.revision) this.invalidate(response.revisions.operational)
      this.entries.set(period, response)
      return response
    }).finally(() => { if (this.requests.get(period) === request) this.requests.delete(period) })
    this.requests.set(period, request)
    return request
  }
}
