import { describe, expect, test } from 'bun:test'
import { DetailsStore } from '../src/features/solog/detalles/detalles.store'
import { detailsRpc, parseDetailsResponse } from '../src/features/solog/detalles/detalles.v2'
import { summaryFixture, historyFixture, detailFixture } from './fixtures/details-v2.mjs'
import { SologApiError } from '../src/features/solog/errors'
describe('D2 paginación y detalle', () => {
  test('error de permisos borra información y un error de caso no concede acceso', async () => {
    let denied = false
    const rpc = (async (action) => {
      if (action === 'summary') return summaryFixture()
      if (denied) throw new SologApiError('SOLOG_OPERATIONAL_ROLE_REQUIRED')
      return historyFixture()
    }) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary(); await store.loadHistory('today')
    denied = true
    await expect(store.loadDetail('case-0')).rejects.toThrow()
    expect(store.summary).toBeNull()
    expect(store.getHistory('today')).toBeNull()
  })
  test('detail de otro case_id y respuesta de revisión inferior se rechazan', async () => {
    const rpc = (async (action) => action === 'summary' ? summaryFixture() : detailFixture(99)) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary()
    await expect(store.loadDetail('case-0')).rejects.toThrow()
    const staleRpc = (async (action) => action === 'summary' ? summaryFixture() : historyFixture('today', 1, 0, 9)) as typeof detailsRpc
    const stale = new DetailsStore('u', 'token', staleRpc); await stale.loadSummary()
    await expect(stale.loadHistory('today')).rejects.toThrow()
  })
  test('100+1, cursor opaco, Hoy/Ayer y caché sin N+1', async () => {
    const calls: { action: string; payload: Record<string, unknown> }[] = []
    const rpc = (async (action, payload) => {
      calls.push({ action, payload })
      if (action === 'summary') return summaryFixture()
      if (action === 'history') return historyFixture(payload.period, payload.period === 'yesterday' ? 0 : payload.cursor ? 1 : 100, payload.cursor ? 100 : 0)
      return detailFixture()
    }) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary()
    await Promise.all([store.loadHistory('today'), store.loadHistory('today')])
    const next = await store.loadHistory('today', true)
    expect(next.pages.flatMap((p) => p.items)).toHaveLength(101)
    expect(calls[2].payload).toEqual({ period: 'today', page_size: 100, cursor: 'opaque+cursor/one=' })
    await store.loadHistory('yesterday'); await store.loadHistory('today')
    await Promise.all([store.loadDetail('case-0'), store.loadDetail('case-0')]); await store.loadDetail('case-0')
    expect(calls.filter((c) => c.action === 'history')).toHaveLength(3)
    expect(calls.filter((c) => c.action === 'detail')).toHaveLength(1)
  })
  test('cursor inválido reinicia primera página sin mezclar revisiones', async () => {
    let revision = 10
    const payloads: Record<string, unknown>[] = []
    const rpc = (async (action, payload) => {
      if (action === 'summary') return summaryFixture()
      payloads.push(payload)
      if (payload.cursor) { revision = 11; throw new SologApiError('SOLOG_PAGE_CURSOR_INVALID') }
      return historyFixture('today', 100, revision === 11 ? 200 : 0, revision)
    }) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary()
    await store.loadHistory('today')
    const entry = await store.loadHistory('today', true)
    expect(entry.pages).toHaveLength(1)
    expect(entry.pages[0].items[0].case_id).toBe('case-200')
    expect(payloads.at(-1)).toEqual({ period: 'today', page_size: 100 })
  })
  test('rechaza páginas duplicadas y tamaños mayores de 100', async () => {
    expect(() => parseDetailsResponse('history', historyFixture('today', 101))).toThrow()
    const rpc = (async (action) => action === 'summary' ? summaryFixture() : historyFixture()) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary(); await store.loadHistory('today')
    await expect(store.loadHistory('today', true)).rejects.toThrow()
  })
  test('respuesta tardía y cache no cruzan usuarios', async () => {
    let resolve!: (value: unknown) => void
    const rpc = ((action) => action === 'summary' ? Promise.resolve(summaryFixture()) : new Promise((r) => { resolve = r })) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary()
    const pending = store.loadHistory('today'); store.dispose(); resolve(historyFixture())
    await expect(pending).rejects.toThrow()
    const other = new DetailsStore('other', 'token', rpc)
    expect(other.getHistory('today')).toBeNull(); expect(store.getHistory('today')).toBeNull()
  })
  test('cambio de sede borra historial/detalle aunque revisión nueva sea menor', async () => {
    let site = 'site-1'
    const rpc = (async (action) => action === 'summary' ? { ...summaryFixture(), site: { id: site, nombre: site }, revisions: { operational: site === 'site-1' ? 10 : 1, devices: 2 } } : historyFixture()) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary(); await store.loadHistory('today')
    site = 'site-2'; await store.loadSummary()
    expect(store.getHistory('today')).toBeNull()
    expect(store.operational).toBe(1)
  })
  test('medianoche Lima no reutiliza la fecha anterior', async () => {
    const rpc = (async (action) => action === 'summary' ? summaryFixture() : historyFixture()) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary(); await store.loadHistory('today')
    store.serverOffsetMs += 86400000
    expect(store.getHistory('today')).toBeNull()
  })
})
