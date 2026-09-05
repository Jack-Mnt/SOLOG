import type { CashierStore } from './cajero.v2.store'
import type { CashierCountSavedItem, CashierMutation, CashierRecountSavedItem } from './cajero.v2'
import type { CajeroBufferScope } from './cajero.types'
import {
  buildNextCajeroBatch, buildNextCajeroRecountBatch, readCajeroBuffer,
  readCajeroRecountDrafts, removeCajeroObservation, removeCajeroExpressionDrafts,
  removeCajeroRecountDrafts,
} from './cajero.storage'

type Command = 'normal' | 'global' | 'finish' | 'retry'

// Serializa la intención UI; cada mutación conserva su propia transacción y UUID.
export class CashierDraftCoordinator {
  private running: { command: Command; promise: Promise<void> } | null = null
  private listeners = new Set<() => void>()
  constructor(private store: CashierStore) {}
  getSnapshot = () => this.running !== null
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private emit() { this.listeners.forEach((listener) => listener()) }

  run(command: Command): Promise<void> {
    if (this.running) {
      if (this.running.command === command) return this.running.promise
      return Promise.reject(new Error('Espera a que termine la operación en curso.'))
    }
    const promise = Promise.resolve().then(() => this.execute(command)).finally(() => {
      this.running = null
      this.emit()
    })
    this.running = { command, promise }
    this.emit()
    return promise
  }

  private scope(): CajeroBufferScope | null {
    const b = this.store.bootstrap
    const session = b?.panel_state.session
    return b && session && b.device.id ? {
      usuario_id: b.identity.id, sede_id: b.site.id, dispositivo_id: b.device.id,
      conteo_id: session.id, groups_revision: session.groups_revision,
    } : null
  }
  private assertScope(scope: CajeroBufferScope) {
    if (JSON.stringify(this.scope()) !== JSON.stringify(scope)) {
      throw new Error('La sesión de usuario cambió durante la operación.')
    }
  }
  private pending(scope: CajeroBufferScope) {
    return readCajeroBuffer(scope).items.length + readCajeroRecountDrafts(scope).items.length
  }
  private confirm(scope: CajeroBufferScope, response: CashierMutation) {
    this.assertScope(scope)
    if (response.action === 'save_batch') {
      for (const item of (response.items ?? []) as CashierCountSavedItem[]) {
        removeCajeroObservation(scope, item.grupo_id)
        removeCajeroExpressionDrafts(scope, [item.grupo_id])
      }
    } else if (response.action === 'recount_save_batch') {
      removeCajeroRecountDrafts(scope, ((response.items ?? []) as CashierRecountSavedItem[]).map((item) => item.detalle_id))
    }
  }
  private async flushPendingDrafts(scope: CajeroBufferScope, normalOnly: boolean) {
    for (const action of (normalOnly ? ['save_batch'] : ['save_batch', 'recount_save_batch']) as Array<'save_batch' | 'recount_save_batch'>) {
      for (;;) {
        this.assertScope(scope)
        const batch = action === 'save_batch'
          ? buildNextCajeroBatch(scope, this.store.deviceToken)
          : buildNextCajeroRecountBatch(scope)
        if (!batch) break
        const before = this.pending(scope)
        // mutate adopta state antes de resolver; solo después retiramos confirmados.
        this.confirm(scope, await this.store.mutate(action, { items: batch.items }))
        if (this.pending(scope) >= before) throw new Error('El envío no confirmó los borradores pendientes. Reintenta la operación.')
      }
    }
    if (!normalOnly && this.pending(scope)) throw new Error('Quedan borradores pendientes de confirmar.')
  }
  private async execute(command: Command) {
    const scope = this.scope()
    const pendingAction = this.store.pendingAction
    if (command === 'normal' && pendingAction && pendingAction !== 'save_batch') {
      throw new Error('Resuelve primero la operación pendiente desde Inicio.')
    }
    if (command === 'global' && pendingAction && !['save_batch', 'recount_save_batch'].includes(pendingAction)) {
      throw new Error('Resuelve primero el inicio o la finalización pendiente.')
    }
    if (pendingAction) {
      const response = await this.store.retryPending()
      if (scope && response && response.action !== 'finish') this.confirm(scope, response)
    }
    if (command === 'retry') return
    if (!scope) {
      if (command === 'finish' && !this.store.bootstrap?.panel_state.session) return
      throw new Error('No hay un conteo activo.')
    }
    this.assertScope(scope)
    await this.flushPendingDrafts(scope, command === 'normal')
    if (command === 'finish') {
      this.assertScope(scope)
      // Un retry de finish ya comprometido no crea una segunda finalización.
      if (this.store.bootstrap?.panel_state.session?.estado !== 'finalizado') {
        await this.store.mutate('finish')
      }
      await this.store.refresh()
    }
  }
}
