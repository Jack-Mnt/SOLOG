import { describe, expect, test } from 'bun:test'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
import { parseCashierBootstrap, parseCashierMutation, panelFromState } from '../src/features/solog/cajero/cajero.v2.api'
import { CashierStore } from '../src/features/solog/cajero/cajero.v2.store'
import {
  buildNextCajeroRecountBatch,
  clearCajeroMemory,
  readCajeroRecountDrafts,
  removeCajeroRecountDrafts,
  saveCajeroRecountDraft,
} from '../src/features/solog/cajero/cajero.storage'
import {
  calculateCajeroValuationPreview,
  calculateDifference,
  filterCajeroReviewGroups,
} from '../src/features/solog/cajero/cajero.utils'
import type { CashierMutation } from '../src/features/solog/cajero/cajero.v2'

const scope = {
  usuario_id: 'user-1', sede_id: 'site-1', dispositivo_id: 'device-1',
  conteo_id: 'session-1', groups_revision: 7,
}

function batchResponse(replay = false): CashierMutation {
  const state = startedFixture()
  state.review_queue = []
  state.kpis.review_pending = 0
  return {
    contract_version: 2,
    generated_at: '2026-09-03T20:31:00.000Z',
    action: 'recount_save_batch',
    replay,
    conteo_id: 'session-1',
    saved: 2,
    revisions: { groups: 7, devices: 2, operational: 11 },
    state,
    items: [
      {
        detalle_id: 'detail-origin', grupo_id: 'group-2', snapshot_reconteo_id: 'snapshot-1',
        stock_teorico_reconteo: 10, stock_reconteo: 8, diferencia_reconteo: -2,
        diferencia: -2, estado_diferencia: 'Inconsistente', valor_diferencia: -8,
        recontado_at: '2026-09-03T20:31:00.000Z',
      },
      {
        detalle_id: 'detail-2', grupo_id: 'group-3', snapshot_reconteo_id: 'snapshot-1',
        stock_teorico_reconteo: 5, stock_reconteo: 5, diferencia_reconteo: 0,
        diferencia: 0, estado_diferencia: 'Coincide', valor_diferencia: 0,
        recontado_at: '2026-09-03T20:31:01.000Z',
      },
    ],
  }
}

describe('DC1 contrato y drafts V7', () => {
  test('exige la cola enriquecida y conserva su orden autoritativo', () => {
    const fixture = cashierFixture()
    fixture.panel_state.review_queue = [
      { grupo_id: 'group-2', detalle_id: 'b', ultima_diferencia: 2, contado_at: '2026-09-03T20:30:00Z' },
      { grupo_id: 'group-2', detalle_id: 'a', ultima_diferencia: -1, contado_at: '2026-09-03T20:31:00Z' },
    ]
    expect(parseCashierBootstrap(fixture).panel_state.review_queue.map((item) => item.detalle_id)).toEqual(['b', 'a'])
    delete fixture.panel_state.review_queue[0].ultima_diferencia
    expect(() => parseCashierBootstrap(fixture)).toThrow()
    expect(parseCashierMutation(batchResponse(), 'recount_save_batch').saved).toBe(2)
  })

  test('aísla, edita y descarta drafts sin introducirlos en el lote normal', () => {
    clearCajeroMemory()
    saveCajeroRecountDraft(scope, {
      detalle_id: 'detail-origin', grupo_id: 'group-2', stock_fisico: 8,
      contado_at: '2026-09-03T20:30:00Z',
    }, '8')
    saveCajeroRecountDraft(scope, {
      detalle_id: 'detail-origin', grupo_id: 'group-2', stock_fisico: 9,
      contado_at: '2026-09-03T20:40:00Z',
    }, '9')
    expect(readCajeroRecountDrafts(scope).items[0]?.stock_fisico).toBe(9)
    expect(readCajeroRecountDrafts(scope).items[0]?.contado_at).toBe('2026-09-03T20:30:00Z')
    expect(readCajeroRecountDrafts({ ...scope, usuario_id: 'other' }).items).toEqual([])
    expect(buildNextCajeroRecountBatch(scope)?.items).toEqual([
      { detalle_id: 'detail-origin', stock_fisico: 9, contado_at: '2026-09-03T20:30:00Z' },
    ])
    removeCajeroRecountDrafts(scope, ['detail-origin'])
    expect(readCajeroRecountDrafts(scope).items).toEqual([])
  })
})

describe('DC3 previews congelados', () => {
  test('aplica unidad, paquete, signo y configuración inválida', () => {
    expect(calculateDifference(5, 8)).toBe(-3)
    expect(calculateCajeroValuationPreview(-3, 2, null, null)).toBe(-6)
    expect(calculateCajeroValuationPreview(14, 2, 6, 10)).toBe(24)
    expect(calculateCajeroValuationPreview(-14, 2, 6, 10)).toBe(-24)
    expect(calculateCajeroValuationPreview(3, 2, 6, null)).toBeNull()
    expect(calculateCajeroValuationPreview(3, 2, 1, 10)).toBeNull()
  })
})

describe('DC4 batch, replay y orden', () => {
  test('varios reconteos producen una sola mutación batch con payload contractual', async () => {
    const bootstrap = parseCashierBootstrap(cashierFixture())
    const state = startedFixture()
    state.groups.push({ ...state.groups[1], grupo_id: 'group-3', detalle_reconteo_id: 'detail-2' })
    state.review_queue.push({ grupo_id: 'group-3', detalle_id: 'detail-2', ultima_diferencia: 1, contado_at: '2026-09-03T20:30:01Z' })
    bootstrap.panel_state = panelFromState(state)
    bootstrap.session_state = state
    const calls: Array<{ action: string; payload: Record<string, unknown> }> = []
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => bootstrap,
      mutate: async (action, payload) => { calls.push({ action, payload }); return batchResponse() },
    })
    await store.refresh()
    await store.mutate('recount_save_batch', { items: [
      { detalle_id: 'detail-origin', stock_fisico: 8, contado_at: '2026-09-03T20:30:00Z' },
      { detalle_id: 'detail-2', stock_fisico: 5, contado_at: '2026-09-03T20:30:01Z' },
    ] })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.action).toBe('recount_save_batch')
    expect((calls[0]?.payload.items as unknown[])).toHaveLength(2)
    expect(Object.keys((calls[0]?.payload.items as Record<string, unknown>[])[0]!).sort()).toEqual(['contado_at', 'detalle_id', 'stock_fisico'])
  })

  test('retry conserva operation_id, payload y timestamps; replay no suma estado local', async () => {
    const bootstrap = parseCashierBootstrap(cashierFixture())
    const state = startedFixture()
    bootstrap.panel_state = panelFromState(state)
    bootstrap.session_state = state
    const sent: Record<string, unknown>[] = []
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => bootstrap,
      mutate: async (_action, payload) => {
        sent.push(structuredClone(payload))
        if (sent.length === 1) throw new Error('timeout')
        return batchResponse(true)
      },
    })
    await store.refresh()
    const body = { items: [{ detalle_id: 'detail-origin', stock_fisico: 8, contado_at: '2026-09-03T20:30:00Z' }] }
    await expect(store.mutate('recount_save_batch', body)).rejects.toThrow('timeout')
    expect(store.pendingAction).toBe('recount_save_batch')
    await store.retryPending()
    expect(sent[1]).toEqual(sent[0])
    expect(store.bootstrap?.panel_state.kpis.review_pending).toBe(0)
    expect(store.hasPendingIntent).toBe(false)
    expect(store.pendingAction).toBeNull()
  })

  test('los filtros producen subsecuencias estables', () => {
    const groups = [
      { grupo_id: 'one', ultima_diferencia: -1 },
      { grupo_id: 'two', ultima_diferencia: 2 },
      { grupo_id: 'three', ultima_diferencia: -3 },
    ] as Parameters<typeof filterCajeroReviewGroups>[0]
    expect(filterCajeroReviewGroups(groups, 'negative').map((item) => item.grupo_id)).toEqual(['one', 'three'])
  })
})

describe('DC5–DC7 integración sin caminos unitarios', () => {
  test('runtime no contiene acciones unitarias ni requests desde el modal', async () => {
    const runtime = await Promise.all([
      'cajero.session.ts', 'cajero.v2.ts', 'cajero.v2.api.ts', 'cajero.v2.store.ts',
      'cajero.captura.dialog.tsx', 'cajero.revisar.tsx',
    ].map((name) => Bun.file('src/features/solog/cajero/' + name).text()))
    expect(runtime.join('\n')).not.toMatch(/recount_start|['"]recount_save['"]|beginRecount|saveRecount/)
    const modal = runtime[4]!
    expect(modal).not.toMatch(/supabase|mutate\(|fetch\(|loadOperationalGroups/)
    expect(modal).toContain('saveCajeroRecountDraft')
  })

  test('Conteo conserva su envío normal y Revisar delega el envío a Inicio', async () => {
    const [bar, daily, review] = await Promise.all([
      Bun.file('src/features/solog/cajero/cajero.operativo.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.diario.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.revisar.tsx').text(),
    ])
    expect(bar).toContain('onClick={() => void session.sendPending()}')
    expect(daily).toContain('<CajeroSendBar compact session={session}')
    expect(review).not.toContain('CajeroSendBar')
  })

  test('Conteo diario y Revisar ocultan la proyección y reutilizan el mismo start', async () => {
    const [shared, daily, review, home] = await Promise.all([
      Bun.file('src/features/solog/cajero/cajero.operativo.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.diario.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.revisar.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.inicio.tsx').text(),
    ])
    expect(shared).toContain('onClick={() => void session.startSession()}')
    expect(shared).toContain('disabled={session.starting}')
    expect(daily).toContain('buttonLabel="Iniciar conteo"')
    expect(daily).toContain('Inicia un conteo para cargar la referencia TumiSoft y comenzar a registrar productos.')
    expect(review).toContain('buttonLabel="Iniciar reconteo"')
    expect(review).toContain('Inicia un conteo para revisar los casos pendientes con una referencia TumiSoft vigente.')
    expect(daily).not.toContain('CajeroPreSessionList')
    expect(review).not.toContain('CajeroPreSessionList')
    expect(home).toContain('await session.startSession()')
  })
})
