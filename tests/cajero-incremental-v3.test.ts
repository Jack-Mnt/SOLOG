import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import { parseCashierV3Bootstrap, parseCashierV3Mutation } from '../src/features/solog/cajero/cajero.v3.api'
import { CashierV3Store } from '../src/features/solog/cajero/cajero.v3.store'
import { CashierDraftCoordinator } from '../src/features/solog/cajero/cajero.flush'
import {
  clearCajeroMemory, readCajeroBuffer, readCajeroRecountDrafts,
  saveCajeroLocalCapture, saveCajeroRecountDraft,
} from '../src/features/solog/cajero/cajero.storage'
import { cashierV3Bootstrap, cashierV3Delta, cashierV3Mutation } from './fixtures/cashier-v3.mjs'

const scope = { usuario_id: 'user-1', sede_id: 'site-1', dispositivo_id: 'device-1', conteo_id: 'session-1', groups_revision: 7 }
const countedAt = '2026-09-12T15:00:00.000Z'
function activeBootstrap(kind = 'session') { return parseCashierV3Bootstrap(cashierV3Bootstrap(kind)) }
function saveResult(payload: Record<string, unknown>, replay = false) {
  const input = (payload.items as Array<{ client_observation_id: string; grupo_id: string; stock_fisico: number; contado_at: string }>)[0]
  const result = cashierV3Mutation('save_batch')
  result.replay = replay
  result.items[0] = { ...result.items[0], ...input }
  return parseCashierV3Mutation(result, 'save_batch')
}

describe('Cajero V3 mutaciones incrementales', () => {
  test('save aplica delta, revisiones y KPI autoritativos sin bootstrap', async () => {
    let reads = 0
    let sent: Record<string, unknown> = {}
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => { reads++; return activeBootstrap() },
      mutate: async (_action, payload) => { sent = structuredClone(payload); return saveResult(payload) },
    })
    await store.refresh()
    const frozen = structuredClone(store.bootstrap!.panel_state!.groups[0])
    await store.mutate('save_batch', { items: [{ client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt }] })
    const group = store.bootstrap!.panel_state!.groups[0]
    expect(reads).toBe(1)
    expect(sent).toMatchObject({ conteo_id: 'session-1', expected_groups_revision: 7, device_token: 'token' })
    expect(group).toMatchObject({ cobertura_periodo: true, requiere_conteo: false, contado_detalle_id: 'detail-1' })
    expect({ nombre: group.nombre, productos: group.productos, precio: group.precio, stock_teorico: group.stock_teorico,
      snapshot_referencia_id: group.snapshot_referencia_id }).toEqual({ nombre: frozen.nombre, productos: frozen.productos,
      precio: frozen.precio, stock_teorico: frozen.stock_teorico, snapshot_referencia_id: frozen.snapshot_referencia_id })
    expect(store.bootstrap?.panel_state?.count_queue).toEqual([])
    expect(store.bootstrap?.panel_state?.kpis).toEqual(cashierV3Delta().kpis)
    expect(store.bootstrap?.revisions.operational).toBe(11)
  })

  test('recount aplica patch y elimina únicamente el detalle confirmado', async () => {
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => activeBootstrap(),
      mutate: async (action) => parseCashierV3Mutation(cashierV3Mutation(action), action),
    })
    await store.refresh()
    await store.mutate('recount_save_batch', { items: [{ detalle_id: 'detail-2', stock_fisico: 8, contado_at: countedAt }] })
    expect(store.bootstrap?.panel_state?.review_queue).toEqual([])
    expect(store.bootstrap?.panel_state?.count_queue).toEqual(['group-1'])
    expect(store.bootstrap?.panel_state?.groups[1]).toMatchObject({ requiere_reconteo: false, recontado_at: countedAt })
    expect(store.bootstrap?.panel_state?.kpis.review_pending).toBe(0)
  })

  test('timeout y lock retryable conservan UUID, payload y timestamp exactos', async () => {
    for (const failure of [new Error('timeout'), new SologApiError('SOLOG_LOCK_CONFLICT_RETRYABLE')]) {
      const payloads: Record<string, unknown>[] = []
      let attempt = 0
      const store = new CashierV3Store('user-1', 'token', () => {}, {
        bootstrap: async () => activeBootstrap(),
        mutate: async (_action, payload) => {
          payloads.push(structuredClone(payload))
          if (++attempt === 1) throw failure
          return saveResult(payload, true)
        },
      })
      await store.refresh()
      const body = { items: [{ client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt }] }
      await expect(store.mutate('save_batch', body)).rejects.toThrow()
      await expect(store.mutate('recount_save_batch', { items: [] })).rejects.toThrow('pendiente')
      await store.retryPending()
      expect(payloads[1]).toEqual(payloads[0])
      expect((payloads[1].items as Array<{ contado_at: string }>)[0].contado_at).toBe(countedAt)
      expect(store.hasPendingIntent).toBe(false)
      expect(store.bootstrap?.panel_state?.kpis.coverage_percent).toBe(100)
    }
  })

  test('rechaza respuesta de otra sesión o delta ajeno sin publicar estado', async () => {
    for (const mode of ['session', 'delta']) {
      const store = new CashierV3Store('user-1', 'token', () => {}, {
        bootstrap: async () => activeBootstrap(),
        mutate: async (_action, payload) => {
          const result = cashierV3Mutation('save_batch')
          result.items[0] = { ...result.items[0], ...(payload.items as unknown[])[0] }
          if (mode === 'session') result.conteo_id = 'other-session'
          else result.panel_delta.count_queue_remove = ['group-2']
          return parseCashierV3Mutation(result, 'save_batch')
        },
      })
      await store.refresh()
      const previous = structuredClone(store.bootstrap)
      await expect(store.mutate('save_batch', { items: [{ client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt }] })).rejects.toThrow()
      expect(store.bootstrap).toEqual(previous)
    }
  })

  test('acepta timestamps autoritativos equivalentes con otra representación ISO', async () => {
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => activeBootstrap(),
      mutate: async (_action, payload) => {
        const result = cashierV3Mutation('save_batch')
        result.items[0] = { ...result.items[0], ...(payload.items as unknown[])[0], contado_at: '2026-09-12T15:00:00+00:00' }
        result.session_capability.recovery_until = result.session_capability.recovery_until.replace('.000Z', '+00:00')
        return parseCashierV3Mutation(result, 'save_batch')
      },
    })
    await store.refresh()
    await store.mutate('save_batch', { items: [{ client_observation_id: 'observation-1', grupo_id: 'group-1',
      stock_fisico: 10, contado_at: countedAt }] })
    expect(store.bootstrap?.panel_state?.count_queue).toEqual([])
  })

  test('batches múltiples aplican atómicamente todos los patches y removals', async () => {
    const bootstrap = cashierV3Bootstrap('session')
    const third = { ...structuredClone(bootstrap.panel_state.groups[0]), grupo_id: 'group-3', nombre: 'Grupo 3' }
    bootstrap.panel_state.groups.push(third)
    bootstrap.panel_state.count_queue.push('group-3')
    bootstrap.panel_state.kpis = { ...bootstrap.panel_state.kpis, groups_total: 3, count_pending: 2 }
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierV3Bootstrap(bootstrap),
      mutate: async (_action, payload) => {
        const sent = payload.items as Array<{ client_observation_id: string; grupo_id: string; stock_fisico: number; contado_at: string }>
        const result = cashierV3Mutation('save_batch')
        result.saved = 2
        result.items = sent.map((item, index) => ({ ...result.items[0], ...item, detalle_id: `detail-${index + 10}` }))
        result.panel_delta.groups_patch = sent.map((item, index) => ({ ...result.panel_delta.groups_patch[0], grupo_id: item.grupo_id,
          contado_detalle_id: `detail-${index + 10}` }))
        result.panel_delta.count_queue_remove = sent.map((item) => item.grupo_id)
        result.panel_delta.kpis = { groups_total: 3, coverage_counted: 3, coverage_percent: 100, count_pending: 0, review_pending: 1 }
        return parseCashierV3Mutation(result, 'save_batch')
      },
    })
    await store.refresh()
    await store.mutate('save_batch', { items: [
      { client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt },
      { client_observation_id: 'observation-3', grupo_id: 'group-3', stock_fisico: 7, contado_at: countedAt },
    ] })
    expect(store.bootstrap?.panel_state?.count_queue).toEqual([])
    expect(store.bootstrap?.panel_state?.groups.filter((group) => ['group-1', 'group-3'].includes(group.grupo_id))
      .every((group) => !group.requiere_conteo)).toBe(true)
    expect(store.bootstrap?.panel_state?.kpis.coverage_counted).toBe(3)
  })

  test('recovery permite entrega, bloquea captura y expiración final impide retry', async () => {
    let writes = 0
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => activeBootstrap('recovery'),
      mutate: async (_action, payload) => { writes++; return saveResult(payload) },
    })
    await store.refresh()
    expect(store.capability).toMatchObject({ mode: 'recovery', captureAllowed: false, deliveryAllowed: true })
    await store.mutate('save_batch', { items: [{ client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt }] })
    expect(writes).toBe(1)

    const expired = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => activeBootstrap('recovery'), mutate: async (_action, payload) => { writes++; return saveResult(payload) },
    })
    await expired.refresh()
    expired.serverOffsetMs = Date.parse(expired.bootstrap!.panel_state!.session.recovery_until) - Date.now()
    await expect(expired.mutate('save_batch', { items: [{ client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt }] })).rejects.toThrow()
    expect(writes).toBe(1)
  })
})

describe('Cajero V3 flush sobre drafts en memoria', () => {
  test('adopta delta antes de retirar únicamente el draft confirmado', async () => {
    clearCajeroMemory()
    const draft = saveCajeroLocalCapture(scope, { grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt,
      display: { grupo: 'Grupo', categoria_id: 'cat-1', categoria: 'Abarrotes', precio: 4, stock_teorico: 10, vista: 'conteo' } }, '10')
    let observedPanelBeforeCleanup = false
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => activeBootstrap(), mutate: async (_action, payload) => saveResult(payload),
    })
    await store.refresh()
    store.subscribe(() => {
      if (store.bootstrap?.panel_state?.count_queue.length === 0 && readCajeroBuffer(scope).items.length === 1) observedPanelBeforeCleanup = true
    })
    await new CashierDraftCoordinator(store).run('normal')
    expect(observedPanelBeforeCleanup).toBe(true)
    expect(readCajeroBuffer(scope).items).toEqual([])
    expect(draft.contado_at).toBe(countedAt)
    expect(store.bootstrap?.panel_state?.kpis.coverage_percent).toBe(100)
  })

  test('recount confirmado elimina su draft sin tocar el buffer normal', async () => {
    clearCajeroMemory()
    saveCajeroLocalCapture(scope, { grupo_id: 'group-1', stock_fisico: 10, contado_at: countedAt,
      display: { grupo: 'Grupo', categoria_id: 'cat-1', categoria: 'Abarrotes', precio: 4, stock_teorico: 10, vista: 'conteo' } }, '10')
    saveCajeroRecountDraft(scope, { detalle_id: 'detail-2', grupo_id: 'group-2', stock_fisico: 8, contado_at: countedAt }, '8')
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => activeBootstrap(),
      mutate: async (action, payload) => action === 'recount_save_batch'
        ? parseCashierV3Mutation(cashierV3Mutation(action), action)
        : saveResult(payload),
    })
    await store.refresh()
    await new CashierDraftCoordinator(store).run('global')
    expect(readCajeroBuffer(scope).items).toEqual([])
    expect(readCajeroRecountDrafts(scope).items).toEqual([])
  })
})
