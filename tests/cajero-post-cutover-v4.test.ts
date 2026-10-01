import { describe, test, expect } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CashierV4Runtime, cashierV4LocalPending } from '../src/features/solog/cajero/cajero.v4.runtime'
import { CashierV4Store } from '../src/features/solog/cajero/cajero.v4.store'
import { CashierV4DraftStorage, cashierV4StartStorageKey } from '../src/features/solog/cajero/cajero.v4.storage'
import { CashierV4Provider } from '../src/features/solog/cajero/cajero.v4.context'
import { CajeroV4 } from '../src/features/solog/cajero/cajero.v4.ui'
import { SologApiError } from '../src/features/solog/errors'
import type { CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import { draftHarness, memoryStorage, uuidFor } from './fixtures/cashier-v4-drafts'
import { cashierV4Bootstrap, cashierV4Mutation, cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'

const identity = { usuario_id: ids.user, sede_id: ids.site, dispositivo_id: ids.device }
function startHarness(call?: CashierV4Rpc, raw = memoryStorage()) {
  const b = cashierV4Bootstrap('pre_session'), now = Date.parse(b.server_now)
  const store = new CashierV4Store(ids.user, 'test-device-token-0000000000000000', call, () => now); store.acceptBootstrap(b)
  const storage = new CashierV4DraftStorage(raw)
  let generated = 0
  const runtime = new CashierV4Runtime(store, storage, call, () => uuidFor(++generated), () => now)
  return { runtime, store, storage, raw, b, generated: () => generated }
}
function html(runtime: CashierV4Runtime) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: { localStorage: memoryStorage() }, configurable: true })
  try { return renderToStaticMarkup(createElement(CashierV4Provider, { store: runtime.store, children: createElement(CajeroV4, { runtime, route: '/cajero', onLogout: async () => {} }) })) }
  finally { if (old) Object.defineProperty(globalThis, 'window', old); else Reflect.deleteProperty(globalThis, 'window') }
}

describe('13.5A start persistente', () => {
  test('persiste ready antes de RPC; success confirma y limpia', async () => {
    const h = startHarness(async (name, args) => {
      expect(name).toBe('rpc_solog_cashier_mutate_v4')
      expect(h.storage.readStart(identity)?.prepared_start).toEqual({ operation_id: args.p_payload.operation_id, status: 'ready' })
      return cashierV4Mutation('start')
    })
    await h.runtime.start(); expect(h.storage.readStart(identity)).toBeNull()
    expect(h.store.getSnapshot().panel_state?.session.id).toBe(ids.session)
  })
  test('escritura fallida NO llama backend', async () => {
    const raw = memoryStorage(); raw.setItem = () => { throw new Error('quota') }
    let calls = 0
    const h = startHarness(async () => { calls++; return cashierV4Mutation('start') }, raw)
    await expect(h.runtime.start()).rejects.toThrow('quota'); expect(calls).toBe(0)
  })
  test('timeout → reload → retry/replay conserva UUID, reconstruye token y limpia', async () => {
    const requests: unknown[] = []
    const h = startHarness(async (_name, args) => { requests.push(structuredClone(args.p_payload)); throw new Error('timeout') })
    await expect(h.runtime.start()).rejects.toThrow('timeout')
    expect(h.storage.readStart(identity)?.prepared_start.status).toBe('uncertain')
    const reloaded = startHarness(async (_name, args) => { requests.push(structuredClone(args.p_payload)); return { ...cashierV4Mutation('start'), replay: true } }, h.raw)
    expect(reloaded.runtime.getSnapshot().preparedStart?.prepared_start.operation_id).toBe(uuidFor(1))
    await reloaded.runtime.start(); expect(requests[1]).toEqual(requests[0])
    expect(reloaded.generated()).toBe(0); expect(reloaded.storage.readStart(identity)).toBeNull()
  })
  test('refresh con active no reconcilia start uncertain; replay sigue disponible', async () => {
    const h = startHarness(async () => { throw new Error('timeout') }); await expect(h.runtime.start()).rejects.toThrow()
    h.store.refresh = async () => { h.store.acceptBootstrap(cashierV4Bootstrap('active')) }
    await h.runtime.refresh()
    expect(h.storage.readStart(identity)?.prepared_start.status).toBe('uncertain')
    expect(html(h.runtime)).toContain('Reintentar inicio'); expect(h.runtime.canCapture('review')).toBe(false)
  })
  test('operation in progress conserva ID y permite retry explícito', async () => {
    let calls = 0
    const h = startHarness(async (_name, args) => { expect(args.p_payload.operation_id).toBe(uuidFor(1)); if (++calls === 1) throw new SologApiError('SOLOG_OPERATION_IN_PROGRESS'); return cashierV4Mutation('start') })
    await expect(h.runtime.start()).rejects.toThrow(); expect(h.storage.readStart(identity)?.prepared_start.status).toBe('in_progress')
    await h.runtime.start(); expect(h.generated()).toBe(1)
  })
  test('conflict sobrevive reload; no genera UUID alternativo ni llama otra RPC', async () => {
    const h = startHarness(async () => { throw new SologApiError('SOLOG_IDEMPOTENCY_CONFLICT') }); await expect(h.runtime.start()).rejects.toThrow()
    let calls = 0
    const next = startHarness(async () => { calls++; return cashierV4Mutation('start') }, h.raw)
    await expect(next.runtime.start()).rejects.toThrow(); expect(next.generated()).toBe(0); expect(calls).toBe(0)
    expect(next.storage.readStart(identity)?.prepared_start.status).toBe('conflict')
  })
  test('otra identidad no reutiliza prepared start', async () => {
    const h = startHarness(async () => cashierV4Mutation('start'))
    const other = { ...identity, dispositivo_id: uuidFor(99) }
    h.storage.writeStart({ version: 1, identity: other, prepared_start: { operation_id: uuidFor(77), status: 'uncertain' } })
    await h.runtime.start(); expect(h.generated()).toBe(1); expect(h.storage.readStart(other)?.prepared_start.operation_id).toBe(uuidFor(77))
  })
  test('start corrupto se conserva y bloquea antes de generar UUID/RPC', async () => {
    let calls = 0; const h = startHarness(async () => { calls++; return cashierV4Mutation('start') })
    const key = cashierV4StartStorageKey(identity); h.raw.setItem(key, '{broken'); h.runtime.hydrate()
    await expect(h.runtime.start()).rejects.toThrow(); expect(h.raw.getItem(key)).toBe('{broken')
    expect(calls).toBe(0); expect(h.generated()).toBe(0); expect(h.runtime.getSnapshot().error).toBeTruthy()
  })
})

describe('13.5A logout seguro', () => {
  function logoutHarness(next: 'coverage' | 'review' | 'none' = 'coverage') {
    const h = draftHarness(next), order: string[] = []
    let fail: string | null = null
    const call: CashierV4Rpc = async (_name, args) => {
      order.push(`${args.p_action}:${args.p_payload.conteo_id}`)
      if (fail === args.p_action) throw new Error('timeout')
      return h.responseFor(args.p_action!, args.p_payload)
    }
    let serial = 500
    const runtime = new CashierV4Runtime(h.store, h.storage, call, () => uuidFor(serial++), () => h.now)
    const logout = async () => { order.push('auth-logout') }
    return { ...h, runtime, order, logout, fail: (action: string | null) => { fail = action } }
  }
  test('sin active ni pendientes llama logout sin finish artificial', async () => {
    const h = startHarness(); let called = 0
    await h.runtime.logoutSafe(async () => { called++ }); expect(called).toBe(1)
  })
  test('active limpio confirma finish antes de logout', async () => {
    const h = logoutHarness(); await h.runtime.logoutSafe(h.logout)
    expect(h.order).toEqual([`finish:${ids.session}`, 'auth-logout'])
  })
  for (const action of ['coverage', 'review'] as const) test(`logout con draft ${action} confirma flush antes de finish`, async () => {
    const h = logoutHarness(action); h.runtime.capture(action, action === 'review' ? ids.review : ids.coverage, 10, '10')
    await h.runtime.logoutSafe(h.logout)
    expect(h.order).toEqual([`${action === 'review' ? 'recount_save_batch' : 'save_batch'}:${ids.session}`, `finish:${ids.session}`, 'auth-logout'])
  })
  test('A recovery + B active entrega A, B, finish B, logout', async () => {
    const h = logoutHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10'); h.moveToRecovery()
    const scopeB = h.runtime.coordinator.activeScope()!
    h.coordinator.captureNormal(scopeB, { grupo_id: ids.coverage, stock_fisico: 10, contado_at: h.store.getSnapshot().panel_state!.session.iniciado_at })
    await h.runtime.logoutSafe(h.logout)
    expect(h.order).toEqual([`save_batch:${ids.session}`, `save_batch:${scopeB.conteo_id}`, `finish:${scopeB.conteo_id}`, 'auth-logout'])
  })
  test('fallo de recovery NO finaliza B ni cierra auth', async () => {
    const h = logoutHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10'); h.moveToRecovery(); h.fail('save_batch')
    await expect(h.runtime.logoutSafe(h.logout)).rejects.toThrow('timeout')
    expect(h.order).toEqual([`save_batch:${ids.session}`]); expect(h.storage.read(h.scope).normal).toHaveLength(1)
    expect(h.storage.read(h.scope).prepared).not.toBeNull()
  })
  test('finish incierto impide logout y segundo Salir usa el mismo payload', async () => {
    const h = logoutHarness(); h.fail('finish')
    await expect(h.runtime.logoutSafe(h.logout)).rejects.toThrow('timeout')
    const p = h.storage.read(h.scope).prepared!
    expect(p.operation_id).toBe(uuidFor(500)); expect(h.order).not.toContain('auth-logout')
    h.fail(null); await h.runtime.logoutSafe(h.logout)
    expect(h.order).toEqual([`finish:${ids.session}`, `finish:${ids.session}`, 'auth-logout'])
    expect(h.storage.read(h.scope).finished).toBe(true)
  })
  test('busy lock impide start/send/finish/logout simultáneos', async () => {
    const h = startHarness(); let release!: () => void
    const wait = h.runtime.logoutSafe(() => new Promise<void>(resolve => { release = resolve }))
    await Promise.resolve(); await Promise.resolve()
    for (const command of [h.runtime.start, h.runtime.sendPending, h.runtime.finish, () => h.runtime.logoutSafe(async () => {})]) await expect(command()).rejects.toThrow('operación en curso')
    release(); await wait
  })
  test('start incierto exige replay antes de salir', async () => {
    const h = startHarness(async () => { throw new Error('timeout') }); await expect(h.runtime.start()).rejects.toThrow()
    let called = false; await expect(h.runtime.logoutSafe(async () => { called = true })).rejects.toThrow('inicio pendiente'); expect(called).toBe(false)
  })
})

describe('13.5A residuos y refresh', () => {
  test('finished normal/recount no suma pendientes ni bloquea start/capture/logout; conserva residuos', async () => {
    const h = draftHarness('review')
    h.coordinator.captureNormal(h.scope, { grupo_id: ids.coverage, stock_fisico: 1, contado_at: h.stamp })
    h.coordinator.captureRecount(h.scope, { grupo_id: ids.review, detalle_id: ids.detail, stock_fisico: 2, contado_at: h.stamp })
    const r = h.storage.read(h.scope); r.finished = true; r.delivery_state = null; h.storage.write(r)
    expect(cashierV4LocalPending(r)).toBe(0)
    const result = cashierV4Mutation('start'); result.conteo_id = uuidFor(81); result.panel_state.session.id = result.conteo_id
    const pre = startHarness(async () => result, h.raw)
    expect(pre.runtime.pendingCount).toBe(0); expect(pre.runtime.recoveryPending).toEqual([])
    await pre.runtime.logoutSafe(async () => {})
    await pre.runtime.start()
    const b = cashierV4Bootstrap('active', { next_action: 'coverage' }); b.panel_state!.session.id = uuidFor(80); h.store.acceptBootstrap(b)
    const runtime = new CashierV4Runtime(h.store, h.storage, undefined, undefined, () => h.now)
    expect(runtime.canCapture('coverage')).toBe(true); expect(runtime.pendingCount).toBe(0)
    expect(h.storage.read(h.scope).normal).toEqual(r.normal); expect(h.storage.read(h.scope).recount).toEqual(r.recount)
  })
  test('estado normal no tiene refresh global ni contextual', () => {
    const h = startHarness(); expect(html(h.runtime)).not.toContain('Actualizar')
  })
  test('requiresRefresh muestra CTA; bootstrap válido retira condición', async () => {
    const h = startHarness(async () => { throw new SologApiError('SOLOG_STOCK_EXPIRED') }); await expect(h.runtime.start()).rejects.toThrow()
    expect(html(h.runtime)).toContain('>Actualizar</button>')
    h.store.refresh = async () => { h.store.acceptBootstrap(structuredClone(h.b)) }; await h.runtime.refresh()
    expect(h.runtime.requiresRefresh).toBe(false); expect(html(h.runtime)).not.toContain('>Actualizar</button>')
  })
  test('error sin requiresRefresh no crea CTA; header usa logout seguro', async () => {
    const h = startHarness(async () => { throw new Error('timeout') }); await expect(h.runtime.start()).rejects.toThrow()
    expect(html(h.runtime)).not.toContain('>Actualizar</button>')
    const source = await Bun.file('src/features/solog/cajero/cajero.v4.ui.tsx').text()
    expect(source).toContain('runtime.logoutSafe(onLogout)'); expect(source).not.toContain('Actualizar panel')
  })
})
