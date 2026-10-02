import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import type { CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import { CashierV4Runtime } from '../src/features/solog/cajero/cajero.v4.runtime'
import { CashierV4DraftStorage, cashierV4DraftStorageKey } from '../src/features/solog/cajero/cajero.v4.storage'
import { CashierV4Store } from '../src/features/solog/cajero/cajero.v4.store'
import { draftHarness, uuidFor } from './fixtures/cashier-v4-drafts'
import { cashierV4Bootstrap, cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'

function activeAutocloseHarness(withDraft = false, responder?: CashierV4Rpc, action: 'coverage' | 'review' = 'coverage') {
  const h = draftHarness(action)
  let clock = h.now
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = []
  const call: CashierV4Rpc = async (name, args) => {
    requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload as Record<string, unknown>) })
    const prepared = h.storage.read(h.scope).prepared!
    expect(prepared.operation_id).toBe(args.p_payload.operation_id)
    expect(prepared.conteo_id).toBe(h.scope.conteo_id)
    expect(prepared.expected_groups_revision).toBe(h.scope.groups_revision)
    if (responder) return responder(name, args)
    return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
  }
  let serial = 700
  const runtime = new CashierV4Runtime(h.store, h.storage, call, () => uuidFor(serial++), () => clock)
  if (withDraft) runtime.capture(action, action === 'review' ? ids.review : ids.coverage, 10, '10')
  h.store.refresh = async () => {}
  clock = Date.parse(h.store.getSnapshot().panel_state!.session.expira_at) + 1000
  return { ...h, runtime, requests, setClock: (value: number) => { clock = value } }
}

describe('Cajero V4 — Fase 1 autocierre y recovery transparente', () => {
  test('active sin drafts cruza expira_at y finaliza automáticamente una sola vez', async () => {
    const h = activeAutocloseHarness(false)
    expect(h.runtime.shouldAutoClose()).toBe(true)
    expect(await h.runtime.autoCloseExpiredSession()).toBe(true)
    expect(h.requests.map(item => item.action)).toEqual(['finish'])
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.runtime.getSnapshot().closeState).toBe('finished')
    expect(await h.runtime.autoCloseExpiredSession()).toBe(false)
  })

  test('active con drafts hace flush y finish preservando la operación', async () => {
    const h = activeAutocloseHarness(true)
    const draft = h.storage.read(h.scope).normal[0]
    await h.runtime.autoCloseExpiredSession()
    expect(h.requests.map(item => item.action)).toEqual(['save_batch', 'finish'])
    expect(h.storage.read(h.scope).normal).toEqual([])
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.requests[0].payload.items).toEqual([{ client_observation_id: draft.client_observation_id,
      grupo_id: draft.grupo_id, stock_fisico: draft.stock_fisico, contado_at: draft.contado_at }])
    expect(h.requests[0].payload.operation_id).not.toBe(h.requests[1].payload.operation_id)
    expect(h.runtime.pendingCount).toBe(0)
    expect(h.runtime.canCapture('coverage')).toBe(false)
  })

  test('autocierre recount conserva detalle y timestamp pre-expiry', async () => {
    const h = activeAutocloseHarness(true, undefined, 'review')
    const draft = h.storage.read(h.scope).recount[0]
    await h.runtime.autoCloseExpiredSession()
    expect(h.requests.map(item => item.action)).toEqual(['recount_save_batch', 'finish'])
    expect(h.requests[0].payload.items).toEqual([{ detalle_id: draft.detalle_id, stock_fisico: draft.stock_fisico, contado_at: draft.contado_at }])
    expect(h.runtime.pendingCount).toBe(0)
  })

  test('reload restaura bootstrap/storage y replay exacto resuelve batch antes de un solo finish', async () => {
    const h = activeAutocloseHarness(true, async () => { throw new Error('timeout') })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    const before = h.storage.read(h.scope)
    h.runtime.dispose()
    const store = new CashierV4Store(ids.user, h.store.deviceToken, async () => structuredClone(h.initial), () => h.now)
    await store.refresh()
    const requests: Array<{ action: string; payload: Record<string, unknown> }> = []
    let uuidCalls = 0
    const runtime = new CashierV4Runtime(store, new CashierV4DraftStorage(h.raw), async (_name, args) => {
      requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload) })
      const result = h.responseFor(args.p_action as string, args.p_payload)
      result.replay = args.p_action === 'save_batch'
      return result
    }, () => { uuidCalls++; return uuidFor(900 + uuidCalls) }, () => Date.parse(h.initial.panel_state!.session.expira_at) + 1000)
    store.refresh = async () => {}
    expect(runtime.getSnapshot().closeState).toBe('uncertain')
    expect(runtime.shouldAutoClose()).toBe(false)
    expect(h.storage.read(h.scope)).toEqual(before)
    expect(requests).toHaveLength(0)
    await runtime.retryAutoClose()
    expect(requests.map(item => item.action)).toEqual(['save_batch', 'finish'])
    expect(requests[0].payload).toEqual(h.requests[0].payload)
    expect(uuidCalls).toBe(1) // Only the newly prepared finish allocates a UUID.
    expect(runtime.pendingCount).toBe(0)
    runtime.dispose()
  })

  test('recovery propia bloquea un nuevo start aunque no tenga drafts pendientes', async () => {
    const h = draftHarness('none')
    const runtime = new CashierV4Runtime(h.store, h.storage, undefined, () => uuidFor(725), () => h.now)
    const recovery = cashierV4Bootstrap('recovery', { next_action: 'none' })
    recovery.start_capability = { allowed: true, reason: null }
    h.store.acceptBootstrap(recovery)
    runtime.hydrate()

    expect(runtime.pendingCount).toBe(0)
    expect(runtime.hasBlockingRecovery).toBe(true)
    await expect(runtime.start()).rejects.toThrow('pendientes anteriores')
  })

  test('recovery restaurada tras refresh usa scope persistido y puede cerrar sin panel propio', async () => {
    const h = draftHarness('coverage')
    const first = new CashierV4Runtime(h.store, h.storage, undefined, () => uuidFor(730), () => h.now)
    first.capture('coverage', ids.coverage, 10, '10')
    first.dispose()
    h.moveToRecovery()

    const requests: string[] = []
    const call: CashierV4Rpc = async (_name, args) => {
      requests.push(args.p_action as string)
      return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
    }
    const runtime = new CashierV4Runtime(h.store, h.storage, call, () => uuidFor(731 + requests.length), () => h.now)
    h.store.refresh = async () => {}

    expect(runtime.shouldAutoClose()).toBe(true)
    await runtime.autoCloseExpiredSession()
    expect(requests).toEqual(['save_batch', 'finish'])
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.store.getSnapshot().recovery_sessions.some(session => session.id === h.scope.conteo_id)).toBe(false)
  })

  test('timeout conserva prepared incierta y retry reproduce exactamente el mismo payload', async () => {
    let attempts = 0
    const h = activeAutocloseHarness(true, async (_name, args) => {
      attempts++
      if (attempts === 1) throw new Error('timeout')
      return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
    })

    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow('timeout')
    const prepared = h.storage.read(h.scope).prepared!
    expect(prepared.status).toBe('uncertain')
    expect(h.runtime.getSnapshot().closeState).toBe('uncertain')
    expect(h.runtime.shouldAutoClose()).toBe(false)
    expect(h.runtime.canDiscardClose).toBe(false)

    await h.runtime.retryAutoClose()
    expect(h.requests.map(item => item.action)).toEqual(['save_batch', 'save_batch', 'finish'])
    expect(h.requests[1].payload).toEqual(h.requests[0].payload)
    expect(h.storage.read(h.scope).finished).toBe(true)
  })

  test('reload de operación incierta restaura estado y no reintenta automáticamente', async () => {
    let clock = Date.now()
    const h = draftHarness('coverage')
    clock = h.now
    const failing = new CashierV4Runtime(h.store, h.storage, async () => { throw new Error('timeout') },
      () => uuidFor(740), () => clock)
    failing.capture('coverage', ids.coverage, 10, '10')
    clock = Date.parse(h.store.getSnapshot().panel_state!.session.expira_at) + 1000
    await expect(failing.autoCloseExpiredSession()).rejects.toThrow('timeout')
    const operationId = h.storage.read(h.scope).prepared?.operation_id
    failing.dispose()

    let calls = 0
    const reloaded = new CashierV4Runtime(h.store, h.storage, async () => { calls++; throw new Error('no debería llamarse') },
      () => uuidFor(741), () => clock)
    expect(reloaded.getSnapshot().closeState).toBe('uncertain')
    expect(reloaded.getSnapshot().closeConteoId).toBe(h.scope.conteo_id)
    expect(reloaded.shouldAutoClose()).toBe(false)
    expect(h.storage.read(h.scope).prepared?.operation_id).toBe(operationId)
    expect(calls).toBe(0)
    reloaded.dispose()
  })

  test('rechazo conocido queda rejected y permite descarte seguro seguido de finish', async () => {
    let rejected = false
    const h = activeAutocloseHarness(true, async (_name, args) => {
      if (!rejected && args.p_action === 'save_batch') {
        rejected = true
        throw new SologApiError('SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT')
      }
      return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
    })

    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    expect(h.runtime.getSnapshot().closeState).toBe('failed_known')
    expect(h.storage.read(h.scope).prepared?.status).toBe('rejected')

    await h.runtime.discardAndFinishRecovery()
    const record = h.storage.read(h.scope)
    expect(record.normal).toEqual([])
    expect(record.recount).toEqual([])
    expect(record.finished).toBe(true)
    expect(h.requests.map(item => item.action)).toEqual(['save_batch', 'finish'])
  })

  test('conflicto idempotente bloquea descarte y no dispara retries automáticos', async () => {
    const h = activeAutocloseHarness(true, async () => { throw new SologApiError('SOLOG_IDEMPOTENCY_CONFLICT') })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    expect(h.runtime.getSnapshot().closeState).toBe('conflict')
    expect(h.storage.read(h.scope).prepared?.status).toBe('conflict')
    expect(h.runtime.shouldAutoClose()).toBe(false)
    await expect(h.runtime.discardAndFinishRecovery()).rejects.toThrow('no pueden descartarse')
    expect(h.requests).toHaveLength(1)
    const before = h.storage.read(h.scope)
    await expect(h.runtime.retryAutoClose()).rejects.toThrow()
    expect(h.storage.read(h.scope)).toEqual(before)
    expect(h.requests).toHaveLength(1)
  })

  test('operation in progress se trata como incierta y conserva el mismo operation_id', async () => {
    let first = true
    const h = activeAutocloseHarness(true, async (_name, args) => {
      if (first) { first = false; throw new SologApiError('SOLOG_OPERATION_IN_PROGRESS') }
      return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
    })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    expect(h.runtime.getSnapshot().closeState).toBe('uncertain')
    expect(h.storage.read(h.scope).prepared?.status).toBe('in_progress')
    const operationId = h.storage.read(h.scope).prepared?.operation_id
    await h.runtime.retryAutoClose()
    expect(h.requests[1].payload.operation_id).toBe(operationId)
    expect(h.requests[1].payload).toEqual(h.requests[0].payload)
    expect(h.requests.map(item => item.action)).toEqual(['save_batch', 'save_batch', 'finish'])
  })

  test('ausencia del lifecycle no confirma estado terminal ni permite borrar evidencia', async () => {
    const h = activeAutocloseHarness(true, async () => { throw new SologApiError('SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT') })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    const terminal = structuredClone(h.initial)
    terminal.panel_state = null
    terminal.recovery_sessions = []
    terminal.session_capability = {
      mode: 'none', estado: null, capture_allowed: false, pending_delivery_allowed: false,
      iniciado_at: null, expira_at: null, recovery_until: null, finalizado_at: null,
    }
    terminal.start_capability = { allowed: false, reason: 'SOLOG_STOCK_EXPIRED' }
    h.store.acceptBootstrap(terminal)

    const before = h.storage.read(h.scope)
    expect(() => h.runtime.cleanupConfirmedTerminal()).toThrow()
    expect(h.storage.read(h.scope)).toEqual(before)
    expect(h.runtime.getSnapshot().closeState).toBe('failed_known')
    expect(h.runtime.canDiscardClose).toBe(false)
  })

  test('requiresRefresh bloquea descarte y lifecycle no operable conserva registros', async () => {
    const h = activeAutocloseHarness(true, async () => { throw new SologApiError('SOLOG_SESSION_DELIVERY_NOT_ALLOWED') })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    const before = h.storage.read(h.scope)
    expect(h.runtime.canDiscardClose).toBe(false)
    await expect(h.runtime.discardAndFinishRecovery()).rejects.toThrow()
    expect(h.storage.read(h.scope)).toEqual(before)
  })

  test('limpieza explícita de residuos exige finish confirmado y conserva otro scope', async () => {
    const h = activeAutocloseHarness(true)
    const draft = h.storage.read(h.scope).normal[0]
    const otherScope = { ...h.scope, conteo_id: ids.recovery }
    const other = { ...h.storage.read(h.scope), scope: otherScope, delivery_state: null,
      normal: [{ ...draft, scope: otherScope }] }
    h.raw.setItem(cashierV4DraftStorageKey(otherScope), JSON.stringify(other))
    await h.runtime.autoCloseExpiredSession()
    const finished = h.storage.read(h.scope)
    h.raw.setItem(cashierV4DraftStorageKey(h.scope), JSON.stringify({ ...finished, normal: [draft] }))
    h.runtime.hydrate()
    h.runtime.cleanupConfirmedTerminal()
    expect(h.storage.read(h.scope).normal).toEqual([])
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.storage.read(otherScope)).toEqual(other)
  })
})
