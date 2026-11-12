import { describe, expect, test } from 'bun:test'
import { cashierStartGate } from '../src/features/solog/cajero/full.start-gate'
import type { CashierStartOfferV3 } from '../src/features/solog/cajero/full.contract'
import { FullRuntime, type FullRpc } from '../src/features/solog/cajero/full.runtime'

const time = (local: string) => Date.parse(local)
const cycle = '2026-10-23T13:59:00.000Z'
const offer = (kind: 'new' | 'fallback' | 'unavailable' = 'new',
  end = '2026-10-23T15:00:00.000Z'): CashierStartOfferV3 => ({
  policy_version: 3, cycle_started_at: cycle,
  status: kind, snapshot_id: kind === 'unavailable' ? null : '12345678-1234-4123-8123-1234567890ac',
  requires_confirmation: kind === 'fallback', can_start: kind !== 'unavailable',
  capture_ends_at: kind === 'unavailable' ? null : end,
  block_reason: kind === 'unavailable' ? 'STOCK_EXPIRED' : null,
})
const gate = (local: string, selected: CashierStartOfferV3 | null = offer(), trusted = true) =>
  cashierStartGate(time(local), trusted, selected)

describe('Cajero Full V3 — guardia de presentación horaria', () => {
  test('permite new y fallback desde HH:00; el respaldo mantiene confirmación en V7', () => {
    expect(gate('2026-10-23T09:00:00-05:00').phase).toBe('new')
    expect(gate('2026-10-23T09:00:00-05:00').blocked).toBe(false)
    expect(gate('2026-10-23T09:01:59.999-05:00', offer('fallback')).phase).toBe('fallback')
    expect(gate('2026-10-23T09:02:00-05:00', offer('fallback')).blocked).toBe(false)
  })

  test('HH:56:59.999 con 180.001 segundos habilita; HH:57:00 bloquea', () => {
    expect(gate('2026-10-23T09:56:59.999-05:00').blocked).toBe(false)
    const closed = gate('2026-10-23T09:57:00-05:00')
    expect(closed.phase).toBe('window_closed')
    expect(closed.reason).toBe('START_WINDOW_CLOSED')
    expect(closed.remainingMs).toBe(180_000)
    expect(gate('2026-10-23T09:59:59.999-05:00', offer('fallback')).blocked).toBe(true)
  })

  test('límite de 180 segundos considera expiración de stock anterior al ciclo', () => {
    expect(gate('2026-10-23T09:30:00-05:00', offer('fallback', '2026-10-23T14:33:00.000Z')).blocked).toBe(false)
    const short = gate('2026-10-23T09:30:00.001-05:00', offer('fallback', '2026-10-23T14:33:00.000Z'))
    expect(short.phase).toBe('capture_too_short')
    expect(short.reason).toBe('START_CAPTURE_TOO_SHORT')
  })

  test('oferta unavailable y ausencia de V6 nunca conceden inicio offline', () => {
    expect(gate('2026-10-23T09:00:00-05:00', offer('unavailable')).reason).toBe('STOCK_EXPIRED')
    expect(gate('2026-10-23T09:00:00-05:00', null).phase).toBe('awaiting_offer')
    expect(gate('2026-10-23T09:00:00-05:00', null).blocked).toBe(true)
    expect(gate('2026-10-23T09:00:00-05:00', offer(), false).phase).toBe('untrusted')
    expect(cashierStartGate(Number.NaN, true, offer()).blocked).toBe(true)
  })

  test('oferta de ciclo anterior es obsoleta incluso si snapshot sigue vigente', () => {
    expect(gate('2026-10-23T10:00:00-05:00', offer()).phase).toBe('stale_offer')
    expect(gate('2026-10-24T09:00:00-05:00', offer()).blocked).toBe(true)
  })

  test('no existe bloqueo de 3 minutos ni espera automática por confirmación', () => {
    expect(gate('2026-10-23T09:00:10-05:00', offer('fallback')).blocked).toBe(false)
    expect(gate('2026-10-23T09:00:10-05:00', offer()).blocked).toBe(false)
    expect(gate('2026-10-23T08:59:30-05:00', offer()).phase).toBe('window_closed')
  })
})

describe('Cajero Full — protección de runtime durante el inicio remoto', () => {
  const userId = '12345678-1234-4123-8123-1234567890ab'
  const snapshotId = '12345678-1234-4123-8123-1234567890ac'
  const requestId = '12345678-1234-4123-8123-1234567890ad'
  const iso = (value: string) => new Date(value).toISOString()

  function setup(serverNow: string, captureAt: string, confirmedAt: string) {
    let mutationCalls = 0
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
    }
    const captured = Date.parse(captureAt)
    const now = Date.parse(serverNow)
    const cycle = Math.floor(now / 3_600_000) * 3_600_000 - 60_000
    const captureEnd = Math.min(captured + 7_200_000, Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000)
    const windowClosed = new Date(now).getUTCMinutes() >= 57
    const canStart = !windowClosed && captureEnd - now >= 180_000
    const offerStatus = captured >= cycle ? 'new' : 'fallback'
    const rpc: FullRpc = async name => {
      if (name === 'rpc_solog_cashier_mutate_v7') {
        mutationCalls++
        // Simulación de red inestable: la operación debe permanecer en outbox.
        throw new Error('network unavailable')
      }
      return {
        ok: true, code: 'CASHIER_STATE', contract_version: 2,
        request_id: requestId, server_now: iso(serverNow), retryable: false,
        data: {
          timezone: 'America/Lima',
          site: { id: '12345678-1234-4123-8123-1234567890e1', nombre: 'Cutervo' },
          stock: {
            snapshot_id: snapshotId,
            snapshot_captured_at: iso(captureAt),
            snapshot_confirmed_at: iso(confirmedAt),
            stock_expires_at: new Date(captured + 7_200_000).toISOString(),
            is_fresh: true, is_fallback: Date.parse(serverNow) - captured >= 3_600_000,
            catalog_version: 1, groups_revision: 1,
          },
          operational_summary: {
            basis: { coverage_round: 2,
              round_starts_at: new Date(Date.parse(serverNow) - 86400000).toISOString(),
              round_ends_at: new Date(Date.parse(serverNow) + 86400000).toISOString() },
            coverage_total: 0, coverage_counted: 0, coverage_pending: 0, coverage_percent: 0,
            review_pending: 0, daily_pending: 0, next_action: 'none',
          },
          session: null, recovery_sessions: [], groups: [],
          confirmed_observation_ids: [], recovery_manifests: [],
          start_offer: {
            policy_version: 3, cycle_started_at: new Date(cycle).toISOString(),
            status: canStart ? offerStatus : 'unavailable',
            snapshot_id: canStart ? snapshotId : null,
            requires_confirmation: canStart && offerStatus === 'fallback',
            can_start: canStart, capture_ends_at: canStart ? new Date(captureEnd).toISOString() : null,
            block_reason: canStart ? null : windowClosed ? 'START_WINDOW_CLOSED' : 'START_CAPTURE_TOO_SHORT',
          },
          capabilities: { can_start_session: canStart, can_capture_in_current_session: false,
            block_reason: canStart ? null : windowClosed ? 'START_WINDOW_CLOSED' : 'START_CAPTURE_TOO_SHORT' },
        },
      }
    }
    const runtime = new FullRuntime(userId, 'a'.repeat(64), storage, rpc, {
      lock: async action => action(),
    })
    return { runtime, getMutationCalls: () => mutationCalls }
  }

  test('V6 bloquea el inicio desde HH:57 sin preparar operación', async () => {
    const { runtime, getMutationCalls } = setup(
      '2026-10-23T08:59:30-05:00',
      '2026-10-23T08:59:00-05:00',
      '2026-10-23T08:59:22-05:00',
    )
    await expect(runtime.start()).rejects.toThrow('START_WINDOW_CLOSED')
    expect(runtime.inspectPending()).toEqual([])
    expect(getMutationCalls()).toBe(0)
  })

  test('el respaldo V3 requiere selección explícita y conserva el payload del outbox', async () => {
    const { runtime, getMutationCalls } = setup(
      '2026-10-23T09:02:00-05:00',
      '2026-10-23T07:59:00-05:00',
      '2026-10-23T07:59:22-05:00',
    )
    await runtime.refresh()
    const selected = runtime.getSnapshot().bootstrap?.start_offer
    expect(selected?.status).toBe('fallback')
    await expect(runtime.start()).rejects.toThrow('FULL_FALLBACK_CONFIRMATION_REQUIRED')
    expect(getMutationCalls()).toBe(0)
    await expect(runtime.start(selected)).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(getMutationCalls()).toBe(1)
    expect(runtime.inspectPending()).toHaveLength(1)
    const [pending] = runtime.inspectPending()
    expect(pending.action).toBe('start')
    const payload = JSON.parse(pending.exactPayload)
    expect(payload.expected_snapshot_id).toBe(snapshotId)
    expect(payload.expected_cycle_started_at).toBe(selected?.cycle_started_at)
    expect(payload.selected_as).toBe('fallback')
  })
})
