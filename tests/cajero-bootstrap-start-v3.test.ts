import { describe, expect, test } from 'bun:test'
import { parseCashierV3Bootstrap, parseCashierV3Mutation } from '../src/features/solog/cajero/cajero.v3.api'
import { CashierV3Store } from '../src/features/solog/cajero/cajero.v3.store'
import { cashierV3Bootstrap, cashierV3Mutation } from './fixtures/cashier-v3.mjs'

describe('Cajero V3 bootstrap, start y restauración', () => {
  test('bootstrap concurrente se deduplica y conserva resumen compacto', async () => {
    let reads = 0
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => { reads++; return parseCashierV3Bootstrap(cashierV3Bootstrap()) },
      mutate: async (action) => parseCashierV3Mutation(cashierV3Mutation(action), action),
    })
    await Promise.all([store.refresh(), store.refresh()])
    expect(reads).toBe(1)
    expect(store.bootstrap?.panel_state).toBeNull()
    expect(store.bootstrap?.pre_session_summary?.coverage_counted).toBe(1)
  })

  test('start instala panel completo sin segundo bootstrap', async () => {
    let reads = 0
    let writes = 0
    let payload: Record<string, unknown> | undefined
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => { reads++; return parseCashierV3Bootstrap(cashierV3Bootstrap()) },
      mutate: async (action, input) => { writes++; payload = input; return parseCashierV3Mutation(cashierV3Mutation(action), action) },
    })
    await store.refresh()
    await store.start()
    expect(reads).toBe(1)
    expect(writes).toBe(1)
    expect(Object.keys(payload!).sort()).toEqual(['device_token', 'operation_id'])
    expect(store.bootstrap?.panel_state?.session.id).toBe('session-1')
    expect(store.bootstrap?.pre_session_summary).toBeNull()
    expect(store.capability.captureAllowed).toBe(true)
  })

  test('retry de start conserva payload y replay instala el panel sin bootstrap', async () => {
    const payloads: Record<string, unknown>[] = []
    let attempts = 0
    let reads = 0
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => { reads++; return parseCashierV3Bootstrap(cashierV3Bootstrap()) },
      mutate: async (action, payload) => {
        payloads.push(payload)
        if (++attempts === 1) throw new Error('timeout')
        return parseCashierV3Mutation({ ...cashierV3Mutation(action), replay: true }, action)
      },
    })
    await store.refresh()
    await expect(store.start()).rejects.toThrow('timeout')
    await store.start()
    expect(payloads[1]).toEqual(payloads[0])
    expect(reads).toBe(1)
    expect(store.bootstrap?.panel_state?.session.id).toBe('session-1')
  })

  test('bootstrap restaura directamente sesión activa y recovery', async () => {
    for (const kind of ['session', 'recovery']) {
      const store = new CashierV3Store('user-1', 'token', () => {}, {
        bootstrap: async () => parseCashierV3Bootstrap(cashierV3Bootstrap(kind)),
        mutate: async (action) => parseCashierV3Mutation(cashierV3Mutation(action), action),
      })
      await store.refresh()
      expect(store.bootstrap?.panel_state?.session.id).toBe('session-1')
      expect(store.bootstrap?.session_capability.mode).toBe(kind === 'session' ? 'active' : 'recovery')
    }
  })

  test('no autorizado conserva panel/resumen nulos y start no llama mutate', async () => {
    let writes = 0
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: async () => parseCashierV3Bootstrap(cashierV3Bootstrap('unauthorized')),
      mutate: async (action) => { writes++; return parseCashierV3Mutation(cashierV3Mutation(action), action) },
    })
    await store.refresh()
    await expect(store.start()).rejects.toThrow()
    expect(writes).toBe(0)
    expect(store.bootstrap?.panel_state).toBeNull()
  })

  test('respuesta bootstrap tardía tras dispose se descarta', async () => {
    let resolve!: (value: ReturnType<typeof parseCashierV3Bootstrap>) => void
    const store = new CashierV3Store('user-1', 'token', () => {}, {
      bootstrap: () => new Promise((done) => { resolve = done }),
      mutate: async (action) => parseCashierV3Mutation(cashierV3Mutation(action), action),
    })
    const pending = store.refresh()
    store.dispose()
    resolve(parseCashierV3Bootstrap(cashierV3Bootstrap()))
    await pending
    expect(store.bootstrap).toBeNull()
  })

  test('superficie activa importa context V3 y no mantiene refresh post-start', async () => {
    const app = await Bun.file('src/features/solog/cajero/cajero.app.tsx').text()
    const session = await Bun.file('src/features/solog/cajero/cajero.session.ts').text()
    const flush = await Bun.file('src/features/solog/cajero/cajero.flush.ts').text()
    expect(app).toContain("from './cajero.v3.context'")
    expect(app).not.toContain("from './cajero.v2.context'")
    expect(session).toContain('await store.start()')
    expect(session).not.toContain('startAndRefresh')
    expect(flush).not.toContain("response?.action === 'start') await this.store.refresh()")
  })
})
