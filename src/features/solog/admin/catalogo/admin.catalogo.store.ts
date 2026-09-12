import type { AdminBootstrap } from '../admin.v2'
import type { MasterDataRevisionCoordinator } from '../masterdata/admin.masterdata.store'
import { CatalogPublicationError, catalogMutate, catalogRead, publishCatalog, type CatalogMutationAction, type CatalogMutationResult, type CatalogMutations, type CatalogPublicationResult, type CatalogReadAction, type CatalogReadPayloads, type CatalogReads, type CatalogRevisions } from './admin.catalogo.v3'

type CatalogMutationInput<T> = T extends { operation_id: string; expected_catalog_revision: number; expected_groups_revision: number }
  ? Omit<T, 'operation_id' | 'expected_catalog_revision' | 'expected_groups_revision'>
  : never
export type CatalogQueryAction = Exclude<CatalogReadAction, 'reference' | 'products'>
export type CatalogQueryPayloads = Pick<CatalogReadPayloads, CatalogQueryAction>
type Entry = { action: CatalogQueryAction; payload: Record<string, unknown>; data?: CatalogReads[CatalogQueryAction]; error?: string; pending?: Promise<CatalogReads[CatalogQueryAction]> }
type Intent = { action: CatalogMutationAction; payload: CatalogMutations[CatalogMutationAction]; proposal?: CatalogReads['proposals']['rows'][number]; pending?: Promise<CatalogMutationResult>; error?: string }
type ProductProposalStatus = 'pendiente' | 'aprobado' | 'none'
type ProductStateOverlay = { action?: 'exclude' | 'reincorporate'; status: ProductProposalStatus; masterGeneration: number }
export interface CatalogConfirmedSetup {
  propuesta_fingerprint: string
  tipo: 'agregar_producto' | 'reincorporar_producto'
  c_interno: number
  producto: string
  precio: number
}
type ProductSetupOverlay = { hidden: boolean; target?: CatalogConfirmedSetup; masterGeneration: number }

export type CatalogReadTransport = typeof catalogRead
export type CatalogMutateTransport = typeof catalogMutate
export type CatalogPublishTransport = typeof publishCatalog

export class CatalogStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private floors: CatalogRevisions = { catalog: -1, groups: -1 }
  private intentState?: Intent
  private version = 0
  private epoch = 0
  private live = true
  private scope = ''
  private productStateOverlay = new Map<number, ProductStateOverlay>()
  private productSetupOverlay = new Map<string, ProductSetupOverlay>()
  publication: { operationId?: string; pending?: Promise<CatalogPublicationResult>; result?: CatalogPublicationResult; error?: string } = {}

  constructor(
    readonly userId: string,
    private auth: () => AdminBootstrap | null,
    private changed: (revisions: CatalogRevisions, forbidden?: boolean) => void = () => {},
    private read: CatalogReadTransport = catalogRead,
    private mutateRpc: CatalogMutateTransport = catalogMutate,
    private publishRpc: CatalogPublishTransport = publishCatalog,
    private coordinator?: MasterDataRevisionCoordinator,
  ) {
    try { const id = sessionStorage.getItem(this.receiptKey()); if (id && /^[0-9a-f-]{36}$/i.test(id)) this.publication.operationId = id } catch { /* Memory retry remains available. */ }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(listener => listener()) }
  private access() {
    const bootstrap = this.auth()
    if (!this.live || !bootstrap || bootstrap.identity.id !== this.userId) throw new Error('Contexto Catálogo no disponible.')
    if (bootstrap.identity.rol !== 'admin' && bootstrap.identity.rol !== 'moderador') throw new Error('Rol no autorizado para Catálogo.')
    const scope = `${bootstrap.identity.id}:${bootstrap.identity.rol}`
    if (this.scope && this.scope !== scope) {
      this.epoch++
      this.entries.clear()
      this.intentState = undefined
      this.clearStagingOverlay()
    }
    this.scope = scope
    return bootstrap
  }
  private receiptKey() { return `solog:catalog:publication:v3:${this.userId}` }
  private key(action: CatalogQueryAction, payload: Record<string, unknown>) {
    return JSON.stringify([this.userId, this.scope, action, Object.entries(payload).sort(([left], [right]) => left.localeCompare(right))])
  }
  private invalidate() { this.entries.clear() }
  private clearStagingOverlay() { this.productStateOverlay.clear(); this.productSetupOverlay.clear() }
  private authorizationError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (!['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED', 'AUTH_REQUIRED', 'AUTH_INVALID', 'USER_DISABLED', 'ADMIN_REQUIRED'].includes(code)) return false
    this.epoch++
    this.entries.clear()
    this.intentState = undefined
    this.changed({ catalog: this.floors.catalog, groups: this.floors.groups }, true)
    this.emit()
    return true
  }
  private observeRead(revisions: CatalogRevisions) {
    const central = this.coordinator?.revisionFloors()
    const floor = central ? { catalog: central.catalog, groups: central.groups } : this.floors
    if (revisions.catalog < floor.catalog || revisions.groups < floor.groups) throw new Error('Respuesta Catálogo obsoleta: actualiza la fuente autoritativa.')
    const changed = revisions.catalog > this.floors.catalog || revisions.groups > this.floors.groups
    this.floors = { catalog: Math.max(this.floors.catalog, revisions.catalog), groups: Math.max(this.floors.groups, revisions.groups) }
    if (changed) this.invalidate()
    this.coordinator?.observeRevisions(revisions)
    this.changed(this.floors)
  }
  private observeMutation(revisions: CatalogRevisions) {
    this.floors = { catalog: Math.max(this.floors.catalog, revisions.catalog), groups: Math.max(this.floors.groups, revisions.groups) }
    this.coordinator?.observeRevisions(revisions)
    this.changed(this.floors)
  }
  private cacheIsCurrent(revisions: CatalogRevisions) {
    const floor = this.coordinator?.revisionFloors()
    return !floor || revisions.catalog >= floor.catalog && revisions.groups >= floor.groups
  }
  private definitive(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    return code.startsWith('SOLOG_') && !/RETRYABLE|IN_PROGRESS|UNKNOWN|EMPTY_RESPONSE|INVALID_CONTRACT_RESPONSE/.test(code)
  }

  peek<A extends CatalogQueryAction>(action: A, payload: CatalogQueryPayloads[A]) {
    this.access()
    const key = this.key(action, payload)
    const entry = this.entries.get(key)
    if (entry?.data && !this.cacheIsCurrent(entry.data.revisions)) {
      this.entries.delete(key)
      return { data: undefined, error: undefined }
    }
    return { data: entry?.data as CatalogReads[A] | undefined, error: entry?.error }
  }
  revisions() { const floors = this.coordinator?.revisionFloors(); return floors ? { catalog: floors.catalog, groups: floors.groups } : { ...this.floors } }
  refresh() { this.epoch++; this.entries.clear(); this.emit() }
  resetAccess() { this.epoch++; this.entries.clear(); this.intentState = undefined; this.clearStagingOverlay(); this.scope = ''; this.emit() }
  dispose() { this.live = false; this.epoch++; this.entries.clear(); this.intentState = undefined; this.clearStagingOverlay(); this.listeners.clear() }
  retry<A extends CatalogQueryAction>(action: A, payload: CatalogQueryPayloads[A]) { this.entries.delete(this.key(action, payload)); this.emit() }

  private masterGeneration() { return this.coordinator?.snapshotGeneration?.() ?? 0 }
  private activeProductOverlay(cInterno: number) {
    const staged = this.productStateOverlay.get(cInterno)
    if (staged && this.masterGeneration() > staged.masterGeneration) { this.productStateOverlay.delete(cInterno); return undefined }
    return staged
  }
  confirmedProductState(cInterno: number) { return this.activeProductOverlay(cInterno)?.action }
  confirmedProductProposalStatus(cInterno: number) { return this.activeProductOverlay(cInterno)?.status }

  private activeSetupOverlay(fingerprint: string) {
    const staged = this.productSetupOverlay.get(fingerprint)
    if (staged && this.masterGeneration() > staged.masterGeneration) { this.productSetupOverlay.delete(fingerprint); return undefined }
    return staged
  }
  productSetupPrepared(fingerprint: string) { return this.activeSetupOverlay(fingerprint)?.hidden === true }
  confirmedSetupRequired() {
    const result: CatalogConfirmedSetup[] = []
    for (const [fingerprint] of this.productSetupOverlay) {
      const staged = this.activeSetupOverlay(fingerprint)
      if (staged && !staged.hidden && staged.target) result.push(staged.target)
    }
    return result
  }
  private cachedProposal(fingerprint: string) {
    for (const entry of this.entries.values()) {
      if (entry.action !== 'proposals' || !entry.data) continue
      const proposal = (entry.data as CatalogReads['proposals']).rows.find(item => item.propuesta_fingerprint === fingerprint)
      if (proposal) return proposal
    }
    return undefined
  }
  private applyProposalActionOverlay(payload: CatalogMutations['proposal_action'], proposalContext?: CatalogReads['proposals']['rows'][number]) {
    const proposal = proposalContext ?? this.cachedProposal(payload.propuesta_fingerprint)
    if (!proposal) return
    const masterGeneration = this.masterGeneration()
    if (proposal.tipo === 'excluir_producto' || proposal.tipo === 'reincorporar_producto' || proposal.tipo === 'eliminar_producto') {
      const current = this.productStateOverlay.get(proposal.c_interno)
      const action = proposal.tipo === 'excluir_producto' ? 'exclude' : proposal.tipo === 'reincorporar_producto' ? 'reincorporate' : current?.action
      const status: ProductProposalStatus = payload.action === 'approve' ? 'aprobado' : payload.action === 'withdraw' ? 'pendiente' : 'none'
      this.productStateOverlay.set(proposal.c_interno, { action, status, masterGeneration })
    }
    if (proposal.tipo === 'agregar_producto' || proposal.tipo === 'reincorporar_producto') {
      if (payload.action === 'approve') {
        this.productSetupOverlay.set(payload.propuesta_fingerprint, {
          hidden: false,
          masterGeneration,
          target: {
            propuesta_fingerprint: payload.propuesta_fingerprint,
            tipo: proposal.tipo,
            c_interno: proposal.c_interno,
            producto: proposal.producto ?? proposal.catalogo_actual.producto ?? `SKU ${proposal.c_interno}`,
            precio: proposal.catalogo_actual.precio ?? 0,
          },
        })
      } else {
        this.productSetupOverlay.set(payload.propuesta_fingerprint, { hidden: true, masterGeneration })
      }
    }
  }

  async load<A extends CatalogQueryAction>(action: A, payload: CatalogQueryPayloads[A]): Promise<CatalogReads[A]> {
    this.access()
    const key = this.key(action, payload)
    const cached = this.entries.get(key)
    if (cached?.data && this.cacheIsCurrent(cached.data.revisions)) return cached.data as CatalogReads[A]
    if (cached?.data) this.entries.delete(key)
    if (cached?.pending) return cached.pending as Promise<CatalogReads[A]>
    const entry: Entry = { action, payload }
    const epoch = this.epoch
    this.entries.set(key, entry)
    const request = this.read(action, payload as CatalogReadPayloads[A]).then(result => {
      this.access()
      if (epoch !== this.epoch || this.entries.get(key) !== entry) throw new Error('Consulta Catálogo invalidada durante la carga.')
      if (action === 'proposals') {
        const proposals = result as CatalogReads['proposals'], query = payload as CatalogReadPayloads['proposals']
        if (proposals.estado !== (query.estado ?? 'pendiente')) throw new Error('Propuestas recibidas para otro estado.')
      }
      if (action === 'price_options') {
        const options = result as CatalogReads['price_options'], query = payload as CatalogReadPayloads['price_options']
        if (options.propuesta_fingerprint !== query.propuesta_fingerprint) throw new Error('Opciones recibidas para otra propuesta.')
      }
      this.observeRead(result.revisions)
      entry.data = result
      entry.pending = undefined
      this.entries.set(key, entry)
      this.emit()
      return result
    }).catch((error: unknown) => {
      if (this.live && epoch === this.epoch && this.entries.get(key) === entry && !this.authorizationError(error)) {
        entry.pending = undefined
        entry.error = error instanceof Error ? error.message : 'Error al consultar Catálogo.'
        this.entries.set(key, entry)
        this.emit()
      }
      throw error
    })
    entry.pending = request
    return request
  }

  intent() { return this.intentState }
  async mutation<A extends CatalogMutationAction>(action: A, payload: CatalogMutationInput<CatalogMutations[A]>, context?: { proposal?: CatalogReads['proposals']['rows'][number] }): Promise<CatalogMutationResult> {
    this.access()
    if (this.intentState) throw new Error('Hay una operación de Catálogo sin confirmar. Reinténtala antes de crear otra.')
    const floors = this.revisions()
    if (floors.catalog < 0 || floors.groups < 0) throw new Error('Faltan revisiones autoritativas de Catálogo.')
    const intent: Intent = {
      action,
      payload: {
        ...payload,
        operation_id: crypto.randomUUID(),
        expected_catalog_revision: floors.catalog,
        expected_groups_revision: floors.groups,
      } as CatalogMutations[CatalogMutationAction],
      proposal: context?.proposal,
    }
    this.intentState = intent
    return this.execute(intent)
  }
  retryMutation() {
    if (!this.intentState) return Promise.reject(new Error('No hay una operación de Catálogo pendiente.'))
    return this.execute(this.intentState)
  }
  publish(): Promise<CatalogPublicationResult> {
    if (this.access().identity.rol !== 'admin') return Promise.reject(new Error('Solo admin puede publicar.'))
    if (this.publication.pending) return this.publication.pending
    const epoch = this.epoch
    const operationId = this.publication.operationId ?? crypto.randomUUID()
    this.publication = { operationId }
    try { sessionStorage.setItem(this.receiptKey(), operationId) } catch { /* Keep the in-memory receipt. */ }
    const request = this.publishRpc(operationId).then(async result => {
      this.access()
      if (epoch !== this.epoch) throw new Error('Respuesta de publicación descartada por cambio de acceso.')
      this.invalidate()
      this.publication = result.completion_recorded ? { result } : { operationId, result }
      if (result.completion_recorded) try { sessionStorage.removeItem(this.receiptKey()) } catch { /* Non-fatal. */ }
      this.emit()
      if (result.completion_recorded) {
        this.clearStagingOverlay()
        await this.coordinator?.invalidateAndRefetchMasterData().catch(() => {})
      }
      return result
    }).catch((error: unknown) => {
      if (this.live && epoch === this.epoch && !this.authorizationError(error)) {
        this.publication.pending = undefined
        this.publication.error = error instanceof Error ? error.message : 'Publicación sin confirmar.'
        if (error instanceof CatalogPublicationError && !error.uncertain) {
          this.publication.operationId = undefined
          try { sessionStorage.removeItem(this.receiptKey()) } catch { /* Non-fatal. */ }
        }
        this.invalidate()
        this.emit()
      }
      throw error
    })
    this.publication.pending = request
    this.emit()
    return request
  }
  private execute(intent: Intent): Promise<CatalogMutationResult> {
    this.access()
    if (intent.pending) return intent.pending
    intent.error = undefined
    const epoch = this.epoch
    const request = this.mutateRpc(intent.action, intent.payload).then(result => {
      this.access()
      if (epoch !== this.epoch || this.intentState !== intent) throw new Error('Respuesta Catálogo descartada por cambio de acceso.')
      this.observeMutation(result.revisions)
      if (intent.action === 'propose_product_state') {
        const payload = intent.payload as CatalogMutations['propose_product_state']
        this.productStateOverlay.set(payload.c_interno, { action: payload.action, status: 'pendiente', masterGeneration: this.masterGeneration() })
      }
      if (intent.action === 'prepare_product') {
        const payload = intent.payload as CatalogMutations['prepare_product']
        this.productSetupOverlay.set(payload.propuesta_fingerprint, { hidden: true, masterGeneration: this.masterGeneration() })
      }
      if (intent.action === 'proposal_action') this.applyProposalActionOverlay(intent.payload as CatalogMutations['proposal_action'], intent.proposal)
      this.invalidate()
      this.intentState = undefined
      this.emit()
      return result
    }).catch(async (error: unknown) => {
      if (this.live && epoch === this.epoch && this.intentState === intent && !this.authorizationError(error)) {
        intent.pending = undefined
        intent.error = error instanceof Error ? error.message : 'Operación Catálogo sin confirmar.'
        if (this.definitive(error)) {
          this.intentState = undefined
          if ((error as { code?: string }).code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') await this.coordinator?.invalidateAndRefetchMasterData().catch(() => {})
          this.invalidate()
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
