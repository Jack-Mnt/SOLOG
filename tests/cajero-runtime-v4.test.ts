import type { CashierRoute } from '../src/lib/router'
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CashierV4Runtime } from '../src/features/solog/cajero/cajero.v4.runtime'
import { CashierV4Provider } from '../src/features/solog/cajero/cajero.v4.context'
import { CajeroV4, CajeroV4Inicio } from '../src/features/solog/cajero/cajero.v4.ui'
import { CashierV4Store } from '../src/features/solog/cajero/cajero.v4.store'
import { CashierV4DraftStorage } from '../src/features/solog/cajero/cajero.v4.storage'
import { cashierV4DraftStorageKey } from '../src/features/solog/cajero/cajero.v4.storage'
import { SologApiError } from '../src/features/solog/errors'
import { parseCashierHistory } from '../src/features/solog/cajero/cajero.history'
import { draftHarness, memoryStorage, uuidFor } from './fixtures/cashier-v4-drafts'
import { cashierV4Bootstrap, cashierV4Mutation, cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'
import type { CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'

function renderRuntime(runtime: CashierV4Runtime, route: CashierRoute) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: { localStorage: memoryStorage() }, configurable: true })
  try { return renderToStaticMarkup(createElement(CashierV4Provider, { store: runtime.store, children: createElement(CajeroV4, { runtime, route, onLogout: async () => {} }) })) }
  finally { if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window') }
}

function runtimeHarness(next: 'review' | 'coverage' | 'daily' | 'none' = 'coverage') {
  const h = draftHarness(next)
  let serial = 15000
  const call: CashierV4Rpc = async (_name, args) => { h.requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload) }); return h.responseFor(args.p_action as string, args.p_payload) }
  const runtime = new CashierV4Runtime(h.store, h.storage, call, () => uuidFor(serial++), () => h.now)
  return { ...h, runtime }
}

describe('runtime productivo V4', () => {
  test('entry monta V4, lazy UI directa y no importa foundation V3', async () => {
    const app = await Bun.file('src/features/solog/cajero/cajero.app.tsx').text()
    expect(app).toContain('<CashierV4Provider')
    expect(app).toContain("import('./cajero.v4.ui')")
    for (const fragment of ['v3.context', 'useCashierV3', 'rpc_solog_cashier_bootstrap_v3', 'rpc_solog_cashier_mutate_v3']) expect(app).not.toContain(fragment)
    const ui = await Bun.file('src/features/solog/cajero/cajero.v4.ui.tsx').text()
    expect(ui).not.toContain('periodComplete')
    expect(ui).not.toContain('cajero.session')
  })
  for (const round of [1, 2]) test(`Inicio pre-session ronda ${round} no inventa tipos de stock`, () => {
    const b = cashierV4Bootstrap('pre_session', { ronda: round, next_action: 'coverage' })
    const now = Date.parse(b.server_now), store = new CashierV4Store(ids.user, 'test-device-token-0000000000000000', undefined, () => now)
    store.acceptBootstrap(b)
    const runtime = new CashierV4Runtime(store, new CashierV4DraftStorage(memoryStorage()), undefined, undefined, () => now)
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', { value: { localStorage: memoryStorage() }, configurable: true })
    let html: string
    try { html = renderToStaticMarkup(createElement(CashierV4Provider, { store, children: createElement(CajeroV4Inicio, { runtime }) })) }
    finally { if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window') }
    expect(html).toContain('Inicio'); expect(html).toContain(`Cobertura quincenal ${round}`)
    expect(html).toContain('2 / 4'); expect(html).not.toContain('Stock 0'); expect(html).not.toContain('Stock negativo')
    runtime.dispose()
  })
  test('start V4 ignora summary coverage y navega por panel review', async () => {
    const b = cashierV4Bootstrap('pre_session', { next_action: 'coverage' }), now = Date.parse(b.server_now)
    const calls: string[] = []
    const call: CashierV4Rpc = async (name, args) => { calls.push(name); expect(args.p_action).toBe('start'); return cashierV4Mutation('start', { next_action: 'review' }) }
    const store = new CashierV4Store(ids.user, 'test-device-token-0000000000000000', call, () => now); store.acceptBootstrap(b)
    const storage = new CashierV4DraftStorage(memoryStorage()), runtime = new CashierV4Runtime(store, storage, call, () => uuidFor(99), () => now)
    expect(await runtime.start()).toBe('/cajero/revisar')
    expect(calls).toEqual(['rpc_solog_cashier_mutate_v4'])
    expect(storage.read(runtime.coordinator.activeScope()!).delivery_state?.next_action).toBe('review')
  })
  test('capture normal guarda V4 y send usa flush/delta, sin modificar KPI local', async () => {
    const h = runtimeHarness(), before = h.store.getSnapshot().panel_state!.kpis
    h.runtime.capture('coverage', ids.coverage, 10, '5+5')
    expect(h.runtime.pendingCount).toBe(1)
    expect(h.store.getSnapshot().panel_state!.kpis).toBe(before)
    expect(h.storage.read(h.scope).normal[0].metadata?.expression).toBe('5+5')
    await h.runtime.sendPending()
    expect(h.requests.map(r => r.action)).toEqual(['save_batch'])
    expect(h.runtime.pendingCount).toBe(0)
    expect(h.store.getSnapshot().panel_state!.next_action).toBe('daily')
  })
  test('review puede capturar antes de coverage completa y guarda recount separado', async () => {
    const h = runtimeHarness('review')
    expect(h.store.getSnapshot().panel_state!.kpis.coverage_pending).toBeGreaterThan(0)
    expect(h.runtime.canCapture('review')).toBe(true); expect(h.runtime.canCapture('coverage')).toBe(false)
    h.runtime.capture('review', ids.review, 10, '10')
    expect(h.storage.read(h.scope).normal).toHaveLength(0)
    await h.runtime.sendPending()
    expect(h.requests.map(r => r.action)).toEqual(['recount_save_batch'])
    expect(h.store.getSnapshot().panel_state!.next_action).toBe('coverage')
  })
  test('daily no acepta grupo coverage, ni capture con capability negada', () => {
    const h = runtimeHarness('daily')
    expect(() => h.runtime.capture('daily', ids.coverage, 1, '1')).toThrow('cola vigente')
    h.runtime.capture('daily', ids.daily, 1, '1')
    const b = cashierV4Bootstrap('active', { next_action: 'daily' }); b.panel_state!.session_capability.capture_allowed = false; b.session_capability.capture_allowed = false
    h.store.acceptBootstrap(b)
    expect(h.runtime.canCapture('daily')).toBe(false)
  })
  test('A recovery conserva pendientes, bloquea B, envío A no modifica panel B', async () => {
    const h = runtimeHarness()
    h.runtime.capture('coverage', ids.coverage, 10, '10'); h.moveToRecovery()
    const b = h.store.getSnapshot().panel_state!
    expect(h.runtime.canCapture('coverage')).toBe(false)
    expect(() => h.runtime.capture('coverage', ids.coverage, 2, '2')).toThrow()
    await h.runtime.sendPending()
    expect(h.requests[0].payload.conteo_id).toBe(h.scope.conteo_id)
    expect(h.requests[0].payload.expected_groups_revision).toBe(h.scope.groups_revision)
    expect(h.store.getSnapshot().panel_state).toBe(b)
    expect(h.runtime.canCapture('coverage')).toBe(true)
    h.runtime.capture('coverage', ids.coverage, 4, '4')
    expect(h.storage.read(h.runtime.coordinator.activeScope()!).normal[0].scope.conteo_id).toBe(b.session.id)
  })
  test('recovery sin autoridad conserva drafts y muestra bloqueo; ausente tampoco habilita capture', async () => {
    const h = runtimeHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10')
    const b = h.moveToRecovery()
    const record = h.storage.read(h.scope); record.delivery_state = null; h.storage.write(record)
    const reloaded = new CashierV4Store(ids.user, h.store.deviceToken, undefined, () => h.now); reloaded.acceptBootstrap(b)
    const runtime = new CashierV4Runtime(reloaded, h.storage, undefined, undefined, () => h.now)
    await expect(runtime.sendPending()).rejects.toThrow('autoridad suficiente')
    expect(h.storage.read(h.scope).normal).toHaveLength(1); expect(runtime.canCapture('coverage')).toBe(false)
    b.recovery_sessions = []; reloaded.acceptBootstrap(b)
    expect(runtime.canCapture('coverage')).toBe(false)
    await expect(runtime.sendPending()).rejects.toThrow('no está disponible')
  })
  for (const code of ['SOLOG_OPERATION_IN_PROGRESS', 'SOLOG_IDEMPOTENCY_CONFLICT'] as const) test(`${code} conserva prepared y no ejecuta finish`, async () => {
    const h = runtimeHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10')
    const calls: string[] = []
    const runtime = new CashierV4Runtime(h.store, h.storage, async (_name, args) => { calls.push(args.p_action!); throw new SologApiError(code) }, () => uuidFor(51), () => h.now)
    await expect(runtime.finish()).rejects.toThrow()
    const prepared = h.storage.read(h.scope).prepared!
    expect(prepared.operation_id).toBe(uuidFor(51)); expect(prepared.status).toBe(code === 'SOLOG_OPERATION_IN_PROGRESS' ? 'in_progress' : 'conflict')
    expect(calls).toEqual(['save_batch'])
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
  })
  test('refresh conserva prepared y drafts sin purga', async () => {
    const h = runtimeHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10')
    const runtime = new CashierV4Runtime(h.store, h.storage, async () => { throw new Error('network') }, () => uuidFor(55), () => h.now)
    await expect(runtime.sendPending()).rejects.toThrow('network')
    const before = h.storage.read(h.scope)
    h.store.acceptBootstrap(h.initial)
    expect(h.storage.read(h.scope).prepared).toEqual(before.prepared)
    expect(h.storage.read(h.scope).normal).toEqual(before.normal)
  })
  test('none nunca finaliza automáticamente; finish explícito conserva otra sesión', async () => {
    const h = runtimeHarness('none')
    const other = { ...h.storage.read(h.scope), scope: { ...h.scope, conteo_id: uuidFor(44) }, delivery_state: null }
    h.storage.write(other)
    h.runtime.hydrate()
    expect(h.requests).toHaveLength(0)
    // Inject a mocked bootstrap after explicit finish, never contact real Supabase.
    h.store.refresh = async () => { h.store.acceptBootstrap(cashierV4Bootstrap('pre_session')) }
    await h.runtime.finish()
    expect(h.requests.map(r => r.action)).toEqual(['finish'])
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.storage.read(other.scope)).toEqual(other)
  })
  test('Historial V2 acepta Inválido sin ampliar Admin', () => {
    const result = { contract_version: 2, generated_at: '2026-10-03T14:00:00Z', date: '2026-10-03', period: 'today', revisions: { operational: 1 }, items: [{
      detalle_id: ids.detail, grupo_id: ids.coverage, grupo: 'Grupo', categoria: 'Abarrotes', stock_teorico: 1, stock_fisico: 2, diferencia: 1, precio: 4, valor_diferencia: 4,
      estado_diferencia: 'Inválido', contado_at: '2026-10-03T13:00:00Z', recontado_at: null, snapshot_referencia_id: null, primer_snapshot_posterior_id: null,
      snapshot_posterior_id: null, snapshot_reconteo_id: null, stock_posterior: null, stock_teorico_reconteo: null, stock_reconteo: null,
    }] }
    expect(parseCashierHistory(result, 'today').items[0].estado_diferencia).toBe('Inválido')
  })
  for (const action of ['review', 'coverage', 'daily'] as const) test(`UI ${action} muestra exclusivamente metadata de su queue y pendientes`, () => {
    const b = cashierV4Bootstrap('active', { next_action: action })
    const store = new CashierV4Store(ids.user, 'test-device-token-0000000000000000'); store.acceptBootstrap(b)
    const runtime = new CashierV4Runtime(store, new CashierV4DraftStorage(memoryStorage()))
    const route = action === 'review' ? '/cajero/revisar' : action === 'coverage' ? '/cajero/conteo' : '/cajero/diario'
    const html = renderRuntime(runtime, route)
    expect(html).toContain(action === 'review' ? 'Grupo recount' : 'Abarrotes')
    expect(html).not.toContain('Grupo none')
    if (action === 'coverage') {
      for (const label of ['Stock positivo', 'Stock 0', 'Stock negativo']) expect(html).toContain(label)
      expect(html).toContain('1 pendientes')
      expect(html).toContain('0/1 contados')
    }
    if (action === 'daily') {
      expect(html).toContain('1 pendientes')
      expect(html).toContain('0/1 contados')
    }
    if (action === 'review') {
      expect(html).toContain('aria-label="Ocultar sobrantes"')
      expect(html).toContain('aria-label="Ocultar faltantes"')
      expect((html.match(/aria-pressed="true"/g) ?? []).length).toBeGreaterThanOrEqual(2)
    }
    runtime.dispose()
  })
  test('UI autocierre muestra fallo conocido con retry y descarte sin exponer recovery', async () => {
    const h = draftHarness('coverage')
    let clock = h.now
    const runtime = new CashierV4Runtime(h.store, h.storage, async () => {
      throw new SologApiError('SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT')
    }, () => uuidFor(401), () => clock)
    runtime.capture('coverage', ids.coverage, 10, '10')
    clock = Date.parse(h.store.getSnapshot().panel_state!.session.expira_at) + 1000
    await expect(runtime.autoCloseExpiredSession()).rejects.toThrow()

    const markup = renderRuntime(runtime, '/cajero')
    expect(markup).toContain('Registro pendiente')
    expect(markup).toContain('Reintentar registro')
    expect(markup).toContain('Descartar conteos')
    expect(markup).not.toContain('Recovery')
    expect(markup).not.toContain('Sesión vencida')
    runtime.dispose()
  })

  test('UI autocierre incierto ofrece solo reintento y conserva drafts', async () => {
    const h = draftHarness('coverage')
    let clock = h.now
    const runtime = new CashierV4Runtime(h.store, h.storage, async () => { throw new Error('timeout') },
      () => uuidFor(402), () => clock)
    runtime.capture('coverage', ids.coverage, 10, '10')
    clock = Date.parse(h.store.getSnapshot().panel_state!.session.expira_at) + 1000
    await expect(runtime.autoCloseExpiredSession()).rejects.toThrow('timeout')

    const markup = renderRuntime(runtime, '/cajero')
    expect(markup).toContain('Estamos verificando si el último registro se completó.')
    expect(markup).toContain('Reintentar')
    expect(markup).not.toContain('Descartar conteos')
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
    runtime.dispose()
  })

  test('UI recovery-only bloquea ruta de captura, waiting no inventa coverage', () => {
    const b = cashierV4Bootstrap('recovery', { next_action: 'none' })
    const store = new CashierV4Store(ids.user, 'test-device-token-0000000000000000'); store.acceptBootstrap(b)
    const runtime = new CashierV4Runtime(store, new CashierV4DraftStorage(memoryStorage()))
    const html = renderRuntime(runtime, '/cajero/conteo')
    expect(html).toContain('Flujo operativo')
    expect(html).not.toContain('aria-current="step"')
    expect(html).not.toContain('Tipo de stock'); expect(runtime.canCapture('coverage')).toBe(false)
    runtime.dispose()
  })
  test('cerrar feedback no restaura permiso denegado; solo bootstrap autoritativo lo restaura', async () => {
    const h = runtimeHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10')
    const runtime = new CashierV4Runtime(h.store, h.storage, async () => { throw new SologApiError('SOLOG_SESSION_DELIVERY_NOT_ALLOWED') }, () => uuidFor(60), () => h.now)
    await expect(runtime.sendPending()).rejects.toThrow()
    runtime.clearError(); expect(runtime.canCapture('coverage')).toBe(false)
    await expect(runtime.sendPending()).rejects.toThrow('permisos vigentes')
    expect(h.storage.read(h.scope).prepared?.operation_id).toBe(uuidFor(60))
  })
  test('start incierto reutiliza UUID y payload al reintentar', async () => {
    const b = cashierV4Bootstrap('pre_session'), now = Date.parse(b.server_now), requests: unknown[] = []
    const call: CashierV4Rpc = async (_name, args) => { requests.push(structuredClone(args.p_payload)); if (requests.length === 1) throw new Error('network'); return cashierV4Mutation('start') }
    const store = new CashierV4Store(ids.user, 'test-device-token-0000000000000000', call, () => now); store.acceptBootstrap(b)
    const runtime = new CashierV4Runtime(store, new CashierV4DraftStorage(memoryStorage()), call, () => uuidFor(61), () => now)
    await expect(runtime.start()).rejects.toThrow('network')
    expect(await runtime.start()).toBe('/cajero/revisar'); expect(requests[1]).toEqual(requests[0])
  })
  test('finish explícito incierto reutiliza prepared y no afecta otros scopes', async () => {
    const h = runtimeHarness('none'), requests: unknown[] = []
    h.store.refresh = async () => { h.store.acceptBootstrap(cashierV4Bootstrap('pre_session')) }
    const runtime = new CashierV4Runtime(h.store, h.storage, async (_name, args) => {
      requests.push(structuredClone(args.p_payload)); if (requests.length === 1) throw new Error('network'); return h.responseFor('finish', args.p_payload)
    }, () => uuidFor(62), () => h.now)
    await expect(runtime.finish()).rejects.toThrow('network')
    const prepared = h.storage.read(h.scope).prepared!
    expect(prepared.action).toBe('finish'); expect(prepared.operation_id).toBe(uuidFor(62))
    await runtime.finish(); expect(requests[1]).toEqual(requests[0]); expect(h.storage.read(h.scope).prepared).toBeNull()
  })
  test('storage corrupto bloquea capture y UI conserva feedback sin purgar el registro', () => {
    const h = runtimeHarness(); h.runtime.capture('coverage', ids.coverage, 10, '10')
    const key = cashierV4DraftStorageKey(h.scope)
    h.raw.setItem(key, '{broken'); h.runtime.hydrate()
    expect(h.runtime.getSnapshot().error).toBeTruthy(); expect(h.runtime.canCapture('coverage')).toBe(false)
    h.store.serverOffsetMs = h.now - Date.now()
    expect(() => renderRuntime(h.runtime, '/cajero/conteo')).not.toThrow()
    expect(h.raw.getItem(key)).toBe('{broken')
  })
})
