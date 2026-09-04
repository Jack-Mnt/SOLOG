import { SologApiError } from '../errors'
import { detailsDate, detailsRpc, type DetailsAccess, type DetailsDetail, type DetailsExportPeriod, type DetailsHistory, type DetailsPeriod, type DetailsSummary } from './detalles.v2'

export interface DetailsHistoryEntry { pages: DetailsHistory[]; revision: number; date: string }
export class DetailsStore {
  summary: DetailsSummary | null = null
  revision = 0
  operational = 0
  serverOffsetMs = 0
  accessBusy = false
  generation = 0
  private cacheEpoch = 0
  private pages = new Map<DetailsPeriod, DetailsHistoryEntry>()
  private cases = new Map<string, DetailsDetail>()
  private requests = new Map<string, Promise<unknown>>()
  private listeners = new Set<() => void>()
  private accessIntent: { operation_id: string; device_token: string } | null = null
  private accessRequest: Promise<DetailsAccess> | null = null
  constructor(readonly userId: string, readonly deviceToken: string, private rpc: typeof detailsRpc = detailsRpc) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.revision
  private emit() { this.revision++; this.listeners.forEach((listener) => listener()) }
  now = () => Date.now() + this.serverOffsetMs
  private clearData() { this.cacheEpoch++; this.pages.clear(); this.cases.clear(); this.requests.clear() }
  dispose() { this.generation++; this.clearData(); this.summary = null; this.operational = 0; this.accessIntent = null; this.accessRequest = null; this.accessBusy = false; this.emit() }
  private current(generation: number, epoch?: number) {
    if (generation !== this.generation || (epoch !== undefined && epoch !== this.cacheEpoch)) throw new Error('El contexto de Detalles cambió.')
  }
  private fail(error: unknown, generation: number): never {
    if (generation === this.generation && error instanceof SologApiError &&
      ['SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_OPERATIONAL_ROLE_REQUIRED', 'SOLOG_SEDE_NOT_FOUND'].includes(error.code)) {
      this.clearData(); this.summary = null; this.accessIntent = null; this.emit()
    }
    throw error
  }
  private observeRevision(revision: number) {
    if (revision < this.operational) throw new Error('La respuesta de Detalles quedó obsoleta. Vuelve a consultar.')
    if (revision > this.operational) { this.clearData(); this.operational = revision }
  }
  async loadSummary() {
    if (this.accessBusy || this.accessIntent) throw new Error('Resuelve la solicitud de acceso pendiente antes de actualizar.')
    const existing = this.requests.get('summary') as Promise<DetailsSummary> | undefined
    if (existing) return existing
    const generation = this.generation
    const request = this.rpc('summary', this.deviceToken ? { device_token: this.deviceToken } : {}).then((r) => {
      this.current(generation)
      if (this.requests.get('summary') !== request) throw new Error('La consulta de Detalles fue invalidada.')
      if (this.summary?.site.id === r.site.id && r.revisions.devices < this.summary.revisions.devices) throw new Error('Revisión de dispositivo obsoleta.')
      if (this.summary && this.summary.site.id !== r.site.id) { this.clearData(); this.operational = 0; this.accessIntent = null }
      this.observeRevision(r.revisions.operational)
      if (this.summary && this.summary.revisions.devices !== r.revisions.devices) this.clearData()
      this.summary = r
      this.serverOffsetMs = Date.parse(r.generated_at) - Date.now()
      this.emit()
      return r
    }).catch((error: unknown) => {
      if (this.requests.get('summary') !== request) throw error
      return this.fail(error, generation)
    }).finally(() => { if (this.requests.get('summary') === request) this.requests.delete('summary') })
    this.requests.set('summary', request)
    return request
  }
  getHistory(period: DetailsPeriod) {
    const entry = this.pages.get(period)
    if (entry && (entry.date !== detailsDate(this.now(), period) || entry.revision !== this.operational)) { this.pages.delete(period); return null }
    return entry ?? null
  }
  async loadHistory(period: DetailsPeriod, more = false, recoverCursor = true): Promise<DetailsHistoryEntry> {
    if (!this.summary) throw new Error('Carga el resumen antes del historial.')
    const cached = this.getHistory(period)
    if (cached && !more) return cached
    const cursor = more ? cached?.pages.at(-1)?.next_cursor : undefined
    if (cached && more && !cursor) return cached
    const key = JSON.stringify(['history', period, cursor ?? null])
    const pending = this.requests.get(key) as Promise<DetailsHistoryEntry> | undefined
    if (pending) return pending
    const generation = this.generation, epoch = this.cacheEpoch
    const request = this.rpc('history', { period, page_size: 100, ...(cursor ? { cursor } : {}) }).then((r) => {
      this.current(generation, epoch)
      if (r.period !== period || r.date !== detailsDate(this.now(), period)) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      if (cursor && cached && cached.revision !== r.revisions.operational) throw new SologApiError('SOLOG_PAGE_CURSOR_INVALID')
      this.observeRevision(r.revisions.operational)
      const pages = cursor && cached ? [...cached.pages, r] : [r]
      const ids = pages.flatMap((page) => page.items.map((item) => item.case_id))
      if (new Set(ids).size !== ids.length || (r.next_cursor !== null && (r.next_cursor === cursor || pages.slice(0, -1).some((p) => p.next_cursor === r.next_cursor)))) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      const entry = { pages, revision: r.revisions.operational, date: r.date }
      this.pages.set(period, entry)
      this.emit()
      return entry
    }).catch(async (error: unknown) => {
      this.current(generation, epoch)
      if (error instanceof SologApiError && error.code === 'SOLOG_PAGE_CURSOR_INVALID' && recoverCursor) {
        this.pages.delete(period)
        this.requests.delete(key)
        return this.loadHistory(period, false, false)
      }
      return this.fail(error, generation)
    }).finally(() => { if (this.requests.get(key) === request) this.requests.delete(key) })
    this.requests.set(key, request)
    return request
  }
  getDetail(caseId: string) {
    const r = this.cases.get(caseId)
    return r?.revisions.operational === this.operational ? r : null
  }
  async loadDetail(caseId: string) {
    const cached = this.getDetail(caseId)
    if (cached) return cached
    const key = 'detail:' + caseId
    const existing = this.requests.get(key) as Promise<DetailsDetail> | undefined
    if (existing) return existing
    const generation = this.generation, epoch = this.cacheEpoch
    const request = this.rpc('detail', { case_id: caseId }).then((r) => {
      this.current(generation, epoch)
      if (r.case.case_id !== caseId) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      this.observeRevision(r.revisions.operational)
      this.cases.set(caseId, r)
      this.emit()
      return r
    }).catch((error: unknown) => {
      this.current(generation, epoch)
      return this.fail(error, generation)
    }).finally(() => { if (this.requests.get(key) === request) this.requests.delete(key) })
    this.requests.set(key, request)
    return request
  }
  async export(period: DetailsExportPeriod) {
    const generation = this.generation, epoch = this.cacheEpoch
    const site = this.summary?.site.id
    const r = await this.rpc('export', { period }).catch((error: unknown) => {
      this.current(generation, epoch)
      return this.fail(error, generation)
    })
    this.current(generation, epoch)
    if (r.site.id !== site || r.period.key !== period) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
    this.observeRevision(r.revisions.operational)
    this.emit()
    return r
  }
  async requestAccess(): Promise<DetailsAccess> {
    const existing = this.accessRequest
    if (existing) return existing
    if (!this.accessIntent && !this.summary?.access.can_request) throw new Error('No está disponible la solicitud de acceso.')
    if (!this.deviceToken) throw new SologApiError('SOLOG_DEVICE_REQUIRED')
    this.accessIntent ??= { operation_id: crypto.randomUUID(), device_token: this.deviceToken }
    const generation = this.generation
    this.accessBusy = true
    this.emit()
    const request = this.rpc('request_access', this.accessIntent).then((r) => {
      this.current(generation)
      this.accessIntent = null
      const s = this.summary
      if (s && r.revisions.devices >= s.revisions.devices) {
        this.summary = { ...s, revisions: { ...s.revisions, devices: r.revisions.devices },
          access: r.status === 'site_already_authorized'
            ? { ...s.access, authorized_device_id: r.authorized_device_id, can_request: false }
            : { ...s.access, current_device_id: r.device_id, current_device_state: r.status === 'pending' ? 'pendiente' : 'autorizado',
                ...(r.status === 'authorized' ? { authorized_device_id: r.device_id, can_request: false } : {}) } }
      }
      return r
    }).catch((error: unknown) => {
      if (generation === this.generation && error instanceof SologApiError &&
        !['SOLOG_UNKNOWN_ERROR', 'SOLOG_INVALID_CONTRACT_RESPONSE'].includes(error.code)) this.accessIntent = null
      return this.fail(error, generation)
    }).finally(() => {
      if (this.accessRequest === request) this.accessRequest = null
      if (generation === this.generation) { this.accessBusy = false; this.emit() }
    })
    this.accessRequest = request
    return request
  }
}
