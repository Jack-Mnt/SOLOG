import { expect, test } from 'bun:test'
import { cashierFixture, startedFixture } from './fixtures/cashier-v4.mjs'
import { CashierStore } from '../src/features/solog/cajero/cajero.v2.store'
import { CashierDraftCoordinator } from '../src/features/solog/cajero/cajero.flush'
import { panelFromState, parseCashierBootstrap } from '../src/features/solog/cajero/cajero.v2.api'
import { SologApiError } from '../src/features/solog/errors'
import {
  clearCajeroMemory, saveCajeroLocalCapture, saveCajeroRecountDraft,
  readCajeroBuffer, readCajeroRecountDrafts,
} from '../src/features/solog/cajero/cajero.storage'
import type { CashierAction, CashierMutation, CashierState } from '../src/features/solog/cajero/cajero.v2'

const scope = { usuario_id: 'user-1', sede_id: 'site-1', dispositivo_id: 'device-1', conteo_id: 'session-1', groups_revision: 7 }
async function setup(normal = true, recount = true, failure?: { action: CashierAction; lost?: boolean }) {
  clearCajeroMemory()
  const b = parseCashierBootstrap(cashierFixture())
  let state = startedFixture() as CashierState
  let revision = 10
  let failed = false
  const calls: Array<{ action: CashierAction; payload: Record<string, unknown> }> = []
  const ledger = new Map<string, CashierMutation>()
  let pause: (() => Promise<void>) | undefined
  const store = new CashierStore('user-1', 'token', () => {}, {
    bootstrap: async () => ({ ...b, revisions: { ...b.revisions, operational: revision },
      panel_state: state.session.estado === 'finalizado' ? b.panel_state : panelFromState(state) }),
    mutate: async (action, payload) => {
      calls.push({ action, payload: structuredClone(payload) })
      if (pause) await pause()
      const prior = ledger.get(String(payload.operation_id))
      if (prior) return { ...prior, replay: true }
      if (failure?.action === action && !failed && !failure.lost) {
        failed = true
        throw new SologApiError('SOLOG_INVALID_BATCH_ITEM')
      }
      if (action === 'recount_save_batch' && normal) {
        expect(store.bootstrap?.panel_state.count_queue).toEqual([])
        expect(readCajeroBuffer(scope).items).toHaveLength(0)
      }
      state = structuredClone(state)
      if (action === 'save_batch') {
        state.count_queue = []
        state.kpis = { ...state.kpis, count_pending: 0, coverage_counted: 2, coverage_percent: 100 }
      }
      if (action === 'recount_save_batch') {
        state.review_queue = []
        state.kpis.review_pending = 0
      }
      if (action === 'finish') {
        expect(readCajeroBuffer(scope).items).toHaveLength(0)
        expect(readCajeroRecountDrafts(scope).items).toHaveLength(0)
        state.session.estado = 'finalizado'
      }
      const response = {
        contract_version: 2, generated_at: b.server_now, action, replay: false,
        conteo_id: 'session-1', state,
        revisions: { ...b.revisions, operational: ++revision },
        ...(action === 'save_batch' ? { saved: 1, items: [{ grupo_id: 'group-1' }] } : {}),
        ...(action === 'recount_save_batch' ? { saved: 1, items: [{ detalle_id: 'detail-origin' }] } : {}),
      } as CashierMutation
      ledger.set(String(payload.operation_id), response)
      if (failure?.action === action && !failed && failure.lost) {
        failed = true
        throw new Error('timeout after commit')
      }
      return response
    },
  })
  await store.refresh()
  if (normal) saveCajeroLocalCapture(scope, {
    grupo_id: 'group-1', stock_fisico: 9, contado_at: b.server_now,
    display: { grupo: 'Normal', categoria_id: 'cat-1', categoria: 'Abarrotes', precio: 4, stock_teorico: 10, vista: 'conteo_diario' },
  }, '9')
  if (recount) saveCajeroRecountDraft(scope, {
    detalle_id: 'detail-origin', grupo_id: 'group-2', stock_fisico: 10, contado_at: b.server_now,
  }, '10')
  const coordinator = new CashierDraftCoordinator(store)
  return { coordinator, store, calls, ledger, pause: (fn: () => Promise<void>) => { pause = fn } }
}

for (const [normal, recount, expected] of [
  [false, false, ['finish']],
  [true, false, ['save_batch', 'finish']],
  [false, true, ['recount_save_batch', 'finish']],
  [true, true, ['save_batch', 'recount_save_batch', 'finish']],
] as const) {
  test('finalizar ' + JSON.stringify({ normal, recount }), async () => {
    const t = await setup(normal, recount)
    await t.coordinator.run('finish')
    expect(t.calls.map((c) => c.action)).toEqual([...expected])
    expect(new Set(t.calls.map((c) => c.payload.operation_id)).size).toBe(expected.length)
  })
}

test('fallo normal detiene todo y conserva ambos tipos', async () => {
  const t = await setup(true, true, { action: 'save_batch' })
  await expect(t.coordinator.run('finish')).rejects.toThrow()
  expect(t.calls.map((c) => c.action)).toEqual(['save_batch'])
  expect(readCajeroBuffer(scope).items).toHaveLength(1)
  expect(readCajeroRecountDrafts(scope).items).toHaveLength(1)
  expect(t.store.bootstrap?.panel_state.session?.estado).toBe('activo')
})

test('fallo de reconteo conserva normal confirmado y retry no lo reenvía', async () => {
  const t = await setup(true, true, { action: 'recount_save_batch' })
  await expect(t.coordinator.run('finish')).rejects.toThrow()
  expect(readCajeroBuffer(scope).items).toHaveLength(0)
  expect(readCajeroRecountDrafts(scope).items).toHaveLength(1)
  expect(t.store.bootstrap?.panel_state.kpis.coverage_percent).toBe(100)
  expect(t.store.bootstrap?.panel_state.session?.estado).toBe('activo')
  await t.coordinator.run('finish')
  expect(t.calls.map((c) => c.action)).toEqual(['save_batch', 'recount_save_batch', 'recount_save_batch', 'finish'])
})

for (const action of ['save_batch', 'recount_save_batch', 'finish'] as const) {
  test('retry perdido conserva intención exacta y replay: ' + action, async () => {
    const t = await setup(true, true, { action, lost: true })
    await expect(t.coordinator.run('finish')).rejects.toThrow('timeout')
    const first = t.calls.find((c) => c.action === action)!
    await t.coordinator.run('finish')
    const attempts = t.calls.filter((c) => c.action === action)
    expect(attempts).toHaveLength(2)
    expect(attempts[1]!.payload).toEqual(first.payload)
    expect(t.ledger.size).toBe(3)
    expect(t.calls.filter((c) => c.action === 'save_batch')).toHaveLength(action === 'save_batch' ? 2 : 1)
    expect(readCajeroBuffer(scope).items).toHaveLength(0)
    expect(readCajeroRecountDrafts(scope).items).toHaveLength(0)
  })
}

for (const [normal, recount, expected] of [
  [false, false, []], [true, false, ['save_batch']], [false, true, ['recount_save_batch']],
  [true, true, ['save_batch', 'recount_save_batch']],
] as const) {
  test('envío global sin finish: ' + JSON.stringify({ normal, recount }), async () => {
    const t = await setup(normal, recount)
    await t.coordinator.run('global')
    expect(t.calls.map((c) => c.action)).toEqual([...expected])
    expect(t.store.bootstrap?.panel_state.session?.estado).toBe('activo')
  })
}

test('envío diario solo normales y sin finish', async () => {
  const t = await setup()
  await t.coordinator.run('normal')
  expect(t.calls.map((c) => c.action)).toEqual(['save_batch'])
  expect(readCajeroRecountDrafts(scope).items).toHaveLength(1)
})

test('secuencia bloqueada completa y doble submit comparte ejecución', async () => {
  const t = await setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  t.pause(() => gate)
  const first = t.coordinator.run('finish')
  expect(t.coordinator.getSnapshot()).toBe(true)
  expect(t.coordinator.run('finish')).toBe(first)
  await expect(t.coordinator.run('global')).rejects.toThrow('Espera')
  release()
  await first
  expect(t.calls.map((c) => c.action)).toEqual(['save_batch', 'recount_save_batch', 'finish'])
  expect(t.coordinator.getSnapshot()).toBe(false)
})

test('envío global no reintenta una finalización incierta', async () => {
  const t = await setup(false, false, { action: 'finish', lost: true })
  await expect(t.coordinator.run('finish')).rejects.toThrow()
  await expect(t.coordinator.run('global')).rejects.toThrow('finalización pendiente')
  expect(t.calls).toHaveLength(1)
})

test('cambio de usuario durante envío no continúa ni limpia otros drafts', async () => {
  const t = await setup()
  t.pause(async () => { t.store.dispose() })
  await expect(t.coordinator.run('finish')).rejects.toThrow('usuario cambió')
  expect(t.calls).toHaveLength(1)
  expect(readCajeroBuffer(scope).items).toHaveLength(1)
})
