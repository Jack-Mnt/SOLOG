import { describe, expect, test } from 'bun:test'
import {
  CASHIER_INSTANCE_LOCK, CashierInstanceCoordinator,
  type CashierInstanceState,
} from '../src/features/solog/cajero/cajero.instance'
import type { FullLock, FullRpc } from '../src/features/solog/cajero/full.runtime'

class FakeWebLocks {
  readonly owners = new Set<string>()
  requests = 0
  throwOnRequest = false
  beforeGrant: Promise<void> | null = null

  async request<T>(name: string, _options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: Lock | null) => Promise<T>): Promise<T> {
    this.requests++
    if (this.throwOnRequest) throw new Error('browser failure')
    await this.beforeGrant
    if (this.owners.has(name)) return callback(null)
    this.owners.add(name)
    try { return await callback({ name, mode: 'exclusive' } as Lock) }
    finally { this.owners.delete(name) }
  }

  manager(): Pick<LockManager, 'request'> {
    return this as unknown as Pick<LockManager, 'request'>
  }
}

const immediate: FullLock = run => run()
const rpc: FullRpc = async () => ({ ok: true })
const identityA = '12345678-1234-4123-8123-1234567890ab'
const identityB = '12345678-1234-4123-8123-1234567890ba'

const deferred = () => {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

async function until(condition: () => boolean, note: string) {
  for (let i = 0; i < 120; i++) {
    if (condition()) return
    await Promise.resolve()
  }
  throw new Error('Tiempo de espera del test: ' + note)
}

function open(coordinator: CashierInstanceCoordinator, id = identityA) {
  const states: CashierInstanceState[] = []
  const handle = coordinator.connect(id, state => states.push(state))
  return { states, handle, current: () => states.at(-1)!, count: () => states.length }
}

describe('SOLOG Cajero — coordinador exclusivo de instancia (Fase 2)', () => {
  test('dos documentos compiten: exactamente uno es propietario; secundaria nunca adquiere automáticamente', async () => {
    const locks = new FakeWebLocks()
    const a = new CashierInstanceCoordinator(locks.manager())
    const b = new CashierInstanceCoordinator(locks.manager())
    const first = open(a)
    const second = open(b)
    await until(() => first.current().status === 'owner' && second.current().status === 'blocked', 'concesión/denegación')
    expect(locks.owners.has(CASHIER_INSTANCE_LOCK)).toBe(true)
    expect(locks.requests).toBe(2)
    expect(() => second.handle.bindRuntime(immediate, rpc)).toThrow('CASHIER_INSTANCE_NOT_OWNER')
    const bound = first.handle.bindRuntime(immediate, rpc)
    await bound.lock(() => bound.rpc('rpc_solog_cashier_bootstrap_v6', {}).then(() => undefined))
    first.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'liberación tras cierre')
    expect(second.current().status).toBe('blocked')
    expect(locks.requests).toBe(2)
    b.retry()
    await until(() => second.current().status === 'owner', 'reintento manual')
    second.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'liberación final')
  })

  test('StrictMode: cleanup y setup síncronos reutilizan la concesión, sin falso bloqueo', async () => {
    const locks = new FakeWebLocks()
    const owner = new CashierInstanceCoordinator(locks.manager())
    const first = open(owner)
    await until(() => first.current().status === 'owner', 'propietaria inicial')
    first.handle.disconnect()
    const remount = open(owner)
    await until(() => remount.current().status === 'owner', 'remount')
    expect(locks.requests).toBe(1)
    expect(locks.owners.has(CASHIER_INSTANCE_LOCK)).toBe(true)
    expect(() => first.handle.bindRuntime(immediate, rpc)).toThrow('CASHIER_INSTANCE_NOT_OWNER')
    remount.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'cleanup final')
  })

  test('concesión tardía después de desmontar no activa un Owner obsoleto ni fuga lock', async () => {
    const locks = new FakeWebLocks()
    const delayed = deferred()
    locks.beforeGrant = delayed.promise
    const owner = new CashierInstanceCoordinator(locks.manager())
    const first = open(owner)
    await until(() => locks.requests === 1, 'solicitud enviada')
    first.handle.disconnect()
    await Promise.resolve()
    delayed.release()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'concesión obsoleta')
    await until(() => first.current().status !== 'owner', 'ninguna propiedad obsoleta')
    expect(first.states.some(x => x.status === 'owner')).toBe(false)
    expect(locks.requests).toBe(1)
    const next = open(owner)
    await until(() => next.current().status === 'owner', 'adquisición válida posterior')
    next.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'liberación')
  })

  test('Web Locks no disponible o falla: fail-closed y reintento explícito', async () => {
    const unsupported = new CashierInstanceCoordinator(null)
    const missing = open(unsupported)
    expect(missing.current().status).toBe('error')
    expect(() => missing.handle.bindRuntime(immediate, rpc)).toThrow('CASHIER_INSTANCE_NOT_OWNER')
    missing.handle.disconnect()

    const locks = new FakeWebLocks()
    locks.throwOnRequest = true
    const coordinator = new CashierInstanceCoordinator(locks.manager())
    const current = open(coordinator)
    await until(() => current.current().status === 'error', 'error de lock')
    expect(() => current.handle.bindRuntime(immediate, rpc)).toThrow('CASHIER_INSTANCE_NOT_OWNER')
    locks.throwOnRequest = false
    coordinator.retry()
    await until(() => current.current().status === 'owner', 'reintento tras error')
    current.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'limpieza')
  })

  test('retirada normal: bloquea admisiones nuevas y mantiene lock hasta completar V7 y V6 del trabajo admitido', async () => {
    const locks = new FakeWebLocks()
    const a = new CashierInstanceCoordinator(locks.manager())
    const b = new CashierInstanceCoordinator(locks.manager())
    const owner = open(a)
    await until(() => owner.current().status === 'owner', 'propiedad')
    const entered = deferred(), finish = deferred()
    const calls: string[] = []
    const guarded = owner.handle.bindRuntime(immediate, async name => { calls.push(name); return {} })
    const pending = guarded.lock(async () => {
      await guarded.rpc('rpc_solog_cashier_mutate_v7', {})
      entered.release()
      await finish.promise
      await guarded.rpc('rpc_solog_cashier_bootstrap_v6', {})
    })
    await entered.promise
    owner.handle.disconnect()
    await Promise.resolve()
    const secondary = open(b)
    await until(() => secondary.current().status === 'blocked', 'otra ventana bloqueada')
    expect(locks.owners.has(CASHIER_INSTANCE_LOCK)).toBe(true)
    await expect(guarded.lock(async () => undefined)).rejects.toThrow('CASHIER_INSTANCE_RETIRED')
    finish.release()
    await pending
    expect(calls).toEqual(['rpc_solog_cashier_mutate_v7', 'rpc_solog_cashier_bootstrap_v6'])
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'drenaje')
    expect(secondary.current().status).toBe('blocked')
    b.retry()
    await until(() => secondary.current().status === 'owner', 'reintento')
    secondary.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'liberación secundaria')
  })

  test('drenaje también contabiliza operaciones esperando el mutex de FullRuntime', async () => {
    const locks = new FakeWebLocks()
    const coordinator = new CashierInstanceCoordinator(locks.manager())
    const owner = open(coordinator)
    await until(() => owner.current().status === 'owner', 'propietaria')
    const entered = deferred(), finish = deferred()
    let tail = Promise.resolve()
    const mutex: FullLock = async run => {
      const previous = tail
      let leave!: () => void
      tail = new Promise<void>(resolve => { leave = resolve })
      await previous
      try { return await run() } finally { leave() }
    }
    const guarded = owner.handle.bindRuntime(mutex, rpc)
    const first = guarded.lock(async () => { entered.release(); await finish.promise })
    await entered.promise
    let secondRan = false
    const second = guarded.lock(async () => { secondRan = true })
    owner.handle.disconnect()
    await Promise.resolve()
    expect(locks.owners.has(CASHIER_INSTANCE_LOCK)).toBe(true)
    expect(secondRan).toBe(false)
    finish.release()
    await Promise.all([first, second])
    expect(secondRan).toBe(true)
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'segundo trabajo drenado')
  })

  test('cambio de identidad revoca nuevas RPC antiguas y espera el drenaje antes de conceder al usuario nuevo', async () => {
    const locks = new FakeWebLocks()
    const coordinator = new CashierInstanceCoordinator(locks.manager())
    const first = open(coordinator, identityA)
    await until(() => first.current().status === 'owner', 'usuario A')
    const entered = deferred(), finish = deferred()
    const guarded = first.handle.bindRuntime(immediate, rpc)
    const pending = guarded.lock(async () => {
      entered.release()
      await finish.promise
      await expect(guarded.rpc('rpc_solog_cashier_bootstrap_v6', {}))
        .rejects.toThrow('CASHIER_INSTANCE_IDENTITY_CHANGED')
    })
    await entered.promise
    const next = open(coordinator, identityB)
    expect(next.current().status).toBe('checking')
    expect(() => next.handle.bindRuntime(immediate, rpc)).toThrow('CASHIER_INSTANCE_NOT_OWNER')
    await expect(guarded.lock(async () => undefined)).rejects.toThrow('CASHIER_INSTANCE_RETIRED')
    finish.release()
    await pending
    await until(() => next.current().status === 'owner', 'propiedad usuario B')
    expect(locks.requests).toBe(2)
    next.handle.disconnect()
    await until(() => !locks.owners.has(CASHIER_INSTANCE_LOCK), 'liberación B')
  })
})
