import { supabase } from '../../../lib/supabase'
import { createSologConfigurationError, normalizeSologError, SologApiError } from '../errors'
import {
  cashierHistoryDate, parseCashierHistory,
  type CashierHistory, type CashierHistoryPeriod, type CashierHistoryItem,
} from './cajero.history'

export type CashierHistoryCondition = { if_date: string; if_etag: string }
export type CashierHistoryV3 =
  | {
    contract_version: 3; generated_at: string; period: CashierHistoryPeriod; date: string
    status: 'full'; etag: string; revisions: { operational: number }; items: CashierHistoryItem[]
  }
  | {
    contract_version: 3; generated_at: string; period: CashierHistoryPeriod; date: string
    status: 'not_modified'; etag: string; revisions: { operational: number }; items: null
  }

const etagPattern = /^[0-9a-f]{64}$/

export function parseCashierHistoryV3(value: unknown, period: CashierHistoryPeriod): CashierHistoryV3 {
  const fail = (): never => { throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const r = value as Record<string, unknown>
  const generatedAt = typeof r.generated_at === 'string' ? Date.parse(r.generated_at) : Number.NaN
  const revisions = r.revisions as { operational?: unknown } | null
  if (r.contract_version !== 3 || r.period !== period ||
    !Number.isFinite(generatedAt) || r.date !== cashierHistoryDate(generatedAt, period) ||
    typeof r.etag !== 'string' || !etagPattern.test(r.etag) ||
    !revisions || !Number.isSafeInteger(revisions.operational) ||
    (revisions.operational as number) < 0) return fail()

  if (r.status === 'not_modified') {
    if (r.items !== null) return fail()
    return r as unknown as CashierHistoryV3
  }
  if (r.status !== 'full' || !Array.isArray(r.items)) return fail()
  // La proyección de filas de V3 conserva íntegramente el contrato V2.
  parseCashierHistory({ ...r, contract_version: 2 }, period)
  return r as unknown as CashierHistoryV3
}

export async function fetchCashierHistoryV3(
  period: CashierHistoryPeriod, condition: CashierHistoryCondition | null = null,
): Promise<CashierHistoryV3> {
  if (!supabase) throw createSologConfigurationError()
  const { data, error } = await supabase.rpc('rpc_solog_cashier_history_v3', {
    p_payload: { period, ...(condition ?? {}) },
  })
  if (error) throw normalizeSologError(error)
  return parseCashierHistoryV3(data, period)
}

type Entry = { etag: string; date: string; history: CashierHistory; validatedAt: string }
type HistoryFetcher = (
  period: CashierHistoryPeriod, condition: CashierHistoryCondition | null,
) => Promise<CashierHistoryV3>

/**
 * Caché condicional independiente del runtime V4 y de su revisión operacional.
 * Vive únicamente durante la tenencia del propietario Full y nunca persiste datos.
 */
export class CashierFullHistorySync {
  private scope: string | null = null
  private generation = 0
  private entries = new Map<CashierHistoryPeriod, Entry>()
  private pending = new Map<CashierHistoryPeriod, Promise<CashierHistory>>()

  constructor(
    private readonly getScope: () => string | null,
    private readonly serverNow: () => number | null,
    private readonly fetcher: HistoryFetcher = fetchCashierHistoryV3,
  ) {}

  private ensureScope(): string | null {
    const scope = this.getScope()
    if (scope !== this.scope) {
      this.entries.clear()
      this.pending.clear()
      this.generation++
      this.scope = scope
    }
    return scope
  }

  private entry(period: CashierHistoryPeriod): Entry | null {
    const stored = this.entries.get(period)
    if (!stored) return null
    const now = this.serverNow()
    if (now !== null && Number.isFinite(now) && stored.date !== cashierHistoryDate(now, period)) {
      this.entries.delete(period)
      return null
    }
    return stored
  }

  getCachedHistory = (period: CashierHistoryPeriod): CashierHistory | null => {
    if (!this.ensureScope()) return null
    return this.entry(period)?.history ?? null
  }

  clear = (): void => {
    this.entries.clear()
    this.pending.clear()
    this.scope = null
    this.generation++
  }

  syncHistory = (period: CashierHistoryPeriod): Promise<CashierHistory> => {
    const scope = this.ensureScope()
    if (!scope) return Promise.reject(new Error('FULL_HISTORY_CONTEXT_UNAVAILABLE'))
    const pending = this.pending.get(period)
    if (pending) return pending

    const generation = this.generation
    const previous = this.entry(period)
    const matchesScope = () => this.ensureScope() === scope && this.generation === generation
    const apply = (response: CashierHistoryV3): CashierHistory => {
      if (!matchesScope()) throw new Error('FULL_HISTORY_CONTEXT_CHANGED')
      if (response.status !== 'full') throw new Error('FULL_HISTORY_RELOAD_REQUIRED')
      const history = parseCashierHistory({ ...response, contract_version: 2 }, period)
      this.entries.set(period, {
        etag: response.etag, date: response.date, history, validatedAt: response.generated_at,
      })
      return history
    }

    const request = (async () => {
      const condition = previous
        ? { if_date: previous.date, if_etag: previous.etag }
        : null
      const response = await this.fetcher(period, condition)
      if (!matchesScope()) throw new Error('FULL_HISTORY_CONTEXT_CHANGED')

      if (response.status === 'full') return apply(response)
      const stillCached = this.entry(period)
      if (stillCached && stillCached === previous &&
        stillCached.date === response.date && stillCached.etag === response.etag) {
        // Reutilizar las filas, sin volver a materializar el historial en el cliente.
        stillCached.validatedAt = response.generated_at
        stillCached.history = {
          ...stillCached.history,
          generated_at: response.generated_at,
          revisions: response.revisions,
        }
        return stillCached.history
      }
      // Una respuesta not_modified sin base idéntica nunca equivale a lista vacía.
      const recovery = await this.fetcher(period, null)
      return apply(recovery)
    })()

    this.pending.set(period, request)
    void request.finally(() => {
      if (this.pending.get(period) === request) this.pending.delete(period)
    }).catch(() => { /* El consumidor de syncHistory recibe el error original. */ })
    return request
  }
}
