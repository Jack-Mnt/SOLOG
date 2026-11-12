import { describe, expect, test } from 'bun:test'
import { FullRuntime, ServerClock, type FullRpc } from '../src/features/solog/cajero/full.runtime'
import type { CashierStartOfferV3, FullState } from '../src/features/solog/cajero/full.contract'

const uuid = (suffix: string) => `12345678-1234-4123-8123-${suffix}`
const userId = uuid('1234567890ab')
const initialSnapshot = uuid('1234567890ac')
const replacementSnapshot = uuid('1234567890ad')
const requestId = uuid('1234567890ae')
const now = Date.parse('2026-11-11T12:05:00-05:00')
const newCapture = Date.parse('2026-11-11T11:59:30-05:00')
const oldCapture = Date.parse('2026-11-11T11:00:00-05:00')
const iso = (v: number) => new Date(v).toISOString()

type Options = {
  status?: 'new' | 'fallback' | 'unavailable'
  changeReference?: boolean
  failNetwork?: boolean
  failedCode?: string
  tooShort?: boolean
  missingOffer?: boolean
}
function harness(opts: Options = {}) {
  const store = new Map<string, string>()
  let bootstrapReads = 0
  let serverNow = now
  const rpcCalls: { action: string; payload: Record<string, unknown> }[] = []
  let mutationAttempts = 0
  const token = 'a'.repeat(64)
  const status = opts.status ?? 'new'
  const firstCapture = status === 'fallback' ? oldCapture : newCapture
  const chosenSnapshot = (read: number) => opts.changeReference && read >= 2 ? replacementSnapshot : initialSnapshot
  const makeOffer = (snapshotId: string, capture: number): CashierStartOfferV3 => {
    const cycle = Math.floor(serverNow / 3_600_000) * 3_600_000 - 60_000
    const effectiveEnd = Math.min(
      Math.floor(serverNow / 3_600_000) * 3_600_000 + 3_600_000,
      capture + 7_200_000,
    )
    if (status === 'unavailable') return {
      policy_version: 3, cycle_started_at: iso(cycle), status,
      snapshot_id: null, requires_confirmation: false, can_start: false,
      capture_ends_at: null, block_reason: 'START_WINDOW_CLOSED',
    }
    return {
      policy_version: 3, cycle_started_at: iso(cycle), status,
      snapshot_id: snapshotId, requires_confirmation: status === 'fallback',
      can_start: true, capture_ends_at: iso(effectiveEnd),
      block_reason: null,
    }
  }
  const rpc: FullRpc = async (name, args) => {
    if (name === 'rpc_solog_cashier_bootstrap_v6') {
      bootstrapReads++
      const capture = firstCapture
      const snapshotId = chosenSnapshot(bootstrapReads)
      const offer = makeOffer(snapshotId, capture)
      const state: FullState = {
        timezone: 'America/Lima', site: { id: uuid('1234567890af'), nombre: 'Cutervo' },
        stock: {
          snapshot_id: snapshotId,
          snapshot_captured_at: iso(capture),
          snapshot_confirmed_at: iso(capture + 30_000),
          stock_expires_at: iso(capture + 7_200_000),
          is_fresh: true, is_fallback: status === 'fallback',
          catalog_version: 1, groups_revision: 1,
        },
        ...(opts.missingOffer ? {} : { start_offer: offer }),
        session: null, recovery_sessions: [], groups: [],
        operational_summary: {
          basis: {
            coverage_round: 2,
            round_starts_at: iso(now - 86_400_000),
            round_ends_at: iso(now + 86_400_000),
          },
          coverage_total: 0, coverage_counted: 0, coverage_pending: 0,
          coverage_percent: 0, review_pending: 0, daily_pending: 0,
          next_action: 'none',
        },
        confirmed_observation_ids: [], recovery_manifests: [],
        capabilities: {
          can_start_session: status !== 'unavailable',
          can_capture_in_current_session: false,
          block_reason: status === 'unavailable' ? 'START_WINDOW_CLOSED' : null,
        },
      }
      return {
        ok: true, code: 'CASHIER_STATE', contract_version: 2,
        server_now: iso(serverNow), request_id: requestId, retryable: false, data: state,
      }
    }
    const payload = args.p_payload as Record<string, unknown>
    mutationAttempts++
    rpcCalls.push({ action: String(args.p_action), payload: structuredClone(payload) })
    if (opts.failNetwork) throw new Error('network lost')
    return {
      ok: false, code: opts.failedCode ?? 'START_CAPTURE_TOO_SHORT',
      contract_version: 2, server_now: iso(serverNow), request_id: requestId,
      retryable: false, data: null, action_required: 'wait',
      errors: [{ code: opts.failedCode ?? 'START_CAPTURE_TOO_SHORT', message: 'No aplicada', field_path: '' }],
    }
  }
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
  }
  let monotonic = 0
  const makeRuntime = () => new FullRuntime(userId, token, storage, rpc, {
    lock: async fn => fn(),
    clock: new ServerClock(() => monotonic, () => monotonic),
  })
  const runtime = makeRuntime()
  return {
    runtime, makeRuntime, storage, token, store,
    calls: () => structuredClone(rpcCalls),
    attempts: () => mutationAttempts,
    bootstrapReads: () => bootstrapReads,
    setServerNow: (v: number) => { serverNow = v; monotonic += v - now },
  }
}

describe('Cajero Full — Fase 2 inicio V3, selección y journal seguro', () => {
  test('inicia con oferta new y persiste exactamente los tres campos antes del primer intento V7', async () => {
    const h = harness({ failNetwork: true })
    await expect(h.runtime.start()).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(h.attempts()).toBe(1)
    const pending = h.runtime.inspectPending()
    expect(pending).toHaveLength(1)
    const payload = JSON.parse(pending[0].exactPayload)
    expect(payload).toEqual({
      device_token: h.token, operation_id: pending[0].operationId,
      expected_snapshot_id: initialSnapshot,
      expected_cycle_started_at: '2026-11-11T16:59:00.000Z',
      selected_as: 'new',
    })
    expect(h.calls()[0].payload).toEqual(payload)
    expect(h.bootstrapReads()).toBe(1)
  })

  test('cambio de snapshot entre V6 visible y V6 pre-start nunca sustituye la selección', async () => {
    const h = harness({ changeReference: true })
    await h.runtime.refresh()
    const selected = structuredClone(h.runtime.getSnapshot().bootstrap!.start_offer!)
    expect(selected.snapshot_id).toBe(initialSnapshot)
    await expect(h.runtime.start(selected)).rejects.toThrow('SNAPSHOT_SELECTION_CHANGED')
    expect(h.attempts()).toBe(0)
    expect(h.runtime.inspectPending()).toEqual([])
    expect(h.runtime.getSnapshot().bootstrap?.start_offer?.snapshot_id).toBe(replacementSnapshot)
  })

  test('fallback requiere aceptación explícita y conserva la selección hasta V7', async () => {
    const h = harness({ status: 'fallback', failNetwork: true })
    await h.runtime.refresh()
    const selected = structuredClone(h.runtime.getSnapshot().bootstrap!.start_offer!)
    expect(selected.status).toBe('fallback')
    expect(selected.requires_confirmation).toBe(true)
    await expect(h.runtime.start()).rejects.toThrow('FULL_FALLBACK_CONFIRMATION_REQUIRED')
    expect(h.attempts()).toBe(0)
    await expect(h.runtime.start(selected)).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(h.calls()[0].payload.expected_snapshot_id).toBe(initialSnapshot)
    expect(h.calls()[0].payload.selected_as).toBe('fallback')
    expect(h.runtime.inspectPending()[0].action).toBe('start')
  })

  test('oferta ausente o no disponible bloquea inicio sin preparar journal', async () => {
    const without = harness({ missingOffer: true })
    await expect(without.runtime.start()).rejects.toThrow('FULL_START_OFFER_REQUIRED')
    expect(without.attempts()).toBe(0)
    const blocked = harness({ status: 'unavailable' })
    await expect(blocked.runtime.start()).rejects.toThrow('START_WINDOW_CLOSED')
    expect(blocked.attempts()).toBe(0)
  })

  test('replay tras timeout conserva mismo UUID/payload aunque nueva consulta V6 cambie', async () => {
    const h = harness({ failNetwork: true, changeReference: true })
    // Primera lectura e intento V7 fallido. El retry no hará una nueva selección.
    await expect(h.runtime.start()).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    const first = h.calls()[0]
    const prepared = h.runtime.inspectPending()[0]
    await expect(h.runtime.resumePrepared()).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(h.calls()).toHaveLength(2)
    expect(h.calls()[1]).toEqual(first)
    expect(h.runtime.inspectPending()[0].exactPayload).toBe(prepared.exactPayload)
    expect(h.runtime.inspectPending()[0].operationId).toBe(prepared.operationId)
  })

  test('una selección explícita diferente a la visible no autoriza V7', async () => {
    const h = harness({ failNetwork: true })
    await h.runtime.refresh()
    const selected = structuredClone(h.runtime.getSnapshot().bootstrap!.start_offer!)
    selected.snapshot_id = replacementSnapshot
    await expect(h.runtime.start(selected)).rejects.toThrow('SNAPSHOT_SELECTION_CHANGED')
    expect(h.attempts()).toBe(0)
  })

  test('rechazo definitivo de start V2 antiguo se conserva y permite descarte humano explícito', async () => {
    const h = harness({ failedCode: 'START_POLICY_UPGRADE_REQUIRED' })
    const id = uuid('1234567890b1')
    const v2 = { operation_id: id, device_token: h.token }
    const old = {
      version: 2, userId, deviceToken: h.token,
      pending: [{
        operationId: id, action: 'start', sessionId: null,
        exactPayload: JSON.stringify(v2), status: 'pending', code: null,
      }],
      confirmed: {}, panels: {}, drafts: {},
    }
    h.storage.setItem(h.runtime.key, JSON.stringify(old))
    const resumed = h.makeRuntime()
    await expect(resumed.resumePrepared()).rejects.toThrow('START_POLICY_UPGRADE_REQUIRED')
    const rejected = resumed.inspectPending()[0]
    expect(rejected.status).toBe('rejected')
    expect(rejected.code).toBe('START_POLICY_UPGRADE_REQUIRED')
    expect(h.calls()[0].payload).toEqual(v2)
    const incident = resumed.getIncidents()[0]
    expect(resumed.canDiscardIncident(incident)).toBe(true)
    await resumed.discardRejectedOperation(id)
    expect(resumed.inspectPending()).toEqual([])
  })

  test('errores retryables o de identidad no permiten descarte de start', async () => {
    const h = harness()
    const id = uuid('1234567890b2')
    const build = (code: string) => JSON.stringify({
      version: 2, userId, deviceToken: h.token,
      pending: [{
        operationId: id, action: 'start', sessionId: null,
        exactPayload: JSON.stringify({ operation_id: id, device_token: h.token }),
        status: 'rejected', code,
      }],
      confirmed: {}, panels: {}, drafts: {},
    })
    for (const code of ['IDEMPOTENCY_CONFLICT', 'INTERNAL_ERROR']) {
      h.storage.setItem(h.runtime.key, build(code))
      const runtime = h.makeRuntime()
      expect(runtime.canDiscardIncident(runtime.getIncidents()[0])).toBe(false)
      await expect(runtime.discardRejectedOperation(id)).rejects.toThrow('FULL_INCIDENT_DISCARD_BLOCKED')
    }
  })
})
