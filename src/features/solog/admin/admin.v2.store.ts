import { adminRpc, type AdminAction, type AdminBootstrap, type AdminPayloads, type AdminResponses, type Envelope } from './admin.v2'
import { ManagementStore } from './admin.management.store'

interface Entry { data?: Envelope; error?: string; pending?: Promise<Envelope>; action: AdminAction; site?: string; epoch: number; groups: number }
export class AdminStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  private version = 0
  private epoch = 0
  private live = true
  private groups = -1
  private operational = new Map<string, number>()
  bootstrap: AdminBootstrap | null = null
  readonly management: ManagementStore
  constructor(readonly userId: string, private rpc: typeof adminRpc = adminRpc) {
    this.management = new ManagementStore(userId, () => this.live ? this.bootstrap : null, (revisions, forbidden) => {
      if (forbidden) { this.epoch++; this.entries.clear(); this.bootstrap = null; this.emit(); return }
      if (revisions.groups !== undefined && revisions.groups > this.groups) {
        this.groups = revisions.groups; this.invalidate(); this.emit()
      }
    })
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.version
  private emit() { this.version++; this.listeners.forEach(fn => fn()) }
  key<A extends AdminAction>(action: A, payload: AdminPayloads[A]) {
    return JSON.stringify([this.userId, this.bootstrap?.identity.rol, action, Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))])
  }
  peek<A extends AdminAction>(action: A, payload: AdminPayloads[A]) {
    const entry = this.entries.get(this.key(action, payload))
    return { data: entry?.data as AdminResponses[A] | undefined, error: entry?.error }
  }
  private invalidate(site?: string) {
    for (const [key, entry] of this.entries) {
      if (entry.action !== 'bootstrap' && (!site || entry.site === site || entry.action === 'dashboard_cards')) this.entries.delete(key)
    }
  }
  private observe(response: Envelope, site?: string) {
    if (response.revisions.groups !== undefined) {
      if (response.revisions.groups < this.groups) throw new Error('Respuesta anterior a la revisión de grupos. Actualiza la consulta.')
      if (response.revisions.groups > this.groups) { this.groups = response.revisions.groups; this.management.observeGroups(this.groups); this.invalidate() }
    }
    if (site && response.revisions.operational !== undefined) this.observeSite(site, response.revisions.operational)
  }
  private observeSite(site: string, revision: number) {
    const previous = this.operational.get(site) ?? -1
    if (revision < previous) throw new Error('Respuesta anterior a la revisión de sede. Actualiza la consulta.')
    if (revision > previous) { this.operational.set(site, revision); this.invalidate(site) }
  }
  current = () => this.live
  dispose() { this.management.dispose(); this.live = false; this.epoch++; this.entries.clear(); this.bootstrap = null; this.operational.clear(); this.listeners.clear() }
  // Explicit refresh invalidates requests in flight as well as cached pages/details.
  refresh() { this.epoch++; this.entries.clear(); this.management.refresh(); this.emit() }
  async load<A extends AdminAction>(action: A, payload: AdminPayloads[A]): Promise<AdminResponses[A]> {
    if (!this.live) throw new Error('El contexto Admin ya no está activo.')
    if (action !== 'bootstrap' && !this.bootstrap) throw new Error('Primero valida el acceso administrativo.')
    const site = 'site_id' in payload ? String(payload.site_id) : undefined
    if (site && !this.bootstrap?.allowed_sites.some(s => s.id === site)) throw new Error('Sede fuera del acceso administrativo.')
    const key = this.key(action, payload)
    const cached = this.entries.get(key)
    if (cached?.data && action !== 'export') return cached.data as AdminResponses[A]
    if (cached?.pending) return cached.pending as Promise<AdminResponses[A]>
    const entry: Entry = { action, site, epoch: this.epoch, groups: this.groups }
    this.entries.set(key, entry)
    const request = this.rpc(action, payload).then(response => {
      if (!this.live || entry.epoch !== this.epoch) throw new Error('Respuesta descartada: cambió el contexto Admin.')
      if (this.entries.get(key) !== entry) throw new Error('Respuesta descartada: la consulta fue invalidada.')
      if (action !== 'bootstrap' && response.revisions.groups === undefined && entry.groups < this.groups) throw new Error('Respuesta anterior a la revisión de grupos. Actualiza la consulta.')
      if ('site_id' in response && response.site_id !== site) throw new Error('Respuesta recibida para otra sede.')
      if (action === 'bootstrap') {
        const b = response as AdminBootstrap
        if (b.identity.id !== this.userId) throw new Error('Identidad administrativa no coincide con Auth.')
        if (this.bootstrap && (b.identity.rol !== this.bootstrap.identity.rol || JSON.stringify(b.allowed_sites.map(s => s.id)) !== JSON.stringify(this.bootstrap.allowed_sites.map(s => s.id)))) { this.invalidate(); this.management.refresh() }
        this.bootstrap = b
        b.allowed_sites.forEach(s => this.observeSite(s.id, s.operational_revision))
      }
      if (action === 'dashboard_cards') {
        const cards = response as AdminResponses['dashboard_cards']
        if (cards.sites.some(s => !this.bootstrap?.allowed_sites.some(a => a.id === s.site_id))) throw new Error('Dashboard contiene una sede no autorizada.')
        cards.sites.forEach(s => this.observeSite(s.site_id, s.operational_revision))
      }
      if (action === 'export') {
        const result = response as AdminResponses['export']
        if (result.site.id !== site || result.period.key !== (payload as AdminPayloads['export']).period) throw new Error('Exportación de otro scope.')
      }
      if (action === 'shift_grid' && (response as AdminResponses['shift_grid']).period.key !== ((payload as AdminPayloads['shift_grid']).period ?? 'current_biweekly')) throw new Error('Período recibido incorrecto.')
      if (action === 'daily_detail' && (response as AdminResponses['daily_detail']).origin_date !== (payload as AdminPayloads['daily_detail']).origin_date) throw new Error('Fecha recibida incorrecta.')
      if (action === 'control_detail' && (response as AdminResponses['control_detail']).group_id !== (payload as AdminPayloads['control_detail']).group_id) throw new Error('Grupo recibido incorrecto.')
      if (action === 'control_page') {
        const r = response as AdminResponses['control_page'], p = payload as AdminPayloads['control_page']
        if (r.page !== p.page || r.page_size !== p.page_size || r.period.key !== p.period || (p.period === 'custom' && (r.period.from !== p.date_from || r.period.to !== p.date_to))) throw new Error('Página o período recibido incorrecto.')
      }
      this.observe(response, site)
      entry.data = response; entry.pending = undefined
      // bootstrap changes the role portion of the cache scope.
      this.entries.set(this.key(action, payload), entry)
      this.emit()
      return response
    }).catch((error: unknown) => {
      if (this.live && entry.epoch === this.epoch) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_ADMIN_ROLE_REQUIRED', 'SOLOG_SITE_FORBIDDEN'].includes(code)) {
          this.management.refresh()
          this.epoch++; this.entries.clear(); this.bootstrap = null
        }
        entry.pending = undefined; entry.error = error instanceof Error ? error.message : 'No se pudo consultar Admin.'
        const currentKey = this.key(action, payload)
        const currentEntry = this.entries.get(currentKey)
        if (!currentEntry || currentEntry === entry) this.entries.set(currentKey, entry)
        this.emit()
      }
      throw error
    })
    entry.pending = request
    return request
  }
  retry<A extends AdminAction>(action: A, payload: AdminPayloads[A]) { this.entries.delete(this.key(action, payload)); this.emit() }
}
