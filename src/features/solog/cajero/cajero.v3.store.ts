import { CashierHistoryCache, cashierHistoryDate } from './cajero.history'
import { SologApiError } from '../errors'
import { fetchCashierV3Bootstrap, mutateCashierV3 } from './cajero.v3.api'
import { applyCashierV3PanelDelta } from './cajero.v3.panel'
import type { CashierV3Action, CashierV3Bootstrap, CashierV3MutationResult } from './cajero.v3'
import { cashierCapability } from './cajero.capability'

interface Intent { action: CashierV3Action; payload: Record<string, unknown>; content: string; recoveryUntil?: number }
export interface CashierV3Transport {
  bootstrap: typeof fetchCashierV3Bootstrap
  mutate: typeof mutateCashierV3
}

// Instancia V3 por usuario autenticado. Los drafts permanecen exclusivamente en memoria.
export class CashierV3Store {
  bootstrap: CashierV3Bootstrap | null = null
  readonly history = new CashierHistoryCache()
  revision = 0
  busy = false
  serverOffsetMs = 0
  private expiredSessions = new Set<string>()
  private recoverySessions = new Set<string>()
  get needsCapabilityRefresh() { return false }
  get capability() {
    const result = cashierCapability(this.bootstrap, Date.now() + this.serverOffsetMs)
    const id = this.bootstrap?.panel_state?.session.id
    if (id && result.mode === 'expired') this.expiredSessions.add(id)
    if (id && result.mode === 'recovery') this.recoverySessions.add(id)
    if (id && this.expiredSessions.has(id)) return { mode: 'expired' as const, captureAllowed: false, deliveryAllowed: false }
    if (id && this.recoverySessions.has(id) && result.mode === 'active') {
      return { ...result, mode: 'recovery' as const, captureAllowed: false }
    }
    return result
  }
  get hasPendingIntent() { return this.intent !== null }
  get pendingAction() { return this.intent?.action ?? null }
  private generation = 0
  private listeners = new Set<() => void>()
  private loading: Promise<void> | null = null
  private intent: Intent | null = null
  private running: Promise<CashierV3MutationResult> | null = null
  constructor(
    readonly userId: string,
    readonly deviceToken: string,
    private invalidate: () => void,
    private transport: CashierV3Transport = { bootstrap: fetchCashierV3Bootstrap, mutate: mutateCashierV3 },
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
    this.expiredSessions.clear()
    this.recoverySessions.clear()
    this.loading = null
    this.running = null
    this.busy = false
    this.invalidate()
    this.emit()
  }
  get scope(): string | null {
    const b = this.bootstrap
    if (!b) return null
    return JSON.stringify([b.identity.id, b.site.id, b.device.id, b.panel_state?.session.id,
      b.panel_state?.basis.groups_revision, b.revisions.operational, b.revisions.devices])
  }
  async refresh(): Promise<void> {
    if (this.loading) return this.loading
    if (this.running || (this.intent && this.capability.mode !== 'expired')) throw new Error('Resuelve el envío pendiente antes de actualizar.')
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
    const panel = b?.panel_state
    if (!b || !b.device.autorizado) throw new SologApiError('SOLOG_DEVICE_UNAUTHORIZED')
    if (!panel || panel.source !== 'session') throw new SologApiError('SOLOG_SESSION_NOT_FOUND')
    return panel.session
  }
  retryPending() {
    if (!this.intent) return Promise.resolve(null)
    const { body } = JSON.parse(this.intent.content) as { body: Record<string, unknown> }
    return this.mutate(this.intent.action, body)
  }
  async start() { return this.mutate('start') }
  async mutate(action: CashierV3Action, body: Record<string, unknown> = {}): Promise<CashierV3MutationResult> {
    const b = this.bootstrap
    if (this.loading) throw new Error('Espera a que termine la actualización del panel.')
    if (!b) throw new Error('Carga el panel antes de continuar.')
    const panel = b.panel_state
    const content = JSON.stringify({ action, body })
    if (this.intent && this.intent.content !== content) throw new Error('Reintenta la operación pendiente antes de iniciar otra.')
    if (this.running) return this.running
    if (this.intent?.recoveryUntil !== undefined &&
      (Date.now() + this.serverOffsetMs >= this.intent.recoveryUntil ||
        this.expiredSessions.has(String(this.intent.payload.conteo_id)) ||
        this.intent.payload.conteo_id !== panel?.session.id)) {
      throw new SologApiError('SOLOG_SESSION_EXPIRED')
    }
    if (action !== 'start' && !this.capability.deliveryAllowed) throw new SologApiError('SOLOG_SESSION_EXPIRED')
    if (!this.intent) {
      if (action === 'start' && !b.start_capability.allowed) throw new SologApiError(
        b.start_capability.reason?.startsWith('SOLOG_') ? b.start_capability.reason as `SOLOG_${string}` : 'SOLOG_SESSION_CONFLICT')
      const session = action === 'start' ? null : this.assertSession()
      if (action === 'save_batch') {
        const items = body.items
        if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new SologApiError('SOLOG_INVALID_BATCH_PAYLOAD')
        for (const item of items) {
          if (!item || !Number.isInteger(item.stock_fisico) || item.stock_fisico < 0) throw new SologApiError('SOLOG_INVALID_BATCH_ITEM')
          if (!panel?.count_queue.includes(item.grupo_id)) throw new SologApiError('SOLOG_GROUP_NOT_AVAILABLE')
        }
      }
      if (action === 'recount_save_batch') {
        const items = body.items
        if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new SologApiError('SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD')
        const pending = new Set(panel?.review_queue.map((item) => item.detalle_id) ?? [])
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
      this.intent = { action, content, recoveryUntil: session ? Date.parse(session.recovery_until) : undefined,
        payload: { ...body, operation_id: crypto.randomUUID(), device_token: this.deviceToken,
          ...(session ? { conteo_id: session.id, expected_groups_revision: session.groups_revision } : {}) } }
    }
    const intent = this.intent
    const generation = this.generation
    this.busy = true
    this.emit()
    const request = this.transport.mutate(intent.action, intent.payload).then((response) => {
      if (generation !== this.generation) throw new Error('La sesión de usuario cambió durante la operación.')
      if (response.action !== intent.action) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      void this.capability
      const currentPanel = this.bootstrap?.panel_state
      if (response.action !== 'start') {
        if (!currentPanel || response.conteo_id !== currentPanel.session.id || response.revisions.groups !== currentPanel.session.groups_revision) {
          throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
        }
      }
      if (response.revisions.operational < (this.bootstrap?.revisions.operational ?? 0)) {
        throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
      }
      if (response.action === 'start') {
        if (response.panel_state.session.usuario_id !== this.userId || response.panel_state.session.sede_id !== b.site.id ||
          response.revisions.groups !== response.panel_state.session.groups_revision) throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
        this.bootstrap = { ...b, generated_at: response.generated_at, server_now: response.generated_at,
          revisions: response.revisions, stock: response.stock,
          session_capability: response.session_capability, pre_session_summary: null, panel_state: response.panel_state }
        this.invalidate()
      } else if (response.action === 'save_batch' || response.action === 'recount_save_batch') {
        this.bootstrap = { ...b, generated_at: response.generated_at, server_now: response.generated_at,
          revisions: response.revisions, session_capability: response.session_capability,
          panel_state: applyCashierV3PanelDelta(currentPanel!, response.panel_delta) }
      } else {
        this.bootstrap = { ...b, generated_at: response.generated_at, server_now: response.generated_at,
          revisions: response.revisions, session_capability: response.session_capability }
        this.invalidate()
      }
      if (!response.replay) this.serverOffsetMs = Math.max(this.serverOffsetMs, Date.parse(response.generated_at) - Date.now())
      if (response.action === 'save_batch') {
        const items = intent.payload.items as Array<{ contado_at: string }>
        this.history.invalidate(response.revisions.operational, new Set(items.map((item) => cashierHistoryDate(Date.parse(item.contado_at)))))
      } else if (response.action === 'recount_save_batch') {
        const detailIds = new Set((intent.payload.items as Array<{ detalle_id: string }>).map((item) => item.detalle_id))
        const dates = new Set((currentPanel?.review_queue ?? [])
          .filter((item) => detailIds.has(item.detalle_id))
          .map((item) => cashierHistoryDate(Date.parse(item.contado_at))))
        this.history.invalidate(response.revisions.operational, dates, detailIds)
      } else this.history.invalidate(response.revisions.operational, new Set())
      this.intent = null
      return response
    }).catch((error: unknown) => {
      if (generation === this.generation && error instanceof SologApiError &&
        !['SOLOG_INVALID_CONTRACT_RESPONSE', 'SOLOG_UNKNOWN_ERROR'].includes(error.code)) {
        this.intent = null
        if (error.code === 'SOLOG_SESSION_EXPIRED' && panel) this.expiredSessions.add(panel.session.id)
        if (['SOLOG_DEVICE_UNAUTHORIZED', 'SOLOG_AUTH_REQUIRED', 'SOLOG_USER_DISABLED', 'SOLOG_SESSION_EXPIRED'].includes(error.code)) {
          this.invalidate(); this.history.clear()
        }
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
