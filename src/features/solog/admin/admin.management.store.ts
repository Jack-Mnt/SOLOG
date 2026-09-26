import { domain, managementRead, managementMutate, ManagementError, type Domain, type ReadAction, type ReadPayloads, type Reads, type Payload, type Mutations, type MutationAction, type MutationResult, type Revisions } from './admin.management.v2'
import type { AdminBootstrap } from './admin.v2'

interface Entry { action: ReadAction; payload: Payload; data?: Reads[ReadAction]; error?: string; pending?: Promise<Reads[ReadAction]>; expiresAt?: number }
interface Intent { action: MutationAction; payload: Payload; site?: string; attempt: number; pending?: Promise<MutationResult>; error?: string }
export class ManagementStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private version = 0
  private live = true
  private accessEpoch = 0
  private floors = new Map<string, number>()
  private intents = new Map<Domain, Intent>()
  private resultOccurrences = new Map<Domain, number>()
  results = new Map<Domain, MutationResult>()
  constructor(readonly userId: string, private auth: () => AdminBootstrap | null, private changed: (revisions: Revisions, forbidden?: boolean) => void, private read = managementRead, private mutateRpc = managementMutate, private now = Date.now, private catalogProposalConfirmed: () => void = () => {}) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(fn => fn()) }
  private authorizationError(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED', 'SOLOG_SITE_FORBIDDEN', 'AUTH_REQUIRED', 'AUTH_INVALID', 'USER_DISABLED', 'ADMIN_REQUIRED'].includes(code)) {
      this.entries.clear(); this.results.clear(); this.resultOccurrences.clear(); this.changed({}, true); this.emit(); return true
    }
    return false
  }
  private access(site?: string) {
    const b = this.auth()
    if (!this.live || !b || b.identity.id !== this.userId) throw new Error('Contexto administrativo no disponible.')
    if (site && !b.allowed_sites.some(s => s.id === site)) throw new Error('Sede fuera del acceso administrativo.')
    b.allowed_sites.forEach(s => { this.seed('devices', s.devices_revision, s.id); this.seed('incidents', s.incidents_revision, s.id) })
    return b
  }
  private seed(name: Domain, revision?: number, site?: string) {
    if (revision === undefined || revision <= (this.floors.get(this.revKey(name, site)) ?? -1)) return
    this.floors.set(this.revKey(name, site), revision)
    this.invalidate(e => domain(e.action) === name && (!e.payload.site_id || e.payload.site_id === site))
  }
  private key(action: ReadAction, payload: Payload) { return JSON.stringify([this.userId, this.auth()?.identity.rol, action, Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))]) }
  peek<A extends ReadAction>(action: A, payload: ReadPayloads[A]) { const e = this.entries.get(this.key(action, payload)); return { data: e?.expiresAt !== undefined && e.expiresAt <= this.now() ? undefined : e?.data as Reads[A] | undefined, error: e?.error, expiresAt: e?.expiresAt } }
  private invalidate(predicate: (e: Entry) => boolean) { for (const [key, e] of this.entries) if (predicate(e)) this.entries.delete(key) }
  refresh() { this.entries.clear(); this.emit() }
  resetAccess() {
    this.accessEpoch++; this.entries.clear(); this.intents.clear(); this.results.clear(); this.resultOccurrences.clear()
    this.emit()
  }
  dispose() { this.live = false; this.entries.clear(); this.floors.clear(); this.intents.clear(); this.results.clear(); this.resultOccurrences.clear(); this.listeners.clear() }
  private revKey(name: string, site?: string) { const revisionName = name === 'incidents_global' ? 'incidents' : name; return `${revisionName}:${name === 'incidents_global' ? 'global' : site ?? 'global'}` }
  private observe(revisions: Revisions, site?: string, preserveIncidentSummary = false) {
    const scoped = Object.entries(revisions).filter(([name]) => name !== 'catalog')
    for (const [name, rev] of scoped) if (rev !== undefined && rev < (this.floors.get(this.revKey(name, site)) ?? -1)) throw new Error('Respuesta obsoleta: actualiza la fuente autoritativa.')
    for (const [name, rev] of scoped) {
      const key = this.revKey(name, site)
      if (rev !== undefined && rev > (this.floors.get(key) ?? -1)) {
        this.floors.set(key, rev)
        this.invalidate(e => name === 'incidents_global' ? domain(e.action) === 'incidents' : domain(e.action) === name && (!site || !e.payload.site_id || e.payload.site_id === site) && !(preserveIncidentSummary && name === 'incidents' && e.action === 'summary' && e.payload.site_id === site))
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
      if (action === 'detail_sites') {
        const r = result as Reads['detail_sites'], p = payload as ReadPayloads['detail_sites']
        if (r.family_key !== p.family_key) throw new Error('Detalle por sede de otra familia.')
      }
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
      if (this.live && this.entries.get(key) === entry && this.key(action, payload) === key && this.authorizationError(error)) throw error
      if (this.live && this.entries.get(key) === entry) { entry.pending = undefined; entry.error = error instanceof Error ? error.message : 'Error de lectura'; this.emit() }
      throw error
    })
    entry.pending = request
    return request
  }
  intent(d: Domain) { return this.intents.get(d) }
  resultOccurrence(d: Domain) { return this.resultOccurrences.get(d) }
  async mutation<A extends MutationAction>(action: A, payload: Mutations[A], expectedRevision: number, site?: string): Promise<MutationResult> {
    this.access(site)
    const d = domain(action)
    if (this.intents.has(d)) throw new Error('Hay una operación sin confirmar. Reinténtala antes de crear otra intención.')
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Falta revisión autoritativa.')
    const intent: Intent = { action, site, attempt: 0, payload: { ...payload, operation_id: crypto.randomUUID(), expected_revision: expectedRevision } }
    this.intents.set(d, intent)
    return this.execute(d, intent)
  }
  retryMutation(d: Domain) { const intent = this.intents.get(d); if (!intent) return Promise.reject(new Error('No hay operación pendiente.')); return this.execute(d, intent) }
  private patchIgnoredIncident(site: string, result: MutationResult) {
    if (!result.family_key || !result.until) return
    const key = this.key('summary', { site_id: site }), entry = this.entries.get(key)
    const summary = entry?.data as Reads['summary'] | undefined
    if (!entry || !summary) return
    const families = summary.families.map(family => {
      if (family.family_key !== result.family_key) return family
      const pending_cases = 0, suppressed_cases = family.suppressed_cases + family.pending_cases
      const active_cases = family.active_cases
      return { ...family, pending_cases, suppressed_cases, active_cases, active: active_cases > 0, family_state: suppressed_cases > 0 ? 'suprimida' as const : 'resuelta' as const, active_suppression_until: result.until!, scope_suppression_until: result.until!, reactivate_available: true }
    })
    entry.data = { ...summary, families, revisions: { ...summary.revisions, incidents: result.revisions.incidents ?? summary.revisions.incidents } }
    this.entries.set(key, entry)
  }
  private patchReactivatedIncident(site: string, result: MutationResult) {
    if (!result.family_key) return
    const key = this.key('summary', { site_id: site }), entry = this.entries.get(key)
    const summary = entry?.data as Reads['summary'] | undefined
    if (!entry || !summary) return
    const families = summary.families.map(family => {
      if (family.family_key !== result.family_key) return family
      const pending_cases = family.pending_cases + family.suppressed_cases
      const suppressed_cases = 0
      const active_cases = family.active_cases
      return { ...family, pending_cases, suppressed_cases, active_cases, active: active_cases > 0, family_state: active_cases > 0 ? 'pendiente' as const : 'resuelta' as const, active_suppression_until: null, scope_suppression_until: null, reactivate_available: false }
    })
    entry.data = { ...summary, families, revisions: { ...summary.revisions, incidents: result.revisions.incidents ?? summary.revisions.incidents } }
    this.entries.set(key, entry)
  }
  private patchDeletionProposed(result: MutationResult) {
    if (!result.family_key) return
    for (const [key, entry] of this.entries) {
      if (entry.action !== 'summary' || !entry.data) continue
      const summary = entry.data as Reads['summary']
      let changed = false
      const families = summary.families.map(family => {
        if (family.family_key !== result.family_key || family.deletion_proposed) return family
        changed = true
        return { ...family, deletion_proposed: true }
      })
      if (!changed) continue
      entry.data = { ...summary, families }
      this.entries.set(key, entry)
    }
  }
  private execute(d: Domain, intent: Intent): Promise<MutationResult> {
    this.access(intent.site)
    if (intent.pending) return intent.pending
    intent.error = undefined
    intent.attempt += 1
    const accessEpoch = this.accessEpoch
    const request = this.mutateRpc(intent.action, intent.payload).then(result => {
      this.access(intent.site)
      if (accessEpoch !== this.accessEpoch) throw new Error('Respuesta descartada por cambio de acceso.')
      if (d === 'devices' && (result.site_id !== intent.site || result.action !== intent.action)) throw new ManagementError('Mutación de otro dispositivo/scope', true)
      if (d === 'incidents' && (result.family_key !== intent.payload.family_key || result.scope !== intent.payload.scope || result.site_id !== (intent.site ?? null))) throw new ManagementError('Mutación de otra familia/scope', true)
      // Replay is prior success, not a second local update. Never roll a cache back to its old revision.
      const fresh = Object.fromEntries(Object.entries(result.revisions).filter(([name, rev]) => rev !== undefined && rev >= (this.floors.get(this.revKey(name, intent.site)) ?? -1)))
      const patchIncident = d === 'incidents' && (intent.action === 'ignore_30d' || intent.action === 'reactivate') && !!intent.site
      this.observe(fresh, intent.site, patchIncident)
      if (intent.action === 'ignore_30d' && patchIncident) this.patchIgnoredIncident(intent.site!, result)
      else if (intent.action === 'reactivate' && patchIncident) this.patchReactivatedIncident(intent.site!, result)
      else if (intent.action === 'propose_delete') {
        this.patchDeletionProposed(result)
      } else if (!patchIncident) this.invalidate(e => d === 'devices' ? domain(e.action) === 'devices' && (!e.payload.site_id || e.payload.site_id === intent.site) : domain(e.action) === 'incidents' && (!intent.site || !e.payload.site_id || e.payload.site_id === intent.site) && (e.action === 'summary' || e.payload.family_key === intent.payload.family_key))
      if (intent.action === 'propose_delete') {
        // Catálogo V4 is the next authority. Clear only its public cache after a confirmed or replayed proposal.
        this.catalogProposalConfirmed()
      }
      this.results.set(d, result); this.resultOccurrences.set(d, (this.resultOccurrences.get(d) ?? 0) + 1); this.intents.delete(d); this.emit(); return result
    }).catch((error: unknown) => {
      if (this.live && accessEpoch === this.accessEpoch) {
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
}