import { describe, expect, test } from 'bun:test'
import {
  CashierFullHistorySync, parseCashierHistoryV3,
  type CashierHistoryCondition, type CashierHistoryV3,
} from '../src/features/solog/cajero/cajero.full-history'
import { cashierHistoryDate, type CashierHistoryPeriod, type CashierHistoryItem } from '../src/features/solog/cajero/cajero.history'

const now = Date.parse('2026-11-20T20:00:00.000Z')
const date = cashierHistoryDate(now)
const yesterday = cashierHistoryDate(now, 'yesterday')
const etagA = 'a'.repeat(64), etagB = 'b'.repeat(64)
const item = (difference = 3): CashierHistoryItem => ({
  detalle_id: 'detalle-1', grupo_id: 'grupo-1', grupo: 'Grupo de prueba', categoria: 'Cervezas',
  stock_teorico: 10, stock_fisico: 13, diferencia: difference, precio: 5,
  valor_diferencia: difference * 5, estado_diferencia: 'Recontar',
  contado_at: '2026-11-20T20:00:00.000Z', recontado_at: null,
  snapshot_referencia_id: null, primer_snapshot_posterior_id: null,
  snapshot_posterior_id: null, snapshot_reconteo_id: null,
  stock_posterior: null, stock_teorico_reconteo: null, stock_reconteo: null,
  motivo_diferencia: null, observacion_diferencia: null, observacion_reconteo: null,
})
const full = (period: CashierHistoryPeriod = 'today', items: CashierHistoryItem[] = [item()],
  etag = etagA, generated_at = new Date(now).toISOString()): CashierHistoryV3 => ({
  contract_version: 3, generated_at, period, date: cashierHistoryDate(Date.parse(generated_at), period),
  status: 'full', etag, revisions: { operational: 5 }, items,
})
const unchanged = (period: CashierHistoryPeriod = 'today', etag = etagA): CashierHistoryV3 => ({
  ...full(period, [], etag), status: 'not_modified', items: null,
})
type Call = { period: CashierHistoryPeriod; condition: CashierHistoryCondition | null }

describe('SOLOG Full A3 — contrato RPC V3', () => {
  test('valida full, vacíos y not_modified con filas nulas', () => {
    expect(parseCashierHistoryV3(full(), 'today').status).toBe('full')
    expect(parseCashierHistoryV3(full('yesterday', []), 'yesterday').status).toBe('full')
    expect(parseCashierHistoryV3(unchanged(), 'today').status).toBe('not_modified')
    for (const invalid of [
      { ...full(), contract_version: 2 },
      { ...full(), etag: 'xxx' },
      { ...full(), date: yesterday },
      { ...full(), period: 'yesterday' },
      { ...full(), revisions: { operational: -1 } },
      { ...full(), items: null },
      { ...unchanged(), items: [] },
      { ...full(), items: [item(), item()] },
      { ...full(), items: [{ ...item(), estado_diferencia: 'valor no admitido' }] },
    ]) expect(() => parseCashierHistoryV3(invalid, 'today')).toThrow()
  })

  test('primera consulta full, reabrir not_modified preserva filas, siguiente cambio reemplaza', async () => {
    const calls: Call[] = []
    let response = full()
    const sync = new CashierFullHistorySync(
      () => 'user:device:site', () => now,
      async (period, condition) => { calls.push({ period, condition }); return response },
    )
    const first = await sync.syncHistory('today')
    expect(first.items).toEqual([item()])
    expect(calls).toEqual([{ period: 'today', condition: null }])
    response = unchanged()
    const second = await sync.syncHistory('today')
    expect(second.items).toBe(first.items)
    expect(calls[1]).toEqual({ period: 'today', condition: { if_date: date, if_etag: etagA } })
    response = full('today', [item(8)], etagB)
    const third = await sync.syncHistory('today')
    expect(third.items[0].diferencia).toBe(8)
    expect(third.items).not.toBe(first.items)
    expect(calls[2].condition?.if_etag).toBe(etagA)
    response = full('today', [], 'c'.repeat(64))
    expect((await sync.syncHistory('today')).items).toEqual([])
    expect(sync.getCachedHistory('today')?.items).toEqual([])
  })

  test('Hoy y Ayer poseen entradas separadas y ambos se revalidan al volver', async () => {
    const calls: Call[] = []
    const sync = new CashierFullHistorySync(
      () => 'user:device:site', () => now,
      async (period, condition) => {
        calls.push({ period, condition })
        return condition ? unchanged(period) : full(period, [], etagA)
      },
    )
    await sync.syncHistory('today')
    await sync.syncHistory('yesterday')
    await sync.syncHistory('today')
    await sync.syncHistory('yesterday')
    expect(calls.map(c => c.condition === null)).toEqual([true, true, false, false])
    expect(calls[2].condition).toEqual({ if_date: date, if_etag: etagA })
    expect(calls[3].condition).toEqual({ if_date: yesterday, if_etag: etagA })
  })

  test('deduplica concurrencia del mismo período, sin consultas por cambios visuales', async () => {
    let done!: (result: CashierHistoryV3) => void
    let calls = 0
    const sync = new CashierFullHistorySync(() => 'scope', () => now, async () => {
      calls++
      return new Promise<CashierHistoryV3>(resolve => { done = resolve })
    })
    const a = sync.syncHistory('today')
    const b = sync.syncHistory('today')
    expect(a).toBe(b)
    expect(calls).toBe(1)
    expect(sync.getCachedHistory('today')).toBeNull()
    done(full())
    await a
    expect(sync.getCachedHistory('today')?.items.length).toBe(1)
    expect(calls).toBe(1)
  })

  test('error conserva caché previa, pero no se declara revalidada', async () => {
    let fails = false
    const sync = new CashierFullHistorySync(
      () => 'scope', () => now, async () => {
        if (fails) throw new Error('Sin conexión')
        return full()
      },
    )
    const previous = await sync.syncHistory('today')
    fails = true
    await expect(sync.syncHistory('today')).rejects.toThrow('Sin conexión')
    expect(sync.getCachedHistory('today')).toBe(previous)
  })

  test('cambio de usuario/sede o pérdida de tenencia descartan respuestas en vuelo', async () => {
    let scope = 'user-a:device-a:site-a'
    let done!: (result: CashierHistoryV3) => void
    const sync = new CashierFullHistorySync(() => scope, () => now, async () =>
      new Promise<CashierHistoryV3>(resolve => { done = resolve }),
    )
    const ongoing = sync.syncHistory('today')
    scope = 'user-b:device-b:site-b'
    expect(sync.getCachedHistory('today')).toBeNull()
    done(full())
    await expect(ongoing).rejects.toThrow('FULL_HISTORY_CONTEXT_CHANGED')
    expect(sync.getCachedHistory('today')).toBeNull()
    sync.clear()
  })

  test('no acepta not_modified sin caché y recupera con una sola lectura full', async () => {
    const conditions: (CashierHistoryCondition | null)[] = []
    let clock = now
    const sync = new CashierFullHistorySync(
      () => 'scope', () => clock,
      async (period, condition) => {
        conditions.push(condition)
        if (conditions.length === 1) return full()
        if (conditions.length === 2) {
          clock = Date.parse('2026-11-21T20:00:00.000Z')
          return unchanged()
        }
        return full('today', [], etagB, '2026-11-21T20:00:00.000Z')
      },
    )
    await sync.syncHistory('today')
    const result = await sync.syncHistory('today')
    expect(result.items).toEqual([])
    expect(result.date).toBe('2026-11-21')
    expect(conditions).toEqual([null, { if_date: date, if_etag: etagA }, null])
  })
})
