import { CashierHistoryCache, type CashierHistoryPeriod } from './cajero.history'
import { mutateCashierV4, type CashierV4Rpc } from './cajero.v4.api'
import { canCashierV4CaptureForSession } from './cajero.v4.capability'
import { CashierV4DraftCoordinator } from './cajero.v4.flush'
import { cashierV4AfterStartDestination } from './cajero.v4.navigation'
import { selectCashierV4CoverageGroups, selectCashierV4DailyGroups, selectCashierV4ReviewEntries } from './cajero.v4.selectors'
import { CashierV4DraftStorage, type CashierV4DraftScope, type CashierV4SessionDrafts, type CashierV4PreparedStart } from './cajero.v4.storage'
import { CashierV4Store } from './cajero.v4.store'
import type { CashierV4NextAction } from './cajero.v4'
import { getCashierV4ErrorPolicy } from './cajero.v4.errors'
import { SologApiError } from '../errors'

export function cashierV4LocalPending(record: CashierV4SessionDrafts) {
  if (record.finished) return 0
  const drafts = record.normal.length + record.recount.length
  return drafts || (record.prepared && !record.prepared.response ? 1 : 0)
}

// UI orchestration only. Planning, durable payloads and retries remain in the frozen coordinator.
export class CashierV4Runtime {
  readonly coordinator: CashierV4DraftCoordinator
  readonly history = new CashierHistoryCache()
  private listeners = new Set<() => void>()
  private snapshot = { revision: 0, busy: false, error: null as unknown, records: [] as CashierV4SessionDrafts[], preparedStart: null as CashierV4PreparedStart | null }
  private storageBlocked = false
  private sessionDenied = false
  private unsubscribe: () => void
  constructor(readonly store: CashierV4Store, readonly storage: CashierV4DraftStorage,
    private readonly call?: CashierV4Rpc, private readonly uuid = () => crypto.randomUUID(), private readonly now = Date.now) {
    this.coordinator = new CashierV4DraftCoordinator(store, storage, call, uuid, now)
    let bootstrap = store.getSnapshot().bootstrap
    this.unsubscribe = store.subscribe(() => {
      const next = store.getSnapshot().bootstrap
      if (next !== bootstrap) { bootstrap = next; this.sessionDenied = false }
      this.history.clear(); this.hydrate()
    })
    this.hydrate()
  }
  serverNow = () => this.now() + this.store.serverOffsetMs
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.snapshot
  get requiresRefresh() { return this.sessionDenied }
  private publish(patch: Partial<typeof this.snapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 }
    this.listeners.forEach(listener => listener())
  }
  hydrate = () => {
    try {
      const b = this.store.getSnapshot().bootstrap
      if (!b?.device.id) { this.publish({ records: [], preparedStart: null }); return }
      const identity = { usuario_id: b.identity.id, sede_id: b.site.id, dispositivo_id: b.device.id }
      const preparedStart = this.storage.readStart(identity)
      const active = this.coordinator.activeScope()
      if (active) this.coordinator.synchronize(active)
      const records = this.storage.sessions(identity)
      for (const record of records) this.coordinator.synchronize(record.scope)
      this.storageBlocked = false
      this.publish({ records: this.storage.sessions(identity), preparedStart })
      if (preparedStart?.prepared_start.status === 'conflict') this.publish({ error: new SologApiError('SOLOG_IDEMPOTENCY_CONFLICT') })
    } catch (error) { this.storageBlocked = true; this.publish({ error }) } // Preserve corrupt/unavailable storage; never replace it with memory.
  }
  get pendingCount() { return this.snapshot.records.reduce((sum, record) => sum + cashierV4LocalPending(record), 0) }
  get recoveryPending() {
    const active = this.store.getSnapshot().panel_state
    return this.snapshot.records.filter(record => cashierV4LocalPending(record) > 0 &&
      (record.scope.conteo_id !== active?.session.id || active.session.estado !== 'activo'))
  }
  canCapture(action: CashierV4NextAction) {
    const state = this.store.getSnapshot(), panel = state.panel_state
    return Boolean(action !== 'none' && !this.sessionDenied && !this.storageBlocked && !this.snapshot.preparedStart && !this.snapshot.busy && !this.snapshot.error && !state.loading && panel?.next_action === action &&
      panel.session.estado === 'activo' && this.recoveryPending.length === 0 &&
      !this.snapshot.records.find(record => !record.finished && record.scope.conteo_id === panel.session.id)?.prepared &&
      canCashierV4CaptureForSession(state, panel.session.id, this.serverNow()))
  }
  capture(action: Exclude<CashierV4NextAction, 'none'>, grupoId: string, stockFisico: number, expression: string) {
    if (!this.canCapture(action)) throw new Error('Resuelve los pendientes anteriores o actualiza la sesión antes de capturar.')
    const panel = this.store.getSnapshot().panel_state!, scope = this.coordinator.activeScope()!
    const contado_at = new Date(this.serverNow()).toISOString()
    if (action === 'review') {
      const entry = selectCashierV4ReviewEntries(panel).find(entry => entry.group.grupo_id === grupoId)
      if (!entry) throw new Error('El grupo no pertenece a la cola de revisión vigente.')
      this.coordinator.captureRecount(scope, { detalle_id: entry.queueItem.detalle_id, grupo_id: grupoId, stock_fisico: stockFisico, contado_at }, { expression })
    } else {
      const groups = action === 'coverage' ? selectCashierV4CoverageGroups(panel) : selectCashierV4DailyGroups(panel)
      if (!groups.some(group => group.grupo_id === grupoId)) throw new Error('El grupo no pertenece a la cola vigente.')
      this.coordinator.captureNormal(scope, { grupo_id: grupoId, stock_fisico: stockFisico, contado_at }, { expression })
    }
    this.hydrate()
  }
  clearError = () => { this.publish({ error: null }) }
  private async command<T>(work: () => Promise<T>): Promise<T> {
    if (this.snapshot.busy) throw new Error('Hay una operación en curso.')
    this.publish({ busy: true, error: null })
    try { return await work() } catch (error) {
      const policy = getCashierV4ErrorPolicy(error)
      if (policy.sessionInvalid || policy.requiresRefresh) this.sessionDenied = true
      this.publish({ error }); throw error
    }
    finally { this.publish({ busy: false }); this.hydrate() }
  }
  refresh = () => this.command(() => this.store.refresh())
  start = () => this.command(async () => {
    if (this.sessionDenied) throw new Error('Actualiza el panel para confirmar los permisos vigentes.')
    const state = this.store.getSnapshot()
    const b = state.bootstrap
    if (!b?.device.id || !b.device.autorizado) throw new SologApiError('SOLOG_DEVICE_UNAUTHORIZED')
    const identity = { usuario_id: b.identity.id, sede_id: b.site.id, dispositivo_id: b.device.id }
    let prepared = this.storage.readStart(identity)
    if (prepared?.prepared_start.status === 'conflict') throw new SologApiError('SOLOG_IDEMPOTENCY_CONFLICT')
    if (!prepared && (!b.start_capability.allowed || state.panel_state?.session.estado === 'activo' || this.pendingCount > 0)) {
      throw new Error('No se puede iniciar un conteo con este estado o con pendientes anteriores.')
    }
    prepared ??= { version: 1, identity, prepared_start: { operation_id: this.uuid(), status: 'ready' } }
    this.storage.writeStart(prepared) // A failed write prevents any request.
    try {
      const result = await mutateCashierV4('start', { operation_id: prepared.prepared_start.operation_id, device_token: this.store.deviceToken }, this.call)
      this.store.acceptMutation(result)
      this.hydrate()
      if (this.snapshot.error) throw this.snapshot.error
      this.storage.confirmStart(identity, prepared.prepared_start.operation_id, result)
      return cashierV4AfterStartDestination(result)
    } catch (error) {
      const code = getCashierV4ErrorPolicy(error).code
      prepared.prepared_start.status = code === 'SOLOG_IDEMPOTENCY_CONFLICT' ? 'conflict' : code === 'SOLOG_OPERATION_IN_PROGRESS' ? 'in_progress' : 'uncertain'
      this.storage.writeStart(prepared)
      throw error
    }
  })
  private async deliver(scope: CashierV4DraftScope) {
    if (this.sessionDenied) throw new Error('Actualiza el panel para confirmar los permisos vigentes. Los pendientes se conservan.')
    const record = this.storage.read(scope)
    if (record.prepared?.action === 'finish') await this.coordinator.finish(scope)
    else {
      const result = await this.coordinator.flush(scope)
      if (cashierV4LocalPending(this.storage.read(scope)) > 0) {
        const messages: Record<string, string> = {
          missing_delivery_state: 'Esta sesión conserva pendientes, pero no tiene autoridad suficiente para planificar su envío.',
          session_unavailable: 'Esta sesión ya no está disponible para envío. Sus pendientes se conservan.',
          delivery_not_allowed: 'Esta sesión ya no permite entregar pendientes. Actualiza el panel; los registros locales se conservan.',
          idempotency_conflict: 'La operación está en conflicto. Su identificador y contenido se conservan para revisión.',
          no_eligible_drafts: 'La prioridad vigente no permite enviar estos pendientes. Se conservan para resolverlos.',
          none: 'No hay una acción habilitada para estos pendientes. Los registros locales se conservan.',
          no_progress: 'El panel no confirmó el avance esperado. Actualízalo antes de continuar.',
        }
        throw new Error(messages[result.reason] ?? 'No se pudo completar el envío. Los pendientes de esta sesión se conservan; actualiza el panel.')
      }
    }
    this.hydrate()
  }
  private async sendPendingWork() {
    this.hydrate()
    if (this.snapshot.error) throw this.snapshot.error
    // Include absent sessions as blocked work: absence never discards or relocates observations.
    for (const record of this.recoveryPending) await this.deliver(record.scope)
    const active = this.coordinator.activeScope()
    if (active && cashierV4LocalPending(this.storage.read(active))) await this.deliver(active)
  }
  sendPending = () => this.command(() => this.sendPendingWork())
  private async finishWork(refresh = true) {
    if (this.sessionDenied) throw new Error('Actualiza el panel para confirmar los permisos vigentes.')
    const scope = this.coordinator.activeScope()
    if (!scope) throw new Error('No hay una sesión visible para finalizar.')
    const record = this.storage.read(scope)
    if (record.prepared?.action !== 'finish') {
      await this.coordinator.flush(scope)
      // The coordinator checks every deliverable queue and refuses finish after an unresolved batch.
    }
    await this.coordinator.finish(scope)
    if (refresh) await this.store.refresh()
  }
  finish = () => this.command(() => this.finishWork())
  logoutSafe = (onLogout: () => Promise<void>) => this.command(async () => {
    this.hydrate()
    if (this.snapshot.error) throw this.snapshot.error
    if (this.snapshot.preparedStart) throw new Error('Resuelve primero el inicio pendiente antes de salir.')
    await this.sendPendingWork()
    if (this.store.getSnapshot().panel_state?.session.estado === 'activo') await this.finishWork(false)
    await onLogout()
  })
  getCachedHistory = (period: CashierHistoryPeriod) => this.history.get(period, this.serverNow())
  loadHistory = (period: CashierHistoryPeriod) => this.history.load(period, this.serverNow)
  dispose() { this.unsubscribe(); this.history.clear(); this.listeners.clear() }
}
