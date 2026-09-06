import { expect, test } from 'bun:test'
import { cashierFixture, startedFixture, capabilityFixture } from './fixtures/cashier-v4.mjs'
import { cashierCapability } from '../src/features/solog/cajero/cajero.capability'
import { parseCashierBootstrap, panelFromState } from '../src/features/solog/cajero/cajero.v2.api'
import { CashierStore } from '../src/features/solog/cajero/cajero.v2.store'
import { CashierDraftCoordinator } from '../src/features/solog/cajero/cajero.flush'
import type { CashierAction, CashierMutation, CashierState } from '../src/features/solog/cajero/cajero.v2'
import { clearCajeroMemory, readCajeroBuffer, readCajeroRecountDrafts, saveCajeroLocalCapture, saveCajeroRecountDraft } from '../src/features/solog/cajero/cajero.storage'

const scope = { usuario_id: 'user-1', sede_id: 'site-1', dispositivo_id: 'device-1', conteo_id: 'session-1', groups_revision: 7 }
function active() {
  const b = parseCashierBootstrap(cashierFixture())
  const state = startedFixture() as CashierState
  b.panel_state = panelFromState(state)
  b.session_state = state
  b.session_capability = capabilityFixture(state, b.server_now)
  return b
}
function result(action: CashierAction, state: CashierState, operational = 11): CashierMutation {
  return { contract_version: 2, action, replay: false, generated_at: state.session.iniciado_at,
    conteo_id: state.session.id, state, revisions: { groups: 7, devices: 2, operational },
    items: action === 'save_batch' ? [{ grupo_id: 'group-1' }] : [{ detalle_id: 'detail-origin' }] } as CashierMutation
}
function drafts(normal: boolean, recount: boolean) {
  clearCajeroMemory()
  const time = cashierFixture().server_now
  if (normal) saveCajeroLocalCapture(scope, { grupo_id: 'group-1', stock_fisico: 9, contado_at: time,
    display: { grupo: 'Normal', categoria: 'Abarrotes', categoria_id: 'cat-1', precio: 4, stock_teorico: 10, vista: 'conteo_diario' } }, '9')
  if (recount) saveCajeroRecountDraft(scope, { grupo_id: 'group-2', detalle_id: 'detail-origin', stock_fisico: 8, contado_at: time }, '8')
}

test('V8 capacidad: límites exactos, permisos backend y fechas autoritativas', () => {
  const b = active(), s = b.panel_state.session!
  expect(cashierCapability(b, Date.parse(s.expira_at) - 1)).toMatchObject({ mode: 'active', captureAllowed: true, deliveryAllowed: true })
  expect(cashierCapability(b, Date.parse(s.expira_at))).toEqual({ mode: 'recovery', captureAllowed: false, deliveryAllowed: true })
  expect(cashierCapability(b, Date.parse(s.recovery_until))).toEqual({ mode: 'expired', captureAllowed: false, deliveryAllowed: false })
  b.session_capability.capture_allowed = false
  expect(cashierCapability(b, Date.parse(s.iniciado_at)).captureAllowed).toBe(false)
  b.session_capability.pending_delivery_allowed = false
  expect(cashierCapability(b, Date.parse(s.expira_at)).deliveryAllowed).toBe(false)
})

test('V8 parser exige capacidad y recovery_until, conserva API 2', () => {
  const b = active()
  expect(parseCashierBootstrap(b).contract_version).toBe(2)
  expect(() => parseCashierBootstrap({ ...b, session_capability: undefined })).toThrow()
  expect(() => parseCashierBootstrap({ ...b, panel_state: { ...b.panel_state, session: { ...b.panel_state.session, recovery_until: undefined } } })).toThrow()
  expect(() => parseCashierBootstrap({ ...b, session_capability: { ...b.session_capability, recovery_until: 'otro' } })).toThrow()
})

test('V8 recuperación irreversible aunque el reloj retroceda', async () => {
  const b = active()
  const store = new CashierStore('user-1', 'token', () => {}, {
    bootstrap: async () => b, mutate: async action => result(action, b.session_state!),
  })
  await store.refresh()
  store.serverOffsetMs = Date.parse(b.panel_state.session!.expira_at) - Date.now()
  expect(store.capability.mode).toBe('recovery')
  store.serverOffsetMs -= 60000
  expect(store.capability.mode).toBe('recovery')
  expect(store.capability.captureAllowed).toBe(false)
  expect(store.capability.deliveryAllowed).toBe(true)
})

for (const [normal, recount, command, expected] of [
  [true, false, 'normal', ['save_batch']],
  [false, true, 'global', ['recount_save_batch']],
  [true, true, 'global', ['save_batch', 'recount_save_batch']],
  [true, true, 'finish', ['save_batch', 'recount_save_batch', 'finish']],
  [false, false, 'finish', ['finish']],
] as const) {
  test('V8 recovery ' + JSON.stringify({ normal, recount, command }), async () => {
    const b = active(), state = b.session_state!
    b.server_now = state.session.expira_at
    b.session_capability = capabilityFixture(state, b.server_now)
    const calls: { action: CashierAction; payload: Record<string, unknown> }[] = []
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => b,
      mutate: async (action, payload) => {
        calls.push({ action, payload: structuredClone(payload) })
        if (action === 'recount_save_batch') expect(readCajeroBuffer(scope).items).toHaveLength(0)
        if (action === 'finish') {
          expect(readCajeroRecountDrafts(scope).items).toHaveLength(0)
          state.session.estado = 'finalizado'
        }
        b.revisions.operational++
        return result(action, state, b.revisions.operational)
      },
    })
    await store.refresh(); drafts(normal, recount)
    expect(store.capability.captureAllowed).toBe(false)
    await new CashierDraftCoordinator(store).run(command)
    expect(calls.map(c => c.action)).toEqual([...expected])
    for (const call of calls) if (call.payload.items) {
      expect((call.payload.items as { contado_at: string }[])[0].contado_at).toBe(cashierFixture().server_now)
    }
    expect(new Set(calls.map(c => c.payload.operation_id)).size).toBe(calls.length)
  })
}

test('V8 límite entre batches impide reconteo y finish; normal queda confirmado', async () => {
  const b = active(), state = b.session_state!, calls: string[] = []
  const store = new CashierStore('user-1', 'token', () => {}, {
    bootstrap: async () => b,
    mutate: async action => {
      calls.push(action)
      store.serverOffsetMs = Date.parse(state.session.recovery_until) - Date.now()
      return result(action, state)
    },
  })
  await store.refresh(); drafts(true, true)
  await expect(new CashierDraftCoordinator(store).run('finish')).rejects.toThrow()
  expect(calls).toEqual(['save_batch'])
  expect(readCajeroBuffer(scope).items).toHaveLength(0)
  expect(store.capability.mode).toBe('expired')
  expect(store.hasPendingIntent).toBe(false)
})

test('V8 intención incierta vencida: conserva UUID/payload, cero retransmisiones', async () => {
  const b = active(), calls: unknown[] = []
  const store = new CashierStore('user-1', 'token', () => {}, {
    bootstrap: async () => b,
    mutate: async (_action, payload) => { calls.push(structuredClone(payload)); throw new Error('timeout') },
  })
  await store.refresh()
  const body = { items: [{ grupo_id: 'group-1', stock_fisico: 9, contado_at: b.server_now, client_observation_id: 'observation' }] }
  await expect(store.mutate('save_batch', body)).rejects.toThrow('timeout')
  await expect(store.retryPending()).rejects.toThrow('timeout')
  expect(calls[1]).toEqual(calls[0])
  store.serverOffsetMs = Date.parse(b.panel_state.session!.recovery_until) - Date.now()
  await expect(store.retryPending()).rejects.toThrow()
  expect(calls).toHaveLength(2)
  expect(store.hasPendingIntent).toBe(true)
  await store.refresh()
  expect(store.hasPendingIntent).toBe(true)
  expect(store.capability.deliveryAllowed).toBe(false)
  // Un bootstrap posterior de otra sesión no autoriza retransmitir la intención anterior.
  store.bootstrap = active()
  store.bootstrap.panel_state.session!.id = 'otra-sesion'
  store.serverOffsetMs = Date.parse(b.server_now) - Date.now()
  await expect(store.retryPending()).rejects.toThrow()
  expect(calls).toHaveLength(2)
  expect(store.hasPendingIntent).toBe(true)
})

test('V8 respuesta tardía reconcilia state pero nunca reabre capacidad', async () => {
  const b = active(), state = b.session_state!
  let resolve!: (r: CashierMutation) => void
  const store = new CashierStore('user-1', 'token', () => {}, {
    bootstrap: async () => b,
    mutate: () => new Promise(r => { resolve = r }),
  })
  await store.refresh()
  const request = store.mutate('save_batch', { items: [{ grupo_id: 'group-1', stock_fisico: 9, contado_at: b.server_now }] })
  store.serverOffsetMs = Date.parse(state.session.recovery_until) - Date.now()
  expect(store.capability.mode).toBe('expired')
  resolve(result('save_batch', { ...state, count_queue: [], kpis: { ...state.kpis, count_pending: 0 } }))
  await request
  expect(store.bootstrap?.panel_state.count_queue).toEqual([])
  expect(store.capability).toEqual({ mode: 'expired', captureAllowed: false, deliveryAllowed: false })
  expect(store.hasPendingIntent).toBe(false)
})

for (const fail of [false, true]) {
  test('V8 post-start deduplicado, fallo lectura=' + fail, async () => {
    const initial = parseCashierBootstrap(cashierFixture()), next = active()
    next.revisions.operational = 11
    let reads = 0, mutations = 0, rejectRead = fail
    const store = new CashierStore('user-1', 'token', () => {}, {
      bootstrap: async () => {
        reads++
        if (reads === 1) return initial
        expect(store.capability.captureAllowed).toBe(false)
        if (rejectRead) throw new Error('lectura fallida')
        return next
      },
      mutate: async () => { mutations++; return result('start', next.session_state!) },
    })
    await store.refresh()
    if (fail) {
      await expect(store.startAndRefresh()).rejects.toThrow('lectura fallida')
      expect(store.bootstrap?.panel_state.session?.id).toBe('session-1')
      expect(store.needsCapabilityRefresh).toBe(true)
      expect(store.hasPendingIntent).toBe(false)
      rejectRead = false
      await store.startAndRefresh()
    } else await Promise.all([store.startAndRefresh(), store.startAndRefresh()])
    expect(mutations).toBe(1)
    expect(reads).toBe(fail ? 3 : 2)
    expect(store.capability.captureAllowed).toBe(true)
  })
}

test('V8 bootstrap de otra sesión no habilita captura post-start', async () => {
  const b = active(); let reads = 0
  const store = new CashierStore('user-1', 'token', () => {}, {
    bootstrap: async () => ++reads === 1 ? parseCashierBootstrap(cashierFixture()) : { ...b, panel_state: { ...b.panel_state, session: { ...b.panel_state.session!, id: 'otra' } } },
    mutate: async () => result('start', b.session_state!),
  })
  await store.refresh()
  await expect(store.startAndRefresh()).rejects.toThrow()
  expect(store.needsCapabilityRefresh).toBe(true)
  expect(store.capability.captureAllowed).toBe(false)
})
