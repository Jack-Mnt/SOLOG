import { describe, expect, test } from 'bun:test'
import { cashierHistoryDate, CashierHistoryCache, parseCashierHistory, type CashierHistory, type CashierHistoryPeriod } from '../src/features/solog/cajero/cajero.history'
import { getCajeroStockPresentation, getCashierStockPresentation } from '../src/features/solog/cajero/cajero.stock'
import { CashierStore } from '../src/features/solog/cajero/cajero.v2.store'
import { parseCashierBootstrap } from '../src/features/solog/cajero/cajero.v2.api'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
const now = Date.parse('2026-09-03T20:30:00Z')
function history(period: CashierHistoryPeriod = 'today', revision = 10): CashierHistory {
  return { contract_version: 2, generated_at: new Date(now).toISOString(), period,
    date: cashierHistoryDate(now, period), items: [], revisions: { operational: revision } }
}
describe('C4 historial V4', () => {
  test('contrato exacto, sin wrapper, fechas Lima, solo revisión operational', () => {
    expect(parseCashierHistory(history(), 'today').items).toEqual([])
    expect(() => parseCashierHistory({ data: history() }, 'today')).toThrow()
    expect(() => parseCashierHistory({ ...history(), contract_version: 1 }, 'today')).toThrow()
    expect(() => parseCashierHistory(history('yesterday'), 'today')).toThrow()
    expect(() => parseCashierHistory({ ...history(), date: '2026-09-02' }, 'today')).toThrow()
    expect(cashierHistoryDate(Date.parse('2026-09-04T04:59:59Z'))).toBe('2026-09-03')
    expect(cashierHistoryDate(Date.parse('2026-09-04T05:00:00Z'))).toBe('2026-09-04')
  })
  test('deduplica, reutiliza y no pagina; save invalida únicamente fecha afectada', async () => {
    const cache = new CashierHistoryCache()
    cache.invalidate(10)
    let calls = 0
    const fetcher = async (p: CashierHistoryPeriod) => { calls++; return history(p) }
    await Promise.all([cache.load('today', () => now, fetcher), cache.load('today', () => now, fetcher)])
    await cache.load('yesterday', () => now, fetcher)
    await cache.load('today', () => now, fetcher)
    expect(calls).toBe(2)
    cache.invalidate(11, new Set(['2026-09-03']))
    expect(cache.get('today', now)).toBeNull()
    expect(cache.get('yesterday', now)?.date).toBe('2026-09-02')
    cache.invalidate(12, new Set()) // start/finish no modifican observaciones
    expect(cache.get('yesterday', now)).not.toBeNull()
  })
  test('reconteo invalida la fecha de origen, no su fecha de captura nueva', async () => {
    const cache = new CashierHistoryCache()
    cache.invalidate(10)
    await cache.load('today', () => now, async () => history())
    await cache.load('yesterday', () => now, async () => ({ ...history('yesterday'), items: [{ detalle_id: 'origin' }] as CashierHistory['items'] }))
    cache.invalidate(11, undefined, 'origin')
    expect(cache.get('yesterday', now)).toBeNull()
    expect(cache.get('today', now)).not.toBeNull()
  })
  test('descarta respuestas tardías tras logout/revocación o mutación', async () => {
    for (const invalidate of [(cache: CashierHistoryCache) => cache.clear(), (cache: CashierHistoryCache) => cache.invalidate(11)]) {
      const cache = new CashierHistoryCache()
      let resolve!: (r: CashierHistory) => void
      const pending = cache.load('today', () => now, () => new Promise((r) => { resolve = r }))
      invalidate(cache)
      resolve(history())
      await expect(pending).rejects.toThrow()
      expect(cache.get('today', now)).toBeNull()
    }
  })
  test('medianoche no reutiliza Hoy/Ayer de otra fecha; error permite reintentar', async () => {
    const cache = new CashierHistoryCache()
    await expect(cache.load('today', () => now, async () => { throw new Error('offline') })).rejects.toThrow()
    await cache.load('today', () => now, async () => history())
    expect(cache.get('today', now + 86400000)).toBeNull()
    const other = new CashierHistoryCache()
    expect(other.get('today', now)).toBeNull()
  })
  test('rechaza revisión obsoleta y detecta revisión externa sin reemplazar KPI', async () => {
    const cache = new CashierHistoryCache()
    cache.invalidate(11)
    await expect(cache.load('today', () => now, async () => history())).rejects.toThrow()
    await cache.load('today', () => now, async () => history('today', 11))
    await cache.load('yesterday', () => now, async () => history('yesterday', 12))
    expect(cache.get('today', now)).toBeNull()
  })
  test('no quedan llamadas Cajero v1', async () => {
    for await (const path of new Bun.Glob('src/features/solog/cajero/*.{ts,tsx}').scan('.')) {
      expect(await Bun.file(path).text()).not.toMatch(/rpc_solog_count|rpc_solog_state|callSologRpc/)
    }
  })
})
describe('C4 tiempo y expiración', () => {
  test('retry de intención comprometida conserva UUID al expirar y reemplaza KPI una sola vez', async () => {
    const b = parseCashierBootstrap(cashierFixture())
    const state = startedFixture()
    b.panel_state = { ...state, basis: b.panel_state.basis, source: 'session', frozen: true }
    const payloads: Record<string, unknown>[] = []
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => b,
      mutate: async (action, payload) => {
        payloads.push(payload)
        if (payloads.length === 1) throw new Error('respuesta perdida')
        return { contract_version: 2, generated_at: b.server_now, action, replay: true,
          conteo_id: state.session.id, revisions: b.revisions, state }
      },
    })
    await store.refresh()
    await expect(store.mutate('save_batch', { items: [{ grupo_id: 'group-1', stock_fisico: 9, contado_at: b.server_now }] })).rejects.toThrow()
    store.serverOffsetMs += 3 * 3600000
    const offset = store.serverOffsetMs
    await store.retryPending()
    expect(payloads[0]).toEqual(payloads[1])
    expect(store.hasPendingIntent).toBe(false)
    expect(store.serverOffsetMs).toBe(offset)
    expect(store.bootstrap?.panel_state.kpis).toEqual(state.kpis)
  })
  test('fronteras 90/110/117 y vencimiento autoritativo', () => {
    const stock = { snapshot_at: new Date(now).toISOString(), snapshot_expira_at: new Date(now + 120 * 60000).toISOString(), disponible: true, vigente: true }
    const session = { expira_at: stock.snapshot_expira_at }
    for (const [minutes, state] of [[90, 'updated'], [90.01, 'near_expiry'], [110, 'near_expiry'], [110.01, 'critical'], [117, 'countdown'], [120, 'expired']] as const) {
      expect(getCajeroStockPresentation(stock, session, now + minutes * 60000).state).toBe(state)
    }
    expect(getCajeroStockPresentation(stock, session, now + 117 * 60000).countdown).toBe('03:00')
  })
  test('nuevo snapshot no extiende sesión congelada', () => {
    const b = parseCashierBootstrap(cashierFixture())
    const state = startedFixture()
    b.panel_state = { ...state, basis: b.panel_state.basis, source: 'session', frozen: true }
    b.start_capability.snapshot_id = 'newer'
    const expiry = Date.parse(state.session.expira_at)
    expect(getCashierStockPresentation(b, expiry - 60000).countdown).toBe('01:00')
    expect(getCashierStockPresentation(b, expiry).state).toBe('expired')
  })
  test('bloquea nuevas escrituras vencidas pero permite finish', async () => {
    let calls = 0
    const b = parseCashierBootstrap(cashierFixture())
    const state = startedFixture()
    state.session.expira_at = b.server_now
    b.panel_state = { ...state, basis: b.panel_state.basis, source: 'session', frozen: true }
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => b,
      mutate: async (action) => { calls++; return { contract_version: 2, generated_at: b.server_now, action, replay: false, conteo_id: state.session.id, revisions: b.revisions, state } },
    })
    await store.refresh()
    await expect(store.mutate('recount_start', { detalle_id: 'origin' })).rejects.toMatchObject({ code: 'SOLOG_SESSION_EXPIRED' })
    expect(calls).toBe(0)
    await store.mutate('finish')
    expect(calls).toBe(1)
  })
})
