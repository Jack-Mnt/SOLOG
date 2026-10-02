import { SologApiError } from '../errors'
import { mutateCashierV4, type CashierV4Rpc } from './cajero.v4.api'
import type { CashierV4CountItem, CashierV4RecountItem, CashierV4MutationResult } from './cajero.v4'
import { CashierV4Store, type CashierV4DeliveryState } from './cajero.v4.store'
import { canCashierV4CaptureForSession, canCashierV4DeliverPendingForSession, getCashierV4SessionCapability } from './cajero.v4.capability'
import { getCashierV4ErrorPolicy } from './cajero.v4.errors'
import {
  CASHIER_V4_BATCH_LIMIT, CashierV4DraftStorage, cashierV4DraftStorageKey,
  type CashierV4DraftScope, type CashierV4NormalDraft, type CashierV4RecountDraft,
  type CashierV4SessionDrafts, type CashierV4PreparedOperation,
} from './cajero.v4.storage'

const runningStores = new WeakSet<CashierV4Store>()
export type CashierV4FlushStop = 'none' | 'no_eligible_drafts' | 'missing_delivery_state' |
  'delivery_not_allowed' | 'session_unavailable' | 'idempotency_conflict' | 'no_progress' | 'iteration_limit' | 'finished'
export interface CashierV4FlushResult { confirmedBatches: number; reason: CashierV4FlushStop }

function deltaDelivery(scope: CashierV4DraftScope, response: Extract<CashierV4MutationResult, { action: 'save_batch' | 'recount_save_batch' }>): CashierV4DeliveryState {
  const d = response.panel_delta
  return { conteo_id: scope.conteo_id, groups_revision: scope.groups_revision,
    review_queue: d.review_queue, coverage_queue: d.coverage_queue, daily_queue: d.daily_queue,
    kpis: d.kpis, next_action: d.next_action }
}

function eligible(record: CashierV4SessionDrafts) {
  const delivery = record.delivery_state
  if (!delivery || delivery.next_action === 'none') return { normal: [], recount: [] }
  if (delivery.next_action === 'review') return {
    normal: [], recount: record.recount.filter(draft => delivery.review_queue.some(item =>
      item.detalle_id === draft.detalle_id && item.grupo_id === draft.grupo_id)),
  }
  const queue = new Set(delivery.next_action === 'coverage' ? delivery.coverage_queue : delivery.daily_queue)
  return { normal: record.normal.filter(draft => queue.has(draft.grupo_id)), recount: [] }
}

// No runtime mount or automatic retry. Each public command is an explicit caller intent.
export class CashierV4DraftCoordinator {
  constructor(readonly store: CashierV4Store, readonly storage: CashierV4DraftStorage,
    private readonly call?: CashierV4Rpc, private readonly uuid: () => string = () => crypto.randomUUID(),
    private readonly now: () => number = Date.now) {}

  private serverNow() { return this.now() + this.store.serverOffsetMs }
  private assertIdentity(scope: CashierV4DraftScope) {
    const b = this.store.getSnapshot().bootstrap
    if (!b || b.identity.id !== scope.usuario_id || b.site.id !== scope.sede_id || b.device.id !== scope.dispositivo_id) {
      throw new Error('El scope pertenece a otro usuario, sede o dispositivo.')
    }
  }
  activeScope(): CashierV4DraftScope | null {
    const b = this.store.getSnapshot().bootstrap
    const panel = this.store.getSnapshot().panel_state
    if (!b || !panel || !b.device.id) return null
    return { usuario_id: b.identity.id, sede_id: b.site.id, dispositivo_id: b.device.id,
      conteo_id: panel.session.id, groups_revision: panel.basis.groups_revision }
  }
  sessionScope(conteoId: string): CashierV4DraftScope | null {
    const active = this.activeScope()
    if (active?.conteo_id === conteoId) return active
    const b = this.store.getSnapshot().bootstrap
    if (!b?.device.id) return null
    const identity = { usuario_id: b.identity.id, sede_id: b.site.id, dispositivo_id: b.device.id }
    const matches = this.storage.sessions(identity).filter(record => !record.finished && record.scope.conteo_id === conteoId)
    return matches.length === 1 ? matches[0].scope : null
  }
  // Called explicitly or before a command. Refresh never clears persisted session envelopes.
  synchronize(scope: CashierV4DraftScope) {
    this.assertIdentity(scope)
    const record = this.storage.read(scope)
    const delivery = this.store.getSnapshot().delivery_state_by_session[scope.conteo_id]
    if (delivery) {
      if (delivery.groups_revision !== scope.groups_revision) throw new Error('La revisión congelada del scope no coincide.')
      // While a prepared operation is unresolved, keep its original snapshot and receipt together.
      if (!record.prepared && !record.finished) {
        record.delivery_state = delivery
        this.storage.write(record)
      }
    }
    return this.storage.read(scope)
  }
  private captureRecord(scope: CashierV4DraftScope, timestamp: string) {
    if (runningStores.has(this.store)) throw new Error('Hay una request en curso.')
    this.assertIdentity(scope)
    const active = this.activeScope()
    if (!active || cashierV4DraftStorageKey(active) !== cashierV4DraftStorageKey(scope) ||
        !canCashierV4CaptureForSession(this.store.getSnapshot(), scope.conteo_id, this.serverNow())) {
      throw new Error('Esta sesión no permite nuevas capturas.')
    }
    const cap = getCashierV4SessionCapability(this.store.getSnapshot(), scope.conteo_id)!
    const captured = Date.parse(timestamp)
    if (!Number.isFinite(captured) || captured < Date.parse(cap.iniciado_at!) ||
        captured >= Date.parse(cap.expira_at!) || captured > this.serverNow() + 30000) throw new Error('Timestamp de captura fuera de ventana.')
    const record = this.synchronize(scope)
    if (record.prepared || record.finished) throw new Error('Resuelve primero la operación preparada de esta sesión.')
    return record
  }
  captureNormal(scope: CashierV4DraftScope, input: Omit<CashierV4CountItem, 'client_observation_id'>, metadata?: Record<string, string>): CashierV4NormalDraft {
    const record = this.captureRecord(scope, input.contado_at)
    const previous = record.normal.find(draft => draft.grupo_id === input.grupo_id)
    const draft: CashierV4NormalDraft = { ...input, scope, kind: 'normal', metadata,
      client_observation_id: previous?.client_observation_id ?? this.uuid(), contado_at: previous?.contado_at ?? input.contado_at }
    record.normal = [...record.normal.filter(item => item.grupo_id !== draft.grupo_id), draft]
    this.storage.write(record)
    return structuredClone(draft)
  }
  captureRecount(scope: CashierV4DraftScope, input: CashierV4RecountItem & { grupo_id: string }, metadata?: Record<string, string>): CashierV4RecountDraft {
    const record = this.captureRecord(scope, input.contado_at)
    const previous = record.recount.find(draft => draft.detalle_id === input.detalle_id)
    const draft: CashierV4RecountDraft = { ...input, scope, kind: 'recount', metadata, contado_at: previous?.contado_at ?? input.contado_at }
    record.recount = [...record.recount.filter(item => item.detalle_id !== draft.detalle_id), draft]
    this.storage.write(record)
    return structuredClone(draft)
  }
  private stop(record: CashierV4SessionDrafts, reason: CashierV4FlushStop): CashierV4FlushStop {
    record.issue = { reason, message: reason, terminal: reason === 'session_unavailable' || reason === 'delivery_not_allowed' || reason === 'idempotency_conflict' }
    this.storage.write(record)
    return reason
  }
  private deliveryBlocked(scope: CashierV4DraftScope): CashierV4FlushStop | null {
    if (!getCashierV4SessionCapability(this.store.getSnapshot(), scope.conteo_id)) return 'session_unavailable'
    return canCashierV4DeliverPendingForSession(this.store.getSnapshot(), scope.conteo_id, this.serverNow()) ? null : 'delivery_not_allowed'
  }
  private prepare(record: CashierV4SessionDrafts): CashierV4PreparedOperation | null {
    const items = eligible(record)
    if (!items.normal.length && !items.recount.length) return null
    const common = { operation_id: this.uuid(), conteo_id: record.scope.conteo_id,
      expected_groups_revision: record.scope.groups_revision, status: 'ready' as const, response: null }
    if (items.recount.length) return { ...common, action: 'recount_save_batch', items: items.recount.slice(0, CASHIER_V4_BATCH_LIMIT)
      .map(({ detalle_id, stock_fisico, contado_at }) => ({ detalle_id, stock_fisico, contado_at })) }
    if (items.normal.length) return { ...common, action: 'save_batch', items: items.normal.slice(0, CASHIER_V4_BATCH_LIMIT)
      .map(({ client_observation_id, grupo_id, stock_fisico, contado_at }) => ({ client_observation_id, grupo_id, stock_fisico, contado_at })) }
    return null
  }
  private validateConfirmation(p: CashierV4PreparedOperation, response: CashierV4MutationResult) {
    const invalid = () => { throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE') }
    if (response.conteo_id !== p.conteo_id || response.action !== p.action) invalid()
    if (p.action === 'finish' || response.action === 'start' || response.action === 'finish') return
    if (response.saved !== p.items.length) invalid()
    if (p.action === 'save_batch' && response.action === 'save_batch') {
      for (const item of p.items) {
        const saved = response.items.find(saved => saved.client_observation_id === item.client_observation_id)
        if (!saved || saved.grupo_id !== item.grupo_id || saved.stock_fisico !== item.stock_fisico || Date.parse(saved.contado_at) !== Date.parse(item.contado_at)) invalid()
      }
    } else if (p.action === 'recount_save_batch' && response.action === 'recount_save_batch') {
      for (const item of p.items) {
        const saved = response.items.find(saved => saved.detalle_id === item.detalle_id)
        if (!saved || saved.stock_reconteo !== item.stock_fisico || Date.parse(saved.recontado_at) !== Date.parse(item.contado_at)) invalid()
      }
    } else invalid()
  }
  private async send(record: CashierV4SessionDrafts) {
    const p = record.prepared!
    if (p.status === 'conflict') throw new SologApiError('SOLOG_IDEMPOTENCY_CONFLICT')
    try {
      const fromReceipt = p.response !== null
      let response = p.response
      if (!response) {
        // Strip local status/receipt. The business payload is reproduced verbatim on every retry.
        const base = { operation_id: p.operation_id, device_token: this.store.deviceToken,
          conteo_id: p.conteo_id, expected_groups_revision: p.expected_groups_revision }
        response = p.action === 'finish' ? await mutateCashierV4('finish', base, this.call)
          : p.action === 'save_batch' ? await mutateCashierV4('save_batch', { ...base, items: p.items }, this.call)
          : await mutateCashierV4('recount_save_batch', { ...base, items: p.items }, this.call)
        this.validateConfirmation(p, response)
        p.response = response
        this.storage.write(record) // Receipt before any local adoption/cleanup.
      }
      this.validateConfirmation(p, response)
      // A durable receipt remains confirmation if a refresh has since removed the session.
      // It never supplies future authorization; only known sessions are adopted into the live store.
      const currentCapability = getCashierV4SessionCapability(this.store.getSnapshot(), record.scope.conteo_id)
      if (currentCapability) {
        // Replay/receipt carries a historical capability, not permission to reactivate a recovery.
        const adoption = (fromReceipt || response.replay) &&
          (response.action === 'save_batch' || response.action === 'recount_save_batch')
          ? { ...response, session_capability: currentCapability,
            panel_delta: { ...response.panel_delta, session_capability: currentCapability } }
          : response
        this.store.acceptMutation(adoption)
      }
      if (response.action === 'finish') {
        record.delivery_state = null
        record.finished = true
      } else if (response.action === 'save_batch') {
        const ids = new Set(response.items.map(item => item.client_observation_id))
        record.normal = record.normal.filter(draft => !ids.has(draft.client_observation_id))
        record.delivery_state = deltaDelivery(record.scope, response)
      } else if (response.action === 'recount_save_batch') {
        const ids = new Set(response.items.map(item => item.detalle_id))
        record.recount = record.recount.filter(draft => !ids.has(draft.detalle_id))
        record.delivery_state = deltaDelivery(record.scope, response)
      }
      record.prepared = null
      record.issue = null
      this.storage.write(record)
    } catch (error) {
      // Re-read: never restore already-confirmed drafts or overwrite an adopted durable receipt.
      const current = this.storage.read(record.scope)
      if (current.prepared?.operation_id === p.operation_id) {
        const policy = getCashierV4ErrorPolicy(error)
        current.prepared.status = policy.outcome === 'conflict' ? 'conflict'
          : policy.outcome === 'in_progress' ? 'in_progress'
          : policy.outcome === 'known_rejection' ? 'rejected' : 'uncertain'
        current.issue = { reason: policy.code ?? 'uncertain_response', message: policy.message, terminal: policy.sessionInvalid || current.prepared.status === 'conflict' }
        this.storage.write(current)
      }
      throw error
    }
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (runningStores.has(this.store)) throw new Error('Hay una request en curso.')
    runningStores.add(this.store)
    try { return await work() } finally { runningStores.delete(this.store) }
  }
  flush(scope: CashierV4DraftScope): Promise<CashierV4FlushResult> {
    return this.exclusive(async () => {
      this.assertIdentity(scope)
      let confirmedBatches = 0
      // Finite work budget based on persisted drafts; a confirmation must remove actual drafts.
      const initial = this.synchronize(scope)
      const maxIterations = initial.normal.length + initial.recount.length + 1
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const record = this.storage.read(scope)
        if (record.finished) return { confirmedBatches, reason: 'finished' }
        if (record.prepared?.status === 'conflict') return { confirmedBatches, reason: this.stop(record, 'idempotency_conflict') }
        if (!record.prepared?.response) {
          const blocked = this.deliveryBlocked(scope)
          if (blocked) return { confirmedBatches, reason: this.stop(record, blocked) }
        }
        if (!record.prepared) {
          if (!record.delivery_state) return { confirmedBatches, reason: this.stop(record, 'missing_delivery_state') }
          if (record.delivery_state.next_action === 'none') return { confirmedBatches, reason: 'none' }
          const p = this.prepare(record)
          if (!p) return { confirmedBatches, reason: this.stop(record, 'no_eligible_drafts') }
          record.prepared = p
          this.storage.write(record) // Must succeed before the first network call.
        }
        if (record.prepared.action === 'finish') throw new Error('Reintenta finish explícitamente; flush no finaliza sesiones.')
        const prepared = record.prepared
        await this.send(record)
        confirmedBatches++
        const after = this.storage.read(scope)
        const delivery = after.delivery_state!
        const allQueued = new Set([...delivery.coverage_queue, ...delivery.daily_queue, ...delivery.review_queue.map(item => item.grupo_id)])
        const unchanged = prepared.action === 'save_batch'
          ? prepared.items.some(item => allQueued.has(item.grupo_id))
          : prepared.items.some(item => delivery.review_queue.some(queued => queued.detalle_id === item.detalle_id))
        if (unchanged) return { confirmedBatches, reason: this.stop(after, 'no_progress') }
        // Do not resynchronize with a potentially stale memory snapshot between confirmed deltas.
      }
      return { confirmedBatches, reason: this.stop(this.storage.read(scope), 'iteration_limit') }
    })
  }
  finish(scope: CashierV4DraftScope): Promise<void> {
    return this.exclusive(async () => {
      this.assertIdentity(scope)
      const record = this.synchronize(scope)
      if (record.finished) return
      if (record.prepared && record.prepared.action !== 'finish') throw new Error('Queda una operación de captura preparada.')
      if (!record.prepared?.response) {
        const blocked = this.deliveryBlocked(scope)
        if (blocked) {
          this.stop(record, blocked)
          throw new SologApiError(blocked === 'delivery_not_allowed' ? 'SOLOG_SESSION_DELIVERY_NOT_ALLOWED' : 'SOLOG_SESSION_NOT_FOUND')
        }
      }
      if (!record.prepared) {
        const delivery = record.delivery_state
        const queuedNormal = new Set([...(delivery?.coverage_queue ?? []), ...(delivery?.daily_queue ?? [])])
        const pending = delivery
          ? record.normal.some(draft => queuedNormal.has(draft.grupo_id)) || record.recount.some(draft =>
            delivery.review_queue.some(item => item.detalle_id === draft.detalle_id && item.grupo_id === draft.grupo_id))
          : record.normal.length > 0 || record.recount.length > 0
        if (pending) throw new Error('Quedan drafts entregables o sin autoridad suficiente para resolver.')
        record.prepared = { action: 'finish', operation_id: this.uuid(), conteo_id: scope.conteo_id,
          expected_groups_revision: scope.groups_revision, status: 'ready', response: null }
        this.storage.write(record)
      }
      await this.send(record)
    })
  }
}
