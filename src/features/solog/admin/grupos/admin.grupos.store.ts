import type { AdminBootstrap } from '../admin.v2'
import type { MasterDataRevisionCoordinator } from '../masterdata/admin.masterdata.store'
import { groupsMutate, groupsRead, type GroupsMutationAction, type GroupsMutationResult, type GroupsMutations, type GroupsReadAction, type GroupsReadPayloads, type GroupsReads, type GroupsRevisions } from './admin.grupos.v1'

type MutationInput<T> = T extends { operation_id: string; expected_groups_revision: number; expected_catalog_revision: number } ? Omit<T, 'operation_id' | 'expected_groups_revision' | 'expected_catalog_revision'> : never
type Entry = { action: GroupsReadAction; payload: Record<string, unknown>; data?: GroupsReads[GroupsReadAction]; error?: string; pending?: Promise<GroupsReads[GroupsReadAction]> }
type Intent = { action: GroupsMutationAction; payload: GroupsMutations[GroupsMutationAction]; pending?: Promise<GroupsMutationResult>; error?: string }
export type GroupsReadTransport = typeof groupsRead
export type GroupsMutateTransport = typeof groupsMutate

export class GroupsStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private revisionsState: GroupsRevisions = { groups: -1, catalog: -1 }
  private intentState?: Intent
  private version = 0
  private epoch = 0
  private live = true
  private scope = ''
  constructor(readonly userId: string, private auth: () => AdminBootstrap | null, private changed: (revisions: GroupsRevisions, forbidden?: boolean) => void = () => {}, private read: GroupsReadTransport = groupsRead, private mutateRpc: GroupsMutateTransport = groupsMutate, private coordinator?: MasterDataRevisionCoordinator) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(listener => listener()) }
  private access() {
    const bootstrap = this.auth()
    if (!this.live || !bootstrap || bootstrap.identity.id !== this.userId) throw new Error('Contexto Grupos no disponible.')
    if (!['admin', 'moderador'].includes(bootstrap.identity.rol)) throw new Error('Rol no autorizado para Grupos.')
    const scope = `${bootstrap.identity.id}:${bootstrap.identity.rol}`
    if (this.scope && this.scope !== scope) { this.epoch++; this.entries.clear(); this.intentState = undefined }
    this.scope = scope
    return bootstrap
  }
  private key(action: GroupsReadAction, payload: Record<string, unknown>) { return JSON.stringify([this.userId, this.scope, action, Object.entries(payload).sort(([left], [right]) => left.localeCompare(right))]) }
  private invalidate() { this.entries.clear() }
  private authorizationError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (!['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED'].includes(code)) return false
    this.epoch++; this.entries.clear(); this.intentState = undefined; this.changed(this.revisionsState, true); this.emit(); return true
  }
  private observeRead(revisions: GroupsRevisions) {
    const central = this.coordinator?.revisionFloors()
    const floor = central ? { groups: central.groups, catalog: central.catalog } : this.revisionsState
    if (revisions.groups < floor.groups || revisions.catalog < floor.catalog) throw new Error('Respuesta Grupos obsoleta: actualiza la fuente autoritativa.')
    const changed = revisions.groups > this.revisionsState.groups || revisions.catalog > this.revisionsState.catalog
    this.revisionsState = { groups: Math.max(this.revisionsState.groups, revisions.groups), catalog: Math.max(this.revisionsState.catalog, revisions.catalog) }
    if (changed) this.invalidate()
    this.coordinator?.observeRevisions(revisions)
    this.changed(this.revisionsState)
  }
  private observeMutation(revisions: GroupsRevisions) { this.revisionsState = { ...revisions }; this.coordinator?.observeRevisions(revisions); this.changed(this.revisionsState) }
  private retryable(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    return !code || /SOLOG_LOCK_CONFLICT_RETRYABLE|IN_PROGRESS|UNKNOWN|EMPTY_RESPONSE|INVALID_CONTRACT_RESPONSE/.test(code)
  }
  private async refetchAuthoritative() {
    this.epoch++; this.invalidate(); this.emit()
    if (this.coordinator) await this.coordinator.refetchMasterData().catch(() => {})
    else await Promise.all([this.load('status', {}), this.load('reference', {})]).catch(() => {})
  }
  peek<A extends GroupsReadAction>(action: A, payload: GroupsReadPayloads[A]) { this.access(); const entry = this.entries.get(this.key(action, payload)); return { data: entry?.data as GroupsReads[A] | undefined, error: entry?.error } }
  revisions() { const floors = this.coordinator?.revisionFloors(); return floors ? { groups: floors.groups, catalog: floors.catalog } : { ...this.revisionsState } }
  intent() { return this.intentState }
  refresh() { this.epoch++; this.entries.clear(); this.emit() }
  resetAccess() { this.epoch++; this.entries.clear(); this.intentState = undefined; this.scope = ''; this.emit() }
  dispose() { this.live = false; this.epoch++; this.entries.clear(); this.intentState = undefined; this.listeners.clear() }
  retry<A extends GroupsReadAction>(action: A, payload: GroupsReadPayloads[A]) { this.entries.delete(this.key(action, payload)); this.emit() }
  async load<A extends GroupsReadAction>(action: A, payload: GroupsReadPayloads[A]): Promise<GroupsReads[A]> {
    this.access()
    const key = this.key(action, payload), cached = this.entries.get(key)
    if (cached?.data) return cached.data as GroupsReads[A]
    if (cached?.pending) return cached.pending as Promise<GroupsReads[A]>
    const entry: Entry = { action, payload }, epoch = this.epoch
    this.entries.set(key, entry)
    const request = this.read(action, payload).then(result => {
      this.access()
      if (epoch !== this.epoch || this.entries.get(key) !== entry) throw new Error('Consulta Grupos invalidada durante la carga.')
      if (action === 'group_detail' && (result as GroupsReads['group_detail']).group.id !== (payload as GroupsReadPayloads['group_detail']).grupo_id) throw new Error('Detalle recibido para otro grupo.')
      this.observeRead(result.revisions)
      entry.data = result; entry.pending = undefined; this.entries.set(key, entry); this.emit(); return result
    }).catch((error: unknown) => {
      if (this.live && epoch === this.epoch && this.entries.get(key) === entry && !this.authorizationError(error)) { entry.pending = undefined; entry.error = error instanceof Error ? error.message : 'Error al consultar Grupos.'; this.entries.set(key, entry); this.emit() }
      throw error
    })
    entry.pending = request
    return request
  }
  async mutation<A extends GroupsMutationAction>(action: A, payload: MutationInput<GroupsMutations[A]>): Promise<GroupsMutationResult> {
    this.access()
    if (this.intentState) throw new Error('Hay una operación de Grupos sin confirmar. Reinténtala antes de crear otra.')
    const revisions = this.revisions()
    if (revisions.groups < 0 || revisions.catalog < 0) throw new Error('Faltan revisiones autoritativas de Grupos.')
    const intent: Intent = { action, payload: { ...payload, operation_id: crypto.randomUUID(), expected_groups_revision: revisions.groups, expected_catalog_revision: revisions.catalog } as GroupsMutations[GroupsMutationAction] }
    this.intentState = intent
    return this.execute(intent)
  }
  retryMutation() { return this.intentState ? this.execute(this.intentState) : Promise.reject(new Error('No hay una operación de Grupos pendiente.')) }
  private execute(intent: Intent): Promise<GroupsMutationResult> {
    this.access()
    if (intent.pending) return intent.pending
    intent.error = undefined
    const epoch = this.epoch
    const request = this.mutateRpc(intent.action, intent.payload).then(async result => {
      this.access()
      if (epoch !== this.epoch || this.intentState !== intent) throw new Error('Respuesta Grupos descartada por cambio de acceso.')
      this.observeMutation(result.revisions); this.invalidate(); this.intentState = undefined; await this.coordinator?.refetchMasterData(); this.emit(); return result
    }).catch(async (error: unknown) => {
      if (this.live && epoch === this.epoch && this.intentState === intent && !this.authorizationError(error)) {
        intent.pending = undefined; intent.error = error instanceof Error ? error.message : 'Operación Grupos sin confirmar.'
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (!this.retryable(error)) {
          this.intentState = undefined
          if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT' || code === 'SOLOG_CATALOG_STAGING_CONFLICT') await this.refetchAuthoritative()
          else { this.invalidate(); this.emit() }
        } else this.emit()
      }
      throw error
    })
    intent.pending = request; this.emit(); return request
  }
}
