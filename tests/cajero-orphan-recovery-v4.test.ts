import { describe, expect, test } from 'bun:test'
import { CashierV4Runtime } from '../src/features/solog/cajero/cajero.v4.runtime'
import type { CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import { CashierV4DraftStorage } from '../src/features/solog/cajero/cajero.v4.storage'
import { draftHarness, memoryStorage, uuidFor } from './fixtures/cashier-v4-drafts'

function orphanHarness(respond?: CashierV4Rpc) {
  const h = draftHarness('coverage')
  h.moveToRecovery()
  const storage = new CashierV4DraftStorage(memoryStorage())
  const calls: Array<{ name: string; payload: Record<string, unknown> }> = []
  const call: CashierV4Rpc = async (name, args) => {
    calls.push({ name, payload: structuredClone(args.p_payload as Record<string, unknown>) })
    const result = respond ? await respond(name, args)
      : h.responseFor('finish', args.p_payload as Record<string, unknown>)
    // orphan_finish_v1 conserva la respuesta contract_version=4, a diferencia
    // de las mutaciones operativas, que ya usan exclusivamente V5.
    return name === 'rpc_solog_cashier_orphan_finish_v1' && result !== null &&
      typeof result === 'object' && !Array.isArray(result)
      ? { ...result, contract_version: 4 }
      : result
  }
  const runtime = new CashierV4Runtime(h.store, storage, call, () => uuidFor(976), () => h.now)
  h.store.refresh = async () => {}
  return { ...h, runtime, calls, storage }
}

describe('Cajero V4 — recovery sin scope local', () => {
  test('cierra una recovery propia sin fabricar scope ni revision y reutiliza el contrato finish', async () => {
    const h = orphanHarness()
    expect(h.runtime.pendingCount).toBe(0)
    expect(h.runtime.shouldAutoClose()).toBe(true)
    expect(await h.runtime.autoCloseExpiredSession()).toBe(true)
    expect(h.calls).toEqual([{ name: 'rpc_solog_cashier_orphan_finish_v1', payload: {
      conteo_id: h.scope.conteo_id,
      operation_id: h.scope.conteo_id,
      device_token: h.store.deviceToken,
    } }])
    expect(h.store.getSnapshot().recovery_sessions).toHaveLength(0)
    expect(h.runtime.hasBlockingRecovery).toBe(false)
    expect(h.runtime.shouldAutoClose()).toBe(false)
    h.runtime.dispose()
  })

  test('respuesta ambigua exige retry explícito con exactamente el mismo identificador', async () => {
    let calls = 0
    const h = orphanHarness(async (_name, args) => {
      calls++
      if (calls === 1) throw new Error('timeout')
      return h.responseFor('finish', args.p_payload as Record<string, unknown>)
    })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow('timeout')
    expect(h.runtime.getSnapshot().closeState).toBe('uncertain')
    expect(h.runtime.shouldAutoClose()).toBe(false)
    await h.runtime.retryAutoClose()
    expect(h.calls).toHaveLength(2)
    expect(h.calls[0].payload).toEqual(h.calls[1].payload)
    expect(h.runtime.getSnapshot().closeState).toBe('finished')
    h.runtime.dispose()
  })

  test('logout resuelve primero recovery sin scope y solo entonces sale', async () => {
    const h = orphanHarness()
    let loggedOut = false
    await h.runtime.logoutSafe(async () => { loggedOut = true })
    expect(loggedOut).toBe(true)
    expect(h.calls.map(x => x.name)).toEqual(['rpc_solog_cashier_orphan_finish_v1', 'rpc_solog_cashier_mutate_v5'])
    expect(h.calls[1].payload.conteo_id).not.toBe(h.scope.conteo_id)
    h.runtime.dispose()
  })

  test('rechazo backend bloquea cierre, start y salida sin borrar datos', async () => {
    const h = orphanHarness(async () => { throw new Error('SOLOG_RECOVERY_OPERATION_UNRESOLVED') })
    await expect(h.runtime.autoCloseExpiredSession()).rejects.toThrow()
    expect(h.runtime.hasBlockingRecovery).toBe(true)
    expect(h.runtime.getSnapshot().closeState).toBe('uncertain')
    expect(h.storage.sessions({ usuario_id: h.scope.usuario_id, sede_id: h.scope.sede_id, dispositivo_id: h.scope.dispositivo_id }).filter(record => record.scope.conteo_id === h.scope.conteo_id)).toHaveLength(0)
    h.runtime.dispose()
  })
})
