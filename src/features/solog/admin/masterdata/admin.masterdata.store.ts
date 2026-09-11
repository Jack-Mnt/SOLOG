import type { AdminBootstrap } from '../admin.v2'
import { deriveMasterData, masterDataMutate, masterDataRead, type MasterDataDerived, type MasterDataMutation, type MasterDataMutationAction, type MasterDataMutationResult, type MasterDataRevisions, type MasterDataSnapshot } from './admin.masterdata.v1'

export interface MasterDataRevisionCoordinator {
  observeRevisions(revisions: Partial<MasterDataRevisions>): void
  revisionFloors(): MasterDataRevisions
  refetchMasterData(): Promise<MasterDataSnapshot>
  invalidateAndRefetchMasterData(): Promise<MasterDataSnapshot>
}
type Intent = { action: MasterDataMutationAction; payload: MasterDataMutation; pending?: Promise<MasterDataMutationResult>; error?: string }
type MutationInput = Omit<MasterDataMutation, 'operation_id' | 'expected_categories_revision'>
export type MasterDataReadTransport = typeof masterDataRead
export type MasterDataMutateTransport = typeof masterDataMutate

export class MasterDataStore implements MasterDataRevisionCoordinator {
  private listeners = new Set<() => void>()
  private floors: MasterDataRevisions = { groups: -1, catalog: -1, categories: -1 }
  private snapshotState?: MasterDataSnapshot
  private derivedState?: MasterDataDerived
  private pending?: { started: number; promise: Promise<MasterDataSnapshot> }
  private startedReads = 0
  private errorState?: string
  private intentState?: Intent
  private epoch = 0
  private version = 0
  private live = true
  private scope = ''
  constructor(readonly userId: string, private auth: () => AdminBootstrap | null, private changed: (revisions: MasterDataRevisions, forbidden?: boolean) => void = () => {}, private read: MasterDataReadTransport = masterDataRead, private mutateRpc: MasterDataMutateTransport = masterDataMutate) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(listener => listener()) }
  private access() {
    const bootstrap = this.auth()
    if (!this.live || !bootstrap || bootstrap.identity.id !== this.userId) throw new Error('Contexto Master Data no disponible.')
    if (!['admin', 'moderador'].includes(bootstrap.identity.rol)) throw new Error('Rol no autorizado para Master Data.')
    const scope = `${bootstrap.identity.id}:${bootstrap.identity.rol}`
    if (this.scope && this.scope !== scope) this.resetAccess()
    this.scope = scope
    return bootstrap
  }
  private authorizationError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (!['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED'].includes(code)) return false
    this.resetAccess(); this.changed(this.floors, true); return true
  }
  observeRevisions(revisions: Partial<MasterDataRevisions>) {
    for (const scope of ['groups', 'catalog', 'categories'] as const) {
      const value = revisions[scope]
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`Revisión ${scope} inválida.`)
      if (value !== undefined && value > this.floors[scope]) this.floors[scope] = value
    }
    this.changed(this.revisionFloors())
  }
  revisionFloors() { return { ...this.floors } }
  data() { this.access(); return { snapshot: this.snapshotState, derived: this.derivedState, error: this.errorState, pending: this.pending?.promise } }
  intent() { return this.intentState }
  async ensureLoaded() { this.access(); if (this.snapshotState) return this.snapshotState; return this.loadAtLeast(0) }
  async refetchMasterData() {
    this.access()
    // A refetch cannot be satisfied by a bootstrap that started before this call.
    return this.loadAtLeast((this.pending?.started ?? this.startedReads) + 1)
  }
  async invalidateAndRefetchMasterData() {
    this.access()
    this.snapshotState = undefined
    this.derivedState = undefined
    this.errorState = undefined
    this.emit()
    return this.loadAtLeast((this.pending?.started ?? this.startedReads) + 1)
  }
  private loadAtLeast(minimumStarted: number): Promise<MasterDataSnapshot> {
    if (this.pending) {
      if (this.pending.started >= minimumStarted) return this.pending.promise
      return this.pending.promise.catch(() => undefined).then(() => this.loadAtLeast(minimumStarted))
    }
    if (minimumStarted === 0 && this.snapshotState) return Promise.resolve(this.snapshotState)
    return this.startLoad()
  }
  private snapshotMeetsFloors(snapshot: MasterDataSnapshot) {
    const floors = this.revisionFloors()
    return snapshot.revisions.groups >= floors.groups && snapshot.revisions.catalog >= floors.catalog && snapshot.revisions.categories >= floors.categories
  }
  private startLoad(): Promise<MasterDataSnapshot> {
    const epoch = this.epoch
    const started = ++this.startedReads
    const request = this.read().then(snapshot => {
      if (epoch !== this.epoch) throw new Error('Bootstrap Master Data descartado por cambio de contexto.')
      this.access()
      if (!this.snapshotMeetsFloors(snapshot)) throw new Error('Bootstrap Master Data obsoleto: no alcanza las revisiones autoritativas.')
      this.observeRevisions(snapshot.revisions)
      this.snapshotState = snapshot
      this.derivedState = deriveMasterData(snapshot)
      this.errorState = undefined
      if (this.pending?.started === started) this.pending = undefined
      this.emit()
      return snapshot
    }).catch((error: unknown) => {
      if (this.live && epoch === this.epoch && !this.authorizationError(error)) { if (this.pending?.started === started) this.pending = undefined; this.errorState = error instanceof Error ? error.message : 'No se pudo cargar Master Data.'; this.emit() }
      throw error
    })
    this.pending = { started, promise: request }
    this.emit()
    return request
  }
  async mutation(action: MasterDataMutationAction, input: MutationInput): Promise<MasterDataMutationResult> {
    this.access()
    if (this.intentState) throw new Error('Hay una operación de Categorías sin confirmar. Reinténtala antes de crear otra.')
    if (action === 'category_reorder') {
      const categoryIds = (input as { category_ids: string[] }).category_ids
      const current = this.snapshotState?.categories.map(category => category.id)
      const expected = new Set(current ?? [])
      if (!current || categoryIds.length !== current.length || new Set(categoryIds).size !== categoryIds.length || categoryIds.some((id: string) => !expected.has(id))) {
        throw new Error('El reordenamiento debe incluir exactamente las categorías del snapshot autoritativo.')
      }
    }
    const floors = this.revisionFloors()
    if (floors.categories < 0) throw new Error('Falta la revisión autoritativa de Categorías.')
    const intent: Intent = { action, payload: { ...input, operation_id: crypto.randomUUID(), expected_categories_revision: floors.categories } as MasterDataMutation }
    this.intentState = intent
    return this.execute(intent)
  }
  retryMutation() { return this.intentState ? this.execute(this.intentState) : Promise.reject(new Error('No hay una operación de Categorías pendiente.')) }
  private retryable(error: unknown) { const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''; return !code || /SOLOG_LOCK_CONFLICT_RETRYABLE|IN_PROGRESS|UNKNOWN|EMPTY_RESPONSE|INVALID_CONTRACT_RESPONSE/.test(code) }
  private execute(intent: Intent): Promise<MasterDataMutationResult> {
    if (intent.pending) return intent.pending
    intent.error = undefined
    const epoch = this.epoch
    const request = this.mutateRpc(intent.action, intent.payload).then(async result => {
      this.access()
      if (epoch !== this.epoch || this.intentState !== intent) throw new Error('Respuesta de Categorías descartada por cambio de contexto.')
      this.observeRevisions(result.revisions)
      this.intentState = undefined
      await this.invalidateAndRefetchMasterData()
      this.emit()
      return result
    }).catch(async (error: unknown) => {
      if (this.live && epoch === this.epoch && this.intentState === intent && !this.authorizationError(error)) {
        intent.pending = undefined
        intent.error = error instanceof Error ? error.message : 'Operación de Categorías sin confirmar.'
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (!this.retryable(error)) { this.intentState = undefined; if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') await this.invalidateAndRefetchMasterData().catch(() => {}); this.emit() } else this.emit()
      }
      throw error
    })
    intent.pending = request
    this.emit()
    return request
  }
  refresh() { this.epoch++; this.snapshotState = undefined; this.derivedState = undefined; this.errorState = undefined; this.pending = undefined; this.emit() }
  resetAccess() { this.epoch++; this.floors = { groups: -1, catalog: -1, categories: -1 }; this.snapshotState = undefined; this.derivedState = undefined; this.pending = undefined; this.errorState = undefined; this.intentState = undefined; this.scope = ''; this.emit() }
  dispose() { this.live = false; this.resetAccess(); this.listeners.clear() }
}
