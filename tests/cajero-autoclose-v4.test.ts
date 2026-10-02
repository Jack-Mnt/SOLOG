import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import type { CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import { CashierV4Runtime } from '../src/features/solog/cajero/cajero.v4.runtime'
import { draftHarness, uuidFor } from './fixtures/cashier-v4-drafts'
import { cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'

function activeAutocloseHarness(withDraft = false, responder?: CashierV4Rpc) {
  const h = draftHarness('coverage')
  let clock = h.now
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = []
  const call: CashierV4Rpc = async (name, args) => {
    requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload as Record<string, unknown>) })
    if (responder) return responder(name, args)
    return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
  }
  let serial = 700
  const runtime = new CashierV4Runtime(h.store, h.storage, call, () => uuidFor(serial++), () => clock)
  if (withDraft) runtime.capture('coverage', ids.coverage, 10, '10')
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
    await h.runtime.autoCloseExpiredSession()
    expect(h.requests.map(item => item.action)).toEqual(['save_batch', 'finish'])
    expect(h.storage.read(h.scope).normal).toEqual([])
    expect(h.storage.read(h.scope).finished).toBe(true)
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

    await h.runtime.retryAutoClose()
    expect(h.requests.map(item => item.action)).toEqual(['save_batch', 'save_batch', 'finish'])
    expect(h.requests[1].payload).toEqual(h.requests[0].payload)
    expect(h.storage.read(h.scope).finished).toBe(true)
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
  })
})
