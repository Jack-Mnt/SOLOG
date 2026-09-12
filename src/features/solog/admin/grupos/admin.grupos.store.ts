import type { AdminBootstrap } from '../admin.v2'
import type { MasterDataRevisionCoordinator } from '../masterdata/admin.masterdata.store'
import { groupsMutate, type GroupsMutationAction, type GroupsMutationResult, type GroupsMutations, type GroupsRevisions } from './admin.grupos.v1'

type MutationInput<T> = T extends { operation_id: string; expected_groups_revision: number; expected_catalog_revision: number }
  ? Omit<T, 'operation_id' | 'expected_groups_revision' | 'expected_catalog_revision'>
  : never
type Intent = { action: GroupsMutationAction; payload: GroupsMutations[GroupsMutationAction]; pending?: Promise<GroupsMutationResult>; error?: string }
export type GroupsMutateTransport = typeof groupsMutate

export class GroupsStore {
  private listeners = new Set<() => void>()
  private intentState?: Intent
  private version = 0
  private epoch = 0
  private live = true
  private scope = ''

  constructor(
    readonly userId: string,
    private auth: () => AdminBootstrap | null,
    private coordinator: MasterDataRevisionCoordinator,
    private changed: (revisions: GroupsRevisions, forbidden?: boolean) => void = () => {},
    private mutateRpc: GroupsMutateTransport = groupsMutate,
    private catalogStagingInvalidated: () => void = () => {},
  ) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(listener => listener()) }
  private clearSessionState() { this.epoch++; this.intentState = undefined }
  private access() {
    const bootstrap = this.auth()
    if (!this.live || !bootstrap || bootstrap.identity.id !== this.userId) throw new Error('Contexto Grupos no disponible.')
    if (!['admin', 'moderador'].includes(bootstrap.identity.rol)) throw new Error('Rol no autorizado para Grupos.')
    const scope = `${bootstrap.identity.id}:${bootstrap.identity.rol}`
    if (this.scope && this.scope !== scope) this.clearSessionState()
    this.scope = scope
    return bootstrap
  }
  private authorizationError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (!['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED'].includes(code)) return false
    this.clearSessionState(); this.changed(this.revisions(), true); this.emit(); return true
  }
  private retryable(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    return !code || /SOLOG_LOCK_CONFLICT_RETRYABLE|IN_PROGRESS|UNKNOWN|EMPTY_RESPONSE|INVALID_CONTRACT_RESPONSE/.test(code)
  }

  revisions() {
    const floors = this.coordinator.revisionFloors()
    return { groups: floors.groups, catalog: floors.catalog }
  }
  intent() { return this.intentState }
  refresh() { this.emit() }
  resetAccess() { this.clearSessionState(); this.scope = ''; this.emit() }
  dispose() { this.live = false; this.clearSessionState(); this.listeners.clear() }

  async mutation<A extends GroupsMutationAction>(action: A, payload: MutationInput<GroupsMutations[A]>): Promise<GroupsMutationResult> {
    this.access()
    if (this.intentState) throw new Error('Hay una operación de Grupos sin confirmar. Reinténtala antes de crear otra.')
    const revisions = this.revisions()
    if (revisions.groups < 0 || revisions.catalog < 0) throw new Error('Faltan revisiones autoritativas de Grupos.')
    const intent: Intent = {
      action,
      payload: { ...payload, operation_id: crypto.randomUUID(), expected_groups_revision: revisions.groups, expected_catalog_revision: revisions.catalog } as GroupsMutations[GroupsMutationAction],
    }
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
      this.coordinator.observeRevisions(result.revisions)
      this.changed(result.revisions)
      this.intentState = undefined
      this.emit()
      await this.coordinator.invalidateAndRefetchMasterData().catch(() => {})
      return result
    }).catch(async (error: unknown) => {
      if (this.live && epoch === this.epoch && this.intentState === intent && !this.authorizationError(error)) {
        intent.pending = undefined
        intent.error = error instanceof Error ? error.message : 'Operación Grupos sin confirmar.'
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (!this.retryable(error)) {
          this.intentState = undefined
          if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') await this.coordinator.invalidateAndRefetchMasterData().catch(() => {})
          if (code === 'SOLOG_CATALOG_STAGING_CONFLICT') this.catalogStagingInvalidated()
        }
        this.emit()
      }
      throw error
    })
    intent.pending = request
    this.emit()
    return request
  }
}
