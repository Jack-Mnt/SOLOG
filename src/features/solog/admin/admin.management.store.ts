import { domain, managementRead, managementMutate, publishManagement, ManagementError, type Domain, type ReadAction, type ReadPayloads, type Reads, type Payload, type Mutations, type MutationAction, type MutationResult, type Revisions, type PublicationResult } from './admin.management.v2'
import type { AdminBootstrap } from './admin.v2'

interface Entry { action: ReadAction; payload: Payload; data?: Reads[ReadAction]; error?: string; pending?: Promise<Reads[ReadAction]>; expiresAt?: number }
interface Intent { action: MutationAction; payload: Payload; site?: string; pending?: Promise<MutationResult>; error?: string }
export class ManagementStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private version = 0
  private live = true
  private floors = new Map<string, number>()
  private intents = new Map<Domain, Intent>()
  results = new Map<Domain, MutationResult>()
  publication: { operationId?: string; pending?: Promise<PublicationResult>; result?: PublicationResult; error?: string } = {}
  constructor(readonly userId: string, private auth: () => AdminBootstrap | null, private changed: (revisions: Revisions, forbidden?: boolean) => void, private read = managementRead, private mutateRpc = managementMutate, private publishRpc = publishManagement, private now = Date.now) {
    // Only an operation receipt, never operational data or a catalog cache.
    try { const id = sessionStorage.getItem(this.receiptKey()); if (id && /^[0-9a-f-]{36}$/i.test(id)) this.publication.operationId = id } catch { /* Memory retry remains available. */ }
  }
  private receiptKey() { return `solog:publication:v2:${this.userId}` }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(fn => fn()) }
  private authorizationError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED', 'SOLOG_SITE_FORBIDDEN', 'AUTH_REQUIRED', 'AUTH_INVALID', 'USER_DISABLED', 'ADMIN_REQUIRED'].includes(code)) {
      this.entries.clear(); this.results.clear(); this.changed({}, true); this.emit(); return true
    }
    return false
  }
  private access(site?: string) {
    const b = this.auth()
    if (!this.live || !b || b.identity.id !== this.userId) throw new Error('Contexto administrativo no disponible.')
    if (site && !b.allowed_sites.some(s => s.id === site)) throw new Error('Sede fuera del acceso administrativo.')
    this.seed('groups', b.revisions.groups)
    this.seed('catalog', b.revisions.catalog)
    b.allowed_sites.forEach(s => { this.seed('devices', s.devices_revision, s.id); this.seed('incidents', s.incidents_revision, s.id) })
    return b
  }
  private seed(name: string, revision?: number, site?: string) {
    if (revision === undefined || revision <= (this.floors.get(this.revKey(name, site)) ?? -1)) return
    this.floors.set(this.revKey(name, site), revision)
    this.invalidate(e => name === 'groups' || name === 'catalog' ? domain(e.action) === 'master' : domain(e.action) === name && (!e.payload.site_id || e.payload.site_id === site))
  }
  observeGroups(revision: number) { this.seed('groups', revision); this.emit() }
  private key(action: ReadAction, payload: Payload) { return JSON.stringify([this.userId, this.auth()?.identity.rol, action, Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))]) }
  peek<A extends ReadAction>(action: A, payload: ReadPayloads[A]) { const e = this.entries.get(this.key(action, payload)); return { data: e?.expiresAt !== undefined && e.expiresAt <= this.now() ? undefined : e?.data as Reads[A] | undefined, error: e?.error, expiresAt: e?.expiresAt } }
  private invalidate(predicate: (e: Entry) => boolean) { for (const [key, e] of this.entries) if (predicate(e)) this.entries.delete(key) }
  refresh() { this.entries.clear(); this.emit() }
  dispose() { this.live = false; this.entries.clear(); this.floors.clear(); this.intents.clear(); this.results.clear(); this.listeners.clear() }
  private revKey(name: string, site?: string) { return `${name}:${name === 'groups' || name === 'catalog' ? 'global' : site ?? 'global'}` }
  private observe(revisions: Revisions, site?: string) {
    for (const [name, rev] of Object.entries(revisions)) if (rev !== undefined && rev < (this.floors.get(this.revKey(name, site)) ?? -1)) throw new Error('Respuesta obsoleta: actualiza la fuente autoritativa.')
    for (const [name, rev] of Object.entries(revisions)) {
      const key = this.revKey(name, site)
      if (rev !== undefined && rev > (this.floors.get(key) ?? -1)) {
        this.floors.set(key, rev)
        this.invalidate(e => name === 'groups' || name === 'catalog' ? domain(e.action) === 'master' : domain(e.action) === name && (!site || !e.payload.site_id || e.payload.site_id === site))
      }
    }
    this.changed(revisions)
  }
  retry<A extends ReadAction>(action: A, payload: ReadPayloads[A]) { this.entries.delete(this.key(action, payload)); this.emit() }
  async load<A extends ReadAction>(action: A, payload: ReadPayloads[A]): Promise<Reads[A]> {
    const site = 'site_id' in payload ? payload.site_id as string | undefined : undefined
    this.access(site)
    const key = this.key(action, payload), cached = this.entries.get(key)
    if (cached?.data && (cached.expiresAt === undefined || cached.expiresAt > this.now())) return cached.data as Reads[A]
    if (cached?.pending) return cached.pending as Promise<Reads[A]>
    const entry: Entry = { action, payload }
    this.entries.set(key, entry)
    const request = this.read(action, payload).then(result => {
      this.access(site)
      if (this.entries.get(key) !== entry || this.key(action, payload) !== key) throw new Error('Consulta invalidada durante la carga.')
      if ('site_id' in result && result.site_id !== (site ?? null)) throw new Error('Respuesta de otra sede.')
      if ('offset' in result && (result.offset !== (payload as Payload).offset || result.limit !== (payload as Payload).limit)) throw new Error('Página maestra incorrecta.')
      if (action === 'detail') {
        const r = result as Reads['detail'], p = payload as ReadPayloads['detail']
        if (r.family_key !== p.family_key || r.page !== p.page || r.page_size !== p.page_size) throw new Error('Detalle de otra familia/página.')
      }
      if (action === 'price_mismatch_options' && (result as Reads['price_mismatch_options']).propuesta_fingerprint !== (payload as ReadPayloads['price_mismatch_options']).propuesta_fingerprint) throw new Error('Opciones de otra propuesta.')
      if (action === 'list') {
        const devices = (result as Reads['list']).devices
        devices.forEach(d => { this.access(d.site_id); if (site && site !== d.site_id) throw new Error('Dispositivo de otra sede.') })
        // Validate all revisions before changing any cache.
        devices.forEach(d => { if (d.revision < (this.floors.get(this.revKey('devices', d.site_id)) ?? -1)) throw new Error('Lista de dispositivos obsoleta.') })
        devices.forEach(d => this.observe({ devices: d.revision }, d.site_id))
      } else if ('revisions' in result) this.observe(result.revisions, site)
      if (action === 'summary') {
        const summary = result as Reads['summary']
        // End of the backend-provided period in Lima. Anchor elapsed validity to generated_at,
        // not the client's calendar; never calculate a new operational period in the UI.
        const end = Date.parse(summary.period.to + 'T00:00:00-05:00') + 86400000
        entry.expiresAt = this.now() + Math.max(1000, end - Date.parse(summary.generated_at))
      }
      entry.data = result; entry.pending = undefined; this.entries.set(key, entry); this.emit(); return result
    }).catch((error: unknown) => {
      if (this.live && this.authorizationError(error)) throw error
      if (this.live && this.entries.get(key) === entry) { entry.pending = undefined; entry.error = error instanceof Error ? error.message : 'Error de lectura'; this.emit() }
      throw error
    })
    entry.pending = request
    return request
  }
  intent(d: Domain) { return this.intents.get(d) }
  async mutation<A extends MutationAction>(action: A, payload: Mutations[A], expectedRevision: number, site?: string): Promise<MutationResult> {
    this.access(site)
    const d = domain(action)
    if (this.intents.has(d)) throw new Error('Hay una operación sin confirmar. Reinténtala antes de crear otra intención.')
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Falta revisión autoritativa.')
    const intent: Intent = { action, site, payload: { ...payload, operation_id: crypto.randomUUID(), [d === 'master' ? 'expected_groups_revision' : 'expected_revision']: expectedRevision } }
    this.intents.set(d, intent)
    return this.execute(d, intent)
  }
  retryMutation(d: Domain) { const intent = this.intents.get(d); if (!intent) return Promise.reject(new Error('No hay operación pendiente.')); return this.execute(d, intent) }
  private execute(d: Domain, intent: Intent): Promise<MutationResult> {
    this.access(intent.site)
    if (intent.pending) return intent.pending
    intent.error = undefined
    const request = this.mutateRpc(intent.action, intent.payload).then(result => {
      this.access(intent.site)
      if (d === 'devices' && (result.site_id !== intent.site || result.action !== intent.action)) throw new ManagementError('Mutación de otro dispositivo/scope', true)
      if (d === 'incidents' && (result.family_key !== intent.payload.family_key || result.scope !== intent.payload.scope || result.site_id !== (intent.site ?? null))) throw new ManagementError('Mutación de otra familia/scope', true)
      // Replay is prior success, not a second local update. Never roll a cache back to its old revision.
      const fresh = Object.fromEntries(Object.entries(result.revisions).filter(([name, rev]) => rev !== undefined && rev >= (this.floors.get(this.revKey(name, intent.site)) ?? -1)))
      this.observe(fresh, intent.site)
      this.invalidate(e => d === 'master' ? domain(e.action) === 'master' : d === 'devices' ? domain(e.action) === 'devices' && (!e.payload.site_id || e.payload.site_id === intent.site) : domain(e.action) === 'incidents' && (!intent.site || !e.payload.site_id || e.payload.site_id === intent.site) && (e.action === 'summary' || e.payload.family_key === intent.payload.family_key))
      if (intent.action === 'propose_delete') this.invalidate(e => domain(e.action) === 'master')
      this.results.set(d, result); this.intents.delete(d); this.emit(); return result
    }).catch((error: unknown) => {
      if (this.live) {
        intent.pending = undefined; intent.error = error instanceof Error ? error.message : 'Operación sin confirmar.'
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : intent.error
        // Domain rejection is definitive; transport failures and retryable locks retain the exact intent.
        if (code.startsWith('SOLOG_') && !/RETRYABLE|IN_PROGRESS|UNKNOWN|EMPTY_RESPONSE|INVALID_CONTRACT_RESPONSE/.test(code)) {
          this.intents.delete(d)
          this.invalidate(e => domain(e.action) === d)
        }
        this.authorizationError(error)
        this.emit()
      }
      throw error
    })
    intent.pending = request; this.emit(); return request
  }
  publish(): Promise<PublicationResult> {
    if (this.access().identity.rol !== 'admin') return Promise.reject(new Error('Solo admin puede publicar.'))
    if (this.publication.pending) return this.publication.pending
    const operationId = this.publication.operationId ?? crypto.randomUUID()
    this.publication = { operationId }
    try { sessionStorage.setItem(this.receiptKey(), operationId) } catch { /* Keep the same in-memory receipt. */ }
    const request = this.publishRpc(operationId).then(result => {
      this.access()
      this.publication = { result }
      try { sessionStorage.removeItem(this.receiptKey()) } catch { /* Non-fatal. */ }
      this.invalidate(e => domain(e.action) === 'master'); this.changed({}); this.emit(); return result
    }).catch((error: unknown) => {
      if (this.live) {
        this.authorizationError(error)
        this.publication.pending = undefined; this.publication.error = error instanceof Error ? error.message : 'Publicación sin confirmar.'
        if (error instanceof ManagementError && !error.uncertain) {
          this.publication.operationId = undefined
          try { sessionStorage.removeItem(this.receiptKey()) } catch { /* Non-fatal. */ }
        }
        this.invalidate(e => e.action === 'publication_preview' || e.action === 'status'); this.emit()
      }
      throw error
    })
    this.publication.pending = request; this.emit(); return request
  }
}
