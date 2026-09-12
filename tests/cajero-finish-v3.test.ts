import { describe, expect, test } from 'bun:test'
import { parseCashierV3Bootstrap, parseCashierV3Mutation } from '../src/features/solog/cajero/cajero.v3.api'
import { CashierDraftCoordinator } from '../src/features/solog/cajero/cajero.flush'
import { CashierV3Store } from '../src/features/solog/cajero/cajero.v3.store'
import { cashierV3Bootstrap, cashierV3Mutation } from './fixtures/cashier-v3.mjs'

const active = () => parseCashierV3Bootstrap(cashierV3Bootstrap('session'))
function compact(operational = 11) {
  const value = cashierV3Bootstrap('pre_session')
  value.revisions.operational = operational
  return parseCashierV3Bootstrap(value)
}
function finish(replay = false) {
  return parseCashierV3Mutation({ ...cashierV3Mutation('finish'), replay }, 'finish')
}

describe('Cajero V3 finish e integración final', () => {
  test('finish confirmado instala bootstrap compacto sin retransmitir la operación', async () => {
    let reads = 0
    const payloads: Record<string, unknown>[] = []
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => ++reads === 1 ? active() : compact(),
      mutate: async (action, payload) => {
        expect(action).toBe('finish')
        payloads.push(structuredClone(payload))
        return finish()
      },
    })
    await store.refresh()
    await new CashierDraftCoordinator(store).run('finish')
    expect(reads).toBe(2)
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({ device_token: 'token', conteo_id: 'session-1', expected_groups_revision: 7 })
    expect(store.finishResult).toMatchObject({ action: 'finish', status: 'finalizado', conteo_id: 'session-1' })
    expect(store.bootstrap?.panel_state).toBeNull()
    expect(store.bootstrap?.pre_session_summary).not.toBeNull()
    expect(store.hasPendingIntent).toBe(false)
    expect(store.needsSynchronization).toBe(false)
  })

  test('fallo de bootstrap post-finish no convierte el finish confirmado en incierto', async () => {
    let reads = 0
    let writes = 0
    let recover = false
    const operationIds: unknown[] = []
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => {
        reads++
        if (reads === 1) return active()
        if (!recover) throw new Error('Network error')
        return compact()
      },
      mutate: async (_action, payload) => {
        writes++
        operationIds.push(payload.operation_id)
        return finish()
      },
    })
    await store.refresh()
    await expect(new CashierDraftCoordinator(store).run('finish')).resolves.toBeUndefined()
    expect(writes).toBe(1)
    expect(operationIds).toHaveLength(1)
    expect(store.finishResult?.status).toBe('finalizado')
    expect(store.hasPendingIntent).toBe(false)
    expect(store.bootstrap?.panel_state).toBeNull()
    expect(store.synchronizationError).toBeInstanceOf(Error)
    expect(store.needsSynchronization).toBe(true)
    expect(await store.retryPending()).toBeNull()

    recover = true
    await new CashierDraftCoordinator(store).run('retry')
    expect(store.bootstrap?.pre_session_summary).not.toBeNull()
    expect(store.synchronizationError).toBeNull()
    expect(store.needsSynchronization).toBe(false)
    expect(writes).toBe(1)
  })

  test('recovery permite finish, pero recovery vencido no crea una operación', async () => {
    let writes = 0
    let reads = 0
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => ++reads === 1
        ? parseCashierV3Bootstrap(cashierV3Bootstrap('recovery'))
        : compact(),
      mutate: async () => { writes++; return finish() },
    })
    await store.refresh()
    expect(store.capability).toMatchObject({ mode: 'recovery', captureAllowed: false, deliveryAllowed: true })
    await new CashierDraftCoordinator(store).run('finish')
    expect(writes).toBe(1)

    const expired = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierV3Bootstrap(cashierV3Bootstrap('recovery')),
      mutate: async () => { writes++; return finish() },
    })
    await expired.refresh()
    expired.serverOffsetMs = Date.parse(expired.bootstrap!.panel_state!.session.recovery_until) - Date.now()
    await expect(new CashierDraftCoordinator(expired).run('finish')).rejects.toThrow()
    expect(writes).toBe(1)
  })

  test('timeout de finish conserva payload y replay; después solo sincroniza', async () => {
    let reads = 0
    let writes = 0
    const payloads: Record<string, unknown>[] = []
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => ++reads === 1 ? active() : compact(),
      mutate: async (_action, payload) => {
        writes++
        payloads.push(structuredClone(payload))
        if (writes === 1) throw new Error('respuesta perdida')
        return finish(true)
      },
    })
    await store.refresh()
    const coordinator = new CashierDraftCoordinator(store)
    await expect(coordinator.run('finish')).rejects.toThrow('respuesta perdida')
    expect(store.pendingAction).toBe('finish')
    await coordinator.run('retry')
    expect(payloads[1]).toEqual(payloads[0])
    expect(store.finishResult?.replay).toBe(true)
    expect(store.hasPendingIntent).toBe(false)
    expect(store.bootstrap?.panel_state).toBeNull()
    expect(reads).toBe(2)
  })

  test('flujo completo adopta start, deltas y finish antes del bootstrap compacto', async () => {
    let reads = 0
    const actions: string[] = []
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => ++reads === 1
        ? parseCashierV3Bootstrap(cashierV3Bootstrap('pre_session'))
        : compact(14),
      mutate: async (action, payload) => {
        actions.push(action)
        const value = cashierV3Mutation(action)
        value.revisions.operational = 10 + actions.length
        if (action === 'save_batch') value.items[0] = { ...value.items[0], ...(payload.items as unknown[])[0] }
        return parseCashierV3Mutation(value, action)
      },
    })
    await store.refresh()
    await store.start()
    await store.mutate('save_batch', { items: [{
      client_observation_id: 'observation-1', grupo_id: 'group-1', stock_fisico: 10,
      contado_at: '2026-09-12T15:00:00.000Z',
    }] })
    await store.mutate('recount_save_batch', { items: [{
      detalle_id: 'detail-2', stock_fisico: 8, contado_at: '2026-09-12T15:00:00.000Z',
    }] })
    await new CashierDraftCoordinator(store).run('finish')
    expect(actions).toEqual(['start', 'save_batch', 'recount_save_batch', 'finish'])
    expect(reads).toBe(2)
    expect(store.bootstrap?.panel_state).toBeNull()
    expect(store.bootstrap?.revisions.operational).toBe(14)
  })

  test('dispose descarta el bootstrap post-finish tardío y limpia el resultado', async () => {
    let reads = 0
    let resolve!: (value: ReturnType<typeof compact>) => void
    let bootstrapStarted!: () => void
    const started = new Promise<void>((yes) => { bootstrapStarted = yes })
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => ++reads === 1 ? active() : new Promise((yes) => { resolve = yes; bootstrapStarted() }),
      mutate: async () => finish(),
    })
    await store.refresh()
    const finishing = new CashierDraftCoordinator(store).run('finish')
    await started
    store.dispose()
    resolve(compact())
    await finishing
    expect(store.bootstrap).toBeNull()
    expect(store.finishResult).toBeNull()
    expect(store.synchronizationError).toBeNull()
  })
})
