import type { FullLock, FullRpc } from './full.runtime'

/** Exclusividad de la interfaz Cajero, independiente del mutex de operaciones Full. */
export const CASHIER_INSTANCE_LOCK = 'solog.cashier.instance.v1'

export type CashierInstanceStatus = 'checking' | 'owner' | 'blocked' | 'releasing' | 'error'
export interface CashierInstanceState { status: CashierInstanceStatus; error: string | null }
type Listener = (value: CashierInstanceState) => void

type Subscription = { token: symbol; userId: string; listener: Listener }
type Lease = {
  userId: string
  closed: boolean
  identityInvalidated: boolean
  jobs: number
  drain: (() => void) | null
  release: () => void
}

export interface CashierInstanceHandle {
  disconnect(): void
  /** Solo puede vincularse mientras este consumidor posee el Web Lock. */
  bindRuntime(transactionLock: FullLock, rpc: FullRpc): { lock: FullLock; rpc: FullRpc }
}

/**
 * Coordinador por documento; no autoriza sesiones ni sustituye los locks de FullRuntime.
 * Una instancia secundaria solo puede reintentar mediante `retry()` explícito.
 */
export class CashierInstanceCoordinator {
  private subscriber: Subscription | null = null
  private snapshot: CashierInstanceState = { status: 'checking', error: null }
  private generation = 0
  private requestTask: Promise<void> | null = null
  private lease: Lease | null = null
  private retirement: Promise<void> | null = null
  private abandonment = 0

  constructor(private readonly locks: Pick<LockManager, 'request'> | null) {}

  getState = (): CashierInstanceState => this.snapshot

  connect(userId: string, listener: Listener): CashierInstanceHandle {
    const previous = this.subscriber
    const lease = this.lease
    const changedIdentity = (previous !== null && previous.userId !== userId) ||
      (lease !== null && lease.userId !== userId)
    const subscription: Subscription = { token: Symbol('cashier-owner'), userId, listener }
    this.subscriber = subscription
    ++this.abandonment

    if (changedIdentity) {
      this.retire(true)
      this.setState('checking')
    } else if (lease && !lease.closed && !this.retirement) {
      this.setState('owner')
    } else if (!previous || previous.userId !== userId) {
      this.setState('checking')
    }
    // El listener nuevo recibe el estado incluso si el anterior era owner.
    listener(this.snapshot)
    if (!this.lease && !this.retirement && !this.requestTask && this.snapshot.status === 'checking') {
      this.startRequest()
    }

    return {
      disconnect: () => {
        if (this.subscriber !== subscription) return
        this.subscriber = null
        const generation = ++this.abandonment
        // StrictMode ejecuta cleanup y setup síncronamente: no soltar el lock entre ambos.
        queueMicrotask(() => {
          if (this.abandonment === generation && !this.subscriber) this.retire(false)
        })
      },
      bindRuntime: (transactionLock, rpc) => this.bindRuntime(subscription, transactionLock, rpc),
    }
  }

  retry(): void {
    if (!this.subscriber || !['blocked', 'error'].includes(this.snapshot.status) ||
      this.lease || this.retirement || this.requestTask) return
    this.setState('checking')
    this.startRequest()
  }

  private setState(status: CashierInstanceStatus, error: string | null = null): void {
    if (this.snapshot.status === status && this.snapshot.error === error) return
    this.snapshot = { status, error }
    this.subscriber?.listener(this.snapshot)
  }

  private startRequest(): void {
    const sub = this.subscriber
    if (!sub || this.requestTask || this.lease || this.retirement) return
    if (!this.locks) {
      this.setState('error', 'Web Locks no está disponible en este navegador.')
      return
    }
    const generation = ++this.generation
    this.requestTask = Promise.resolve().then(() => this.locks!.request(
      CASHIER_INSTANCE_LOCK,
      { mode: 'exclusive', ifAvailable: true },
      async granted => {
        if (!granted) {
          if (this.generation === generation && this.subscriber?.userId === sub.userId) {
            this.setState('blocked')
          }
          return
        }
        // Concesión tardía tras desmontaje o cambio de identidad: se libera de inmediato.
        if (this.generation !== generation || this.subscriber?.userId !== sub.userId) return
        let release!: () => void
        const holding = new Promise<void>(resolve => { release = resolve })
        const lease: Lease = {
          userId: sub.userId, closed: false, identityInvalidated: false,
          jobs: 0, drain: null, release,
        }
        this.lease = lease
        this.setState('owner')
        await holding
      },
    )).then(() => undefined).catch(() => {
      if (this.generation === generation && this.subscriber?.userId === sub.userId) {
        this.setState('error', 'No se pudo obtener el bloqueo de SOLOG Cajero.')
      }
    }).finally(() => {
      this.requestTask = null
      // Si el callback terminó sin retiro explícito, ya no tenemos exclusividad.
      // Nunca mantener una interfaz operativa basada en un lock que no existe.
      if (this.lease && !this.retirement) {
        this.lease.closed = true
        this.lease.identityInvalidated = true
        this.lease = null
        this.setState('error', 'Se perdió el bloqueo exclusivo de SOLOG Cajero.')
      }
      if (this.subscriber && !this.lease && !this.retirement &&
        this.snapshot.status === 'checking') this.startRequest()
    })
  }

  private retire(identityChanged: boolean): void {
    ++this.generation
    const lease = this.lease
    if (!lease) {
      if (!this.subscriber) this.snapshot = { status: 'checking', error: null }
      return
    }
    if (identityChanged) lease.identityInvalidated = true
    if (this.retirement) return
    lease.closed = true // Cierra la admisión antes de cualquier await.
    this.setState(this.subscriber ? 'checking' : 'releasing')
    this.retirement = (async () => {
      if (lease.jobs > 0) await new Promise<void>(resolve => { lease.drain = resolve })
      lease.release()
      // El Web Lock solo está realmente libre cuando termina el callback.
      await this.requestTask
      if (this.lease === lease) this.lease = null
    })().finally(() => {
      this.retirement = null
      if (this.subscriber && this.snapshot.status === 'checking') this.startRequest()
      else if (!this.subscriber) this.snapshot = { status: 'checking', error: null }
    })
  }

  private bindRuntime(sub: Subscription, transactionLock: FullLock, rpc: FullRpc) {
    const lease = this.lease
    if (!lease || lease.closed || this.snapshot.status !== 'owner' ||
      this.subscriber !== sub || lease.userId !== sub.userId) {
      throw new Error('CASHIER_INSTANCE_NOT_OWNER')
    }
    const lock: FullLock = async run => {
      if (this.lease !== lease || lease.closed || lease.identityInvalidated ||
        this.subscriber !== sub) throw new Error('CASHIER_INSTANCE_RETIRED')
      ++lease.jobs // Incluye la espera por el mutex transaccional.
      try { return await transactionLock(run) }
      finally {
        --lease.jobs
        if (lease.jobs === 0) {
          const resolve = lease.drain
          lease.drain = null
          resolve?.()
        }
      }
    }
    const guardedRpc: FullRpc = (name, args) => {
      // Una operación admitida puede continuar durante una retirada normal.
      // Un cambio de identidad revoca inmediatamente nuevas RPC del runtime anterior.
      if (this.lease !== lease || lease.identityInvalidated || lease.jobs === 0) {
        return Promise.reject(new Error('CASHIER_INSTANCE_IDENTITY_CHANGED'))
      }
      return rpc(name, args)
    }
    return { lock, rpc: guardedRpc }
  }
}

let coordinator: CashierInstanceCoordinator | null = null
export function getCashierInstanceCoordinator(): CashierInstanceCoordinator {
  if (!coordinator) {
    coordinator = new CashierInstanceCoordinator(
      typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null,
    )
  }
  return coordinator
}
