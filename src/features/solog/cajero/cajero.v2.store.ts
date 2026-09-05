import { CashierHistoryCache, cashierHistoryDate } from './cajero.history'
import { SologApiError } from '../errors'
import { fetchCashierBootstrap, mutateCashier, panelFromState } from './cajero.v2.api'
import type { CashierAction, CashierBootstrap, CashierMutation } from './cajero.v2'

interface Intent { action: CashierAction; payload: Record<string, unknown>; content: string }
export interface CashierTransport {
  bootstrap: typeof fetchCashierBootstrap
  mutate: typeof mutateCashier
}
// Instancia por usuario autenticado. Sin singleton de respuestas ni almacenamiento durable.
export class CashierStore {
  bootstrap: CashierBootstrap | null = null
  readonly history = new CashierHistoryCache()
  revision = 0
  busy = false
  serverOffsetMs = 0
  get hasPendingIntent() { return this.intent !== null }
  get pendingAction() { return this.intent?.action ?? null }
  private generation = 0
  private listeners = new Set<() => void>()
  private loading: Promise<void> | null = null
  private intent: Intent | null = null
  private running: Promise<CashierMutation> | null = null
  constructor(
    readonly userId: string,
    readonly deviceToken: string,
    private invalidate: () => void,
    private transport: CashierTransport = { bootstrap: fetchCashierBootstrap, mutate: mutateCashier },
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  getSnapshot = () => this.revision
  private emit() { this.revision++; this.listeners.forEach((listener) => listener()) }
  dispose() {
    this.history.clear()
    this.generation++
    this.bootstrap = null
    this.intent = null
    this.loading = null
    this.running = null
    this.busy = false
    this.invalidate()
    this.emit()
  }
  get scope(): string | null {
    const b = this.bootstrap
    if (!b) return null
    return JSON.stringify([b.identity.id, b.site.id, b.device.id, b.panel_state.session?.id,
      b.panel_state.basis.groups_revision, b.revisions.operational, b.revisions.devices])
  }
  async refresh(): Promise<void> {
    if (this.loading) return this.loading
    if (this.running || this.intent) throw new Error('Resuelve el envío pendiente antes de actualizar.')
    const generation = this.generation
    const request = this.transport.bootstrap(this.deviceToken).then((next) => {
      if (generation !== this.generation) return
      if (next.identity.id !== this.userId) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      const previousScope = this.scope
      const previousRevision = this.bootstrap?.revisions.operational
      const previous = this.bootstrap
      if (previous?.site.id === next.site.id &&
        (next.revisions.operational < previous.revisions.operational || next.revisions.devices < previous.revisions.devices)) {
        throw new Error('Respuesta de Cajero obsoleta. Vuelve a consultar.')
      }
      this.bootstrap = next
      this.serverOffsetMs = Date.parse(next.server_now) - Date.now()
      if (previousScope !== this.scope || !next.device.autorizado) this.invalidate()
      if (previous?.identity.id !== next.identity.id || previous?.site.id !== next.site.id || previous?.device.id !== next.device.id) this.history.clear()
      if (previous?.identity.id !== next.identity.id || previous?.site.id !== next.site.id ||
        previous?.device.id !== next.device.id || previous?.revisions.devices !== next.revisions.devices ||
        previousRevision !== next.revisions.operational || !next.device.autorizado) this.history.invalidate(next.revisions.operational)
      this.emit()
    }).finally(() => { if (this.loading === request) this.loading = null })
    this.loading = request
    return request
  }
  private assertSession() {
    const b = this.bootstrap
    const session = b?.panel_state.session
    if (!b || !b.device.autorizado) throw new SologApiError('SOLOG_DEVICE_UNAUTHORIZED')
    if (!session || b.panel_state.source !== 'session') throw new SologApiError('SOLOG_SESSION_NOT_FOUND')
    return session
  }
  retryPending() {
    if (!this.intent) return Promise.resolve(null)
    const { body } = JSON.parse(this.intent.content) as { body: Record<string, unknown> }
    return this.mutate(this.intent.action, body)
  }
  async mutate(action: CashierAction, body: Record<string, unknown> = {}): Promise<CashierMutation> {
    const b = this.bootstrap
    if (this.loading) throw new Error('Espera a que termine la actualización del panel.')
    if (!b) throw new Error('Carga el panel antes de continuar.')
    const content = JSON.stringify({ action, body })
    if (this.intent && this.intent.content !== content) throw new Error('Reintenta la operación pendiente antes de iniciar otra.')
    if (this.running) return this.running
    if (!this.intent) {
      if (action === 'start' && !b.start_capability.allowed) throw new SologApiError(
        b.start_capability.reason?.startsWith('SOLOG_') ? b.start_capability.reason as `SOLOG_${string}` : 'SOLOG_SESSION_CONFLICT')
      const session = action === 'start' ? null : this.assertSession()
      if (session && action !== 'finish' && (session.estado !== 'activo' || Date.now() + this.serverOffsetMs >= Date.parse(session.expira_at))) {
        throw new SologApiError('SOLOG_SESSION_EXPIRED')
      }
      if (action === 'save_batch') {
        const items = body.items
        if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new SologApiError('SOLOG_INVALID_BATCH_PAYLOAD')
        for (const item of items) {
          if (!item || !Number.isInteger(item.stock_fisico) || item.stock_fisico < 0) throw new SologApiError('SOLOG_INVALID_BATCH_ITEM')
          if (!b.panel_state.count_queue.includes(item.grupo_id)) throw new SologApiError('SOLOG_GROUP_NOT_AVAILABLE')
        }
      }
      if (action === 'recount_save_batch') {
        const items = body.items
        if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new SologApiError('SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD')
        const pending = new Set(b.panel_state.review_queue.map((item) => item.detalle_id))
        const seen = new Set<string>()
        for (const item of items) {
          if (!item || typeof item.detalle_id !== 'string' || seen.has(item.detalle_id) ||
            !Number.isInteger(item.stock_fisico) || item.stock_fisico < 0 ||
            typeof item.contado_at !== 'string' || !Number.isFinite(Date.parse(item.contado_at))) {
            throw new SologApiError('SOLOG_INVALID_RECOUNT_BATCH_ITEM')
          }
          if (!pending.has(item.detalle_id)) throw new SologApiError('SOLOG_RECOUNT_NOT_PENDING')
          seen.add(item.detalle_id)
        }
      }
      this.intent = { action, content, payload: { ...body, operation_id: crypto.randomUUID(), device_token: this.deviceToken,
        ...(session ? { conteo_id: session.id, expected_groups_revision: session.groups_revision } : {}) } }
    }
    const intent = this.intent
    const generation = this.generation
    this.busy = true
    this.emit()
    const request = this.transport.mutate(intent.action, intent.payload).then((response) => {
      if (generation !== this.generation) throw new Error('La sesión de usuario cambió durante la operación.')
      const state = response.state
      if (action !== 'start' && response.conteo_id !== b.panel_state.session?.id) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      if (state && response.revisions.groups !== state.session.groups_revision) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      if (state && (state.session.usuario_id !== this.userId || state.session.sede_id !== b.site.id ||
        (action !== 'start' && state.session.id !== b.panel_state.session?.id))) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      if (response.revisions.operational >= (this.bootstrap?.revisions.operational ?? 0)) {
        // Reemplazo, nunca suma de KPI: un replay no duplica cobertura ni resultados.
        this.bootstrap = { ...b, generated_at: response.generated_at, server_now: response.generated_at,
          revisions: response.revisions,
          ...(state ? { session_state: state, panel_state: panelFromState(state) } : {}) }
        // Un replay conserva generated_at del commit anterior: no atrasar el reloj.
        if (!response.replay) this.serverOffsetMs = Date.parse(response.generated_at) - Date.now()
        if (action === 'start' || action === 'finish') this.invalidate()
      }
      if (action === 'save_batch') {
        const items = intent.payload.items as Array<{ contado_at: string }>
        this.history.invalidate(response.revisions.operational, new Set(items.map((item) => cashierHistoryDate(Date.parse(item.contado_at)))))
      } else if (action === 'recount_save_batch') {
        const detailIds = new Set((intent.payload.items as Array<{ detalle_id: string }>).map((item) => item.detalle_id))
        const dates = new Set(b.panel_state.review_queue
          .filter((item) => detailIds.has(item.detalle_id))
          .map((item) => cashierHistoryDate(Date.parse(item.contado_at))))
        this.history.invalidate(response.revisions.operational, dates, detailIds)
      } else this.history.invalidate(response.revisions.operational, new Set())
      this.intent = null
      return response
    }).catch(async (error: unknown) => {
      // Errores de dominio rechazan la intención; red/timeout conservan UUID y contenido.
      if (generation === this.generation && error instanceof SologApiError &&
        !['SOLOG_INVALID_CONTRACT_RESPONSE', 'SOLOG_UNKNOWN_ERROR'].includes(error.code)) {
        this.intent = null
        if (['SOLOG_DEVICE_UNAUTHORIZED', 'SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_SESSION_EXPIRED'].includes(error.code)) { this.invalidate(); this.history.clear() }
      }
      throw error
    }).finally(() => {
      if (this.running === request) {
        this.running = null
        this.busy = false
        this.emit()
      }
    })
    this.running = request
    return request
  }
}
