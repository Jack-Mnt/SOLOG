import { describe, expect, test } from 'bun:test'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
import { parseCashierBootstrap, parseCashierMutation } from '../src/features/solog/cajero/cajero.v2.api'
import { CashierStore } from '../src/features/solog/cajero/cajero.v2.store'
import { SologApiError } from '../src/features/solog/errors'
import { clearCajeroMemory, readCajeroExpressionDrafts, setCajeroExpressionDraft } from '../src/features/solog/cajero/cajero.storage'
import type { CashierMutation } from '../src/features/solog/cajero/cajero.v2'

function response(action = 'start', operational = 11) {
  return { contract_version: 2, generated_at: '2026-09-03T20:31:00Z', action, replay: false,
    conteo_id: 'session-1',
    revisions: { groups: 7, devices: 2, operational }, state: startedFixture() } as CashierMutation
}
describe('C1 contrato V4', () => {
  test('panel pre-sesión autoritativo sin session_state', () => {
    const parsed = parseCashierBootstrap(cashierFixture())
    expect(parsed.panel_state.source).toBe('pre_session')
    expect(parsed.panel_state.kpis.coverage_percent).toBe(50)
    expect(parsed.session_state).toBeNull()
  })
  test('rechaza versión, wrapper genérico y colas inconsistentes', () => {
    expect(() => parseCashierBootstrap({ ...cashierFixture(), contract_version: 1 })).toThrow()
    expect(() => parseCashierBootstrap({ data: cashierFixture() })).toThrow()
    const fixture = cashierFixture()
    fixture.panel_state.count_queue = ['inexistente']
    expect(() => parseCashierBootstrap(fixture)).toThrow()
  })
  test('rechaza estado no congelado presentado como sesión', () => {
    const fixture = cashierFixture()
    fixture.panel_state.source = 'session'
    expect(() => parseCashierBootstrap(fixture)).toThrow()
  })
  test('deduplica bootstrap concurrente y verifica identidad', async () => {
    let calls = 0
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => { calls++; return parseCashierBootstrap(cashierFixture()) },
      mutate: async () => response(),
    })
    await Promise.all([store.refresh(), store.refresh()])
    expect(calls).toBe(1)
    expect(store.bootstrap?.panel_state.kpis.groups_total).toBe(2)
    const other = new CashierStore('other', 'token', () => {}, { bootstrap: async () => parseCashierBootstrap(cashierFixture()), mutate: async () => response() })
    await expect(other.refresh()).rejects.toThrow()
  })
})
describe('C2 memoria y scopes', () => {
  test('borrador aislado y borrado sin persistencia', () => {
    const scope = { usuario_id: 'user-1', sede_id: 'site-1', dispositivo_id: 'device-1', conteo_id: 'session-1' }
    clearCajeroMemory()
    setCajeroExpressionDraft(scope, 'group-1', '3+4')
    expect(readCajeroExpressionDrafts(scope).items[0].expresion).toBe('3+4')
    expect(readCajeroExpressionDrafts({ ...scope, usuario_id: 'other' }).items).toEqual([])
    clearCajeroMemory()
    expect(readCajeroExpressionDrafts(scope).items).toEqual([])
  })
  test('descarta bootstrap tardío tras abandonar scope', async () => {
    let resolve!: (value: ReturnType<typeof parseCashierBootstrap>) => void
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: () => new Promise((r) => { resolve = r }), mutate: async () => response(),
    })
    const request = store.refresh()
    store.dispose()
    resolve(parseCashierBootstrap(cashierFixture()))
    await request
    expect(store.bootstrap).toBeNull()
  })
})
describe('C3 intención y respuesta autoritativa', () => {
  test('start envía solo operación/dispositivo y reemplaza proyección', async () => {
    let payload: Record<string, unknown> = {}
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()),
      mutate: async (_action, input) => { payload = input; return response() },
    })
    await store.refresh()
    await store.mutate('start')
    expect(Object.keys(payload).sort()).toEqual(['device_token', 'operation_id'])
    expect(store.bootstrap?.panel_state.frozen).toBe(true)
    expect(store.bootstrap?.panel_state.session?.id).toBe('session-1')
  })
  test('allowed=false impide start sin RPC de escritura', async () => {
    let calls = 0
    const b = cashierFixture(); b.start_capability.allowed = false; b.start_capability.reason = 'SOLOG_STOCK_EXPIRED'
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(b), mutate: async () => { calls++; return response() },
    })
    await store.refresh()
    await expect(store.mutate('start')).rejects.toThrow()
    expect(calls).toBe(0)
  })
  test('timeout conserva operation_id y bloquea otra intención; replay reemplaza KPI', async () => {
    const payloads: Record<string, unknown>[] = []
    let attempt = 0
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()),
      mutate: async (_action, payload) => { payloads.push(payload); if (++attempt === 1) throw new Error('timeout'); return { ...response(), replay: true } },
    })
    await store.refresh()
    await expect(store.mutate('start')).rejects.toThrow('timeout')
    const clockOffset = store.serverOffsetMs
    await expect(store.mutate('finish')).rejects.toThrow('pendiente')
    await store.mutate('start')
    expect(payloads[1]).toEqual(payloads[0])
    expect(store.serverOffsetMs).toBe(clockOffset)
    expect(store.bootstrap?.panel_state.kpis.coverage_counted).toBe(1)
  })
  test('batch usa revisión congelada y acepta KPI completos sin incrementos locales', async () => {
    let payload: Record<string, unknown> = {}
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()),
      mutate: async (action, input) => {
        payload = input
        if (action === 'start') return response()
        const r = response('save_batch', 12)
        r.state!.kpis = { groups_total: 2, coverage_counted: 2, coverage_percent: 100, count_pending: 0, review_pending: 1 }
        return r
      },
    })
    await store.refresh(); await store.mutate('start')
    await store.mutate('save_batch', { items: [{ grupo_id: 'group-1', stock_fisico: 9, client_observation_id: 'observation-1', contado_at: '2026-09-03T20:31:00Z' }] })
    expect(payload.expected_groups_revision).toBe(7)
    expect(payload.conteo_id).toBe('session-1')
    expect(store.bootstrap?.panel_state.kpis.coverage_percent).toBe(100)
    expect(store.bootstrap?.panel_state.kpis.groups_total).toBe(2)
  })
  test('errores de dominio descartan intención y revocación invalida borradores', async () => {
    let clears = 0
    const store = new CashierStore('user-1', 'token', () => { clears++ }, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()), mutate: async () => { throw new SologApiError('SOLOG_DEVICE_UNAUTHORIZED') },
    })
    await store.refresh(); const before = clears
    await expect(store.mutate('start')).rejects.toThrow()
    expect(store.hasPendingIntent).toBe(false)
    expect(clears).toBeGreaterThan(before)
  })
  test('rechaza respuesta sin state para save_batch', () => {
    expect(() => parseCashierMutation({ ...response('save_batch'), state: undefined }, 'save_batch')).toThrow()
  })
  test('doble inicio comparte una mutación y descarta respuesta tras logout', async () => {
    let calls = 0
    let resolve!: (value: CashierMutation) => void
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()),
      mutate: () => { calls++; return new Promise((r) => { resolve = r }) },
    })
    await store.refresh()
    const first = store.mutate('start')
    const second = store.mutate('start')
    const settled = Promise.allSettled([first, second])
    expect(calls).toBe(1)
    store.dispose()
    resolve(response())
    expect((await settled).every((item) => item.status === 'rejected')).toBe(true)
    expect(store.bootstrap).toBeNull()
  })
  test('rechaza lotes vacíos, mayores de 500 y grupo fuera de cola', async () => {
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()), mutate: async () => response(),
    })
    await store.refresh(); await store.mutate('start')
    await expect(store.mutate('save_batch', { items: [] })).rejects.toThrow()
    await expect(store.mutate('save_batch', { items: Array(501).fill({ grupo_id: 'group-1', stock_fisico: 0 }) })).rejects.toThrow()
    await expect(store.mutate('save_batch', { items: [{ grupo_id: 'group-2', stock_fisico: 0 }] })).rejects.toThrow()
    expect(store.hasPendingIntent).toBe(false)
  })
  test('reconteo de origen en sesión actual se rechaza sin mutar', async () => {
    let calls = 0
    const started = response()
    started.state!.groups[0].contado_detalle_id = 'current-detail'
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()), mutate: async () => { calls++; return started },
    })
    await store.refresh(); await store.mutate('start')
    await expect(store.mutate('recount_start', { detalle_id: 'current-detail' })).rejects.toThrow()
    expect(calls).toBe(1)
  })
  test('conflicto de revisión permite recarga y nueva intención con otro UUID', async () => {
    const ids: unknown[] = []
    let calls = 0
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierBootstrap(cashierFixture()),
      mutate: async (_action, payload) => {
        ids.push(payload.operation_id)
        if (++calls === 1) throw new SologApiError('SOLOG_GROUPS_REVISION_CONFLICT')
        return response()
      },
    })
    await store.refresh()
    await expect(store.mutate('start')).rejects.toThrow()
    await store.refresh(); await store.mutate('start')
    expect(ids[0]).not.toBe(ids[1])
  })
})
