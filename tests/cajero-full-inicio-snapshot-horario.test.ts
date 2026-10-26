import { describe, expect, test } from 'bun:test'
import { cashierStartGate } from '../src/features/solog/cajero/full.start-gate'
import { FullRuntime, type FullRpc } from '../src/features/solog/cajero/full.runtime'

const time = (local: string) => Date.parse(local)
const gate = (local: string, confirmedAt: string | null = null, trusted = true, capturedAt: string | null = confirmedAt) =>
  cashierStartGate(time(local), trusted, confirmedAt, capturedAt)

describe('Cajero Full — protección frontend de inicio por snapshot horario', () => {
  test('antes del minuto 59 no introduce bloqueo nuevo', () => {
    expect(gate('2026-10-23T08:58:59.999-05:00').phase).toBe('outside_transition')
    expect(gate('2026-10-23T08:58:59.999-05:00').blocked).toBe(false)
  })

  test('minuto 59 completo se bloquea aunque se confirme el snapshot nuevo', () => {
    const newSnapshot = '2026-10-23T08:59:22-05:00'
    for (const at of [
      '2026-10-23T08:59:00-05:00',
      '2026-10-23T08:59:22-05:00',
      '2026-10-23T08:59:59.999-05:00',
    ]) {
      const result = gate(at, newSnapshot)
      expect(result.phase).toBe('minute_59')
      expect(result.blocked).toBe(true)
    }
    expect(gate('2026-10-23T08:59:00-05:00').remainingMs).toBe(180_000)
    expect(gate('2026-10-23T08:59:59.999-05:00').remainingMs).toBe(120_001)
  })

  test('de HH+1:00 a HH+1:01:59 solo deja iniciar con snapshot confirmado en el ciclo', () => {
    const old = '2026-10-23T07:59:22-05:00'
    const current = '2026-10-23T08:59:22-05:00'
    const at = '2026-10-23T09:00:00-05:00'
    expect(gate(at, old).phase).toBe('waiting_new_snapshot')
    expect(gate(at, null).blocked).toBe(true)
    expect(gate(at, current).phase).toBe('new_snapshot_ready')
    expect(gate(at, current).blocked).toBe(false)
    expect(gate('2026-10-23T09:01:59.999-05:00', old).blocked).toBe(true)
    expect(gate('2026-10-23T09:01:59.999-05:00', current).blocked).toBe(false)
  })

  test('snapshot confirmado en el segundo 22 de la hora siguiente abre inicio de inmediato', () => {
    const newSnapshot = '2026-10-23T09:00:22-05:00'
    expect(gate('2026-10-23T09:00:21.999-05:00', newSnapshot).phase).toBe('waiting_new_snapshot')
    expect(gate('2026-10-23T09:00:22-05:00', newSnapshot).phase).toBe('new_snapshot_ready')
  })

  test('no admite un snapshot antiguo confirmado tarde como actualización del ciclo actual', () => {
    const lateConfirmation = '2026-10-23T09:00:22-05:00'
    const oldCapture = '2026-10-23T07:59:12-05:00'
    const newCapture = '2026-10-23T08:59:12-05:00'
    const at = '2026-10-23T09:00:23-05:00'
    expect(gate(at, lateConfirmation, true, oldCapture).phase).toBe('waiting_new_snapshot')
    expect(gate(at, lateConfirmation, true, newCapture).phase).toBe('new_snapshot_ready')
    expect(gate(at, lateConfirmation, true, null).blocked).toBe(true)
  })

  test('exactamente tres minutos desde HH:59 desbloquea el respaldo', () => {
    const previous = '2026-10-23T07:59:22-05:00'
    const t = gate('2026-10-23T09:02:00-05:00', previous)
    expect(t.phase).toBe('outside_transition')
    expect(t.blocked).toBe(false)
    expect(t.remainingMs).toBe(0)
    // La validez de dos horas y la autorización efectiva se comprueban con V6.
  })

  test('no confunde confirmaciones de días diferentes al pasar por medianoche', () => {
    const old = '2026-10-22T23:59:22-05:00'
    const current = '2026-10-23T23:59:22-05:00'
    expect(gate('2026-10-23T23:59:45-05:00', current).blocked).toBe(true)
    expect(gate('2026-10-24T00:00:00-05:00', old).phase).toBe('waiting_new_snapshot')
    expect(gate('2026-10-24T00:00:00-05:00', current).phase).toBe('new_snapshot_ready')
    expect(gate('2026-10-24T00:02:00-05:00', old).blocked).toBe(false)
  })

  test('la compuerta también cubre el minuto 59 anterior a un cambio de turno', () => {
    for (const at of ['2026-10-23T07:59:30-05:00', '2026-10-23T15:59:30-05:00']) {
      expect(gate(at).phase).toBe('minute_59')
    }
  })

  test('fail closed sin reloj sincronizado; una confirmación futura no sirve', () => {
    expect(gate('2026-10-23T09:00:30-05:00', null, false).phase).toBe('untrusted')
    expect(cashierStartGate(Number.NaN, true, null, null).blocked).toBe(true)
    expect(gate('2026-10-23T09:00:21-05:00', '2026-10-23T09:00:22-05:00').blocked).toBe(true)
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
          stock: {
            snapshot_id: snapshotId,
            snapshot_captured_at: iso(captureAt),
            snapshot_confirmed_at: iso(confirmedAt),
            stock_expires_at: new Date(captured + 7_200_000).toISOString(),
            is_fresh: true, is_fallback: Date.parse(serverNow) - captured >= 3_600_000,
            catalog_version: 1, groups_revision: 1,
          },
          session: null, recovery_sessions: [], groups: [],
          confirmed_observation_ids: [], recovery_manifests: [],
          capabilities: { can_start_session: true, can_capture_in_current_session: false, block_reason: null },
        },
      }
    }
    const runtime = new FullRuntime(userId, 'a'.repeat(64), storage, rpc, {
      lock: async action => action(),
    })
    return { runtime, getMutationCalls: () => mutationCalls }
  }

  test('si bootstrap termina durante el minuto 59, no prepara ni envía un inicio', async () => {
    const { runtime, getMutationCalls } = setup(
      '2026-10-23T08:59:30-05:00',
      '2026-10-23T08:59:00-05:00',
      '2026-10-23T08:59:22-05:00',
    )
    await expect(runtime.start()).rejects.toThrow('FULL_HOURLY_START_GATE')
    expect(runtime.inspectPending()).toEqual([])
    expect(getMutationCalls()).toBe(0)
  })

  test('tras HH+1:02 el inicio de respaldo pasa la guardia sin perder el outbox', async () => {
    const { runtime, getMutationCalls } = setup(
      '2026-10-23T09:02:00-05:00',
      '2026-10-23T07:59:00-05:00',
      '2026-10-23T07:59:22-05:00',
    )
    await expect(runtime.start()).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(getMutationCalls()).toBe(1)
    expect(runtime.inspectPending()).toHaveLength(1)
    expect(runtime.inspectPending()[0].action).toBe('start')
  })
})
