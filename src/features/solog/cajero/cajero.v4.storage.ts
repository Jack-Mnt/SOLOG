import type { CashierV4CountItem, CashierV4RecountItem, CashierV4MutationResult } from './cajero.v4'
import type { CashierV4DeliveryState } from './cajero.v4.store'
import { parseCashierV4Mutation, validateCashierV4PanelDelta } from './cajero.v4.api'

// Separate from V3's buffer/recount namespaces and startup purge. No implicit migration or deletion.
export const CASHIER_V4_STORAGE_PREFIX = 'solog.cashier-v4.session.v1:'
export const CASHIER_V4_BATCH_LIMIT = 500
export const CASHIER_V4_START_STORAGE_PREFIX = 'solog.cashier-v4.start.v1:'
export type CashierV4StartIdentity = Pick<CashierV4DraftScope, 'usuario_id' | 'sede_id' | 'dispositivo_id'>
export interface CashierV4PreparedStart {
  version: 1
  identity: CashierV4StartIdentity
  prepared_start: { operation_id: string; status: 'ready' | 'uncertain' | 'in_progress' | 'conflict' }
}
export interface CashierV4DraftScope {
  usuario_id: string
  sede_id: string
  dispositivo_id: string
  conteo_id: string
  groups_revision: number
}
export interface CashierV4NormalDraft extends CashierV4CountItem {
  kind: 'normal'
  scope: CashierV4DraftScope
  metadata?: Record<string, string>
}
export interface CashierV4RecountDraft extends CashierV4RecountItem {
  kind: 'recount'
  grupo_id: string
  scope: CashierV4DraftScope
  metadata?: Record<string, string>
}
interface PreparedBase {
  operation_id: string
  conteo_id: string
  expected_groups_revision: number
  status: 'ready' | 'uncertain' | 'in_progress' | 'conflict' | 'rejected'
  // Durable receipt allows local confirmation to resume after a storage/store failure.
  response: CashierV4MutationResult | null
}
export type CashierV4PreparedOperation = PreparedBase & (
  | { action: 'save_batch'; items: CashierV4CountItem[] }
  | { action: 'recount_save_batch'; items: CashierV4RecountItem[] }
  | { action: 'finish' }
)
export interface CashierV4SessionDrafts {
  version: 1
  scope: CashierV4DraftScope
  normal: CashierV4NormalDraft[]
  recount: CashierV4RecountDraft[]
  delivery_state: CashierV4DeliveryState | null
  prepared: CashierV4PreparedOperation | null
  issue: { reason: string; message: string; terminal: boolean } | null
  finished: boolean
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('La persistencia Cajero V4 es inválida. Se conserva para revisión.')
}
function object(value: unknown): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function uuid(value: unknown) { check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) }
function revision(value: unknown) { check(Number.isSafeInteger(value) && Number(value) >= 0) }
function observation(value: unknown, normal: boolean) {
  const item = object(value)
  uuid(normal ? item.client_observation_id : item.detalle_id)
  if (normal) uuid(item.grupo_id)
  check(typeof item.stock_fisico === 'number' && Number.isFinite(item.stock_fisico) && item.stock_fisico >= 0)
  check(typeof item.contado_at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(item.contado_at) && Number.isFinite(Date.parse(item.contado_at)))
  if (item.metadata !== undefined) check(Object.values(object(item.metadata)).every(value => typeof value === 'string'))
}
function unique(values: unknown[]) { check(new Set(values).size === values.length) }

export function cashierV4StartStorageKey(identity: CashierV4StartIdentity) {
  for (const key of ['usuario_id', 'sede_id', 'dispositivo_id'] as const) uuid(identity[key])
  return CASHIER_V4_START_STORAGE_PREFIX + [identity.usuario_id, identity.sede_id, identity.dispositivo_id].map(encodeURIComponent).join(':')
}
function validatePreparedStart(value: unknown): CashierV4PreparedStart {
  const r = object(value), identity = object(r.identity), p = object(r.prepared_start)
  check(r.version === 1 && Object.keys(r).sort().join(',') === 'identity,prepared_start,version')
  check(Object.keys(identity).sort().join(',') === 'dispositivo_id,sede_id,usuario_id')
  cashierV4StartStorageKey(identity as unknown as CashierV4StartIdentity)
  check(Object.keys(p).sort().join(',') === 'operation_id,status')
  uuid(p.operation_id); check(['ready', 'uncertain', 'in_progress', 'conflict'].includes(String(p.status)))
  return value as CashierV4PreparedStart
}

export function validateCashierV4DraftScope(value: unknown): CashierV4DraftScope {
  const s = object(value)
  for (const key of ['usuario_id', 'sede_id', 'dispositivo_id', 'conteo_id']) uuid(s[key])
  revision(s.groups_revision)
  return value as CashierV4DraftScope
}
export function cashierV4DraftStorageKey(scope: CashierV4DraftScope) {
  validateCashierV4DraftScope(scope)
  return CASHIER_V4_STORAGE_PREFIX + [scope.usuario_id, scope.sede_id, scope.dispositivo_id, scope.conteo_id, scope.groups_revision]
    .map(value => encodeURIComponent(String(value))).join(':')
}
export function emptyCashierV4SessionDrafts(scope: CashierV4DraftScope): CashierV4SessionDrafts {
  validateCashierV4DraftScope(scope)
  return { version: 1, scope, normal: [], recount: [], delivery_state: null, prepared: null, issue: null, finished: false }
}

export function validateCashierV4SessionDrafts(value: unknown): CashierV4SessionDrafts {
  const record = object(value)
  check(record.version === 1 && typeof record.finished === 'boolean')
  const scope = validateCashierV4DraftScope(record.scope)
  for (const kind of ['normal', 'recount'] as const) {
    const items = record[kind]
    check(Array.isArray(items))
    for (const value of items) {
      const item = object(value)
      check(item.kind === kind)
      check(cashierV4DraftStorageKey(validateCashierV4DraftScope(item.scope)) === cashierV4DraftStorageKey(scope))
      observation(item, kind === 'normal'); uuid(item.grupo_id)
    }
    unique(items.map(value => object(value)[kind === 'normal' ? 'client_observation_id' : 'detalle_id']))
    unique(items.map(value => object(value).grupo_id))
  }
  if (record.delivery_state !== null) {
    const delivery = object(record.delivery_state)
    check(delivery.conteo_id === scope.conteo_id && delivery.groups_revision === scope.groups_revision)
    check(Object.keys(delivery).sort().join(',') === 'conteo_id,coverage_queue,daily_queue,groups_revision,kpis,next_action,review_queue')
    // Validate operational fields using the existing backend validator, without retaining capability.
    validateCashierV4PanelDelta({ ...delivery, groups_patch: [], session_capability: {
      mode: 'none', estado: null, capture_allowed: false, pending_delivery_allowed: false,
      iniciado_at: null, expira_at: null, recovery_until: null, finalizado_at: null,
    } })
  }
  if (record.prepared !== null) {
    const p = object(record.prepared)
    uuid(p.operation_id)
    check(p.conteo_id === scope.conteo_id && p.expected_groups_revision === scope.groups_revision)
    check(['ready', 'uncertain', 'in_progress', 'conflict', 'rejected'].includes(String(p.status)))
    check(!('device_token' in p))
    check(['save_batch', 'recount_save_batch', 'finish'].includes(String(p.action)))
    if (p.action === 'finish') check(!('items' in p))
    else {
      check(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= CASHIER_V4_BATCH_LIMIT)
      p.items.forEach(item => {
        observation(item, p.action === 'save_batch')
        check(Object.keys(object(item)).sort().join(',') === (p.action === 'save_batch'
          ? 'client_observation_id,contado_at,grupo_id,stock_fisico' : 'contado_at,detalle_id,stock_fisico'))
      })
      unique(p.items.map(value => object(value)[p.action === 'save_batch' ? 'client_observation_id' : 'detalle_id']))
      if (p.action === 'save_batch') unique(p.items.map(value => object(value).grupo_id))
    }
    if (p.response !== null) {
      const response = parseCashierV4Mutation(p.response, p.action as CashierV4PreparedOperation['action'])
      check(response.conteo_id === scope.conteo_id)
    }
  }
  if (record.issue !== null) {
    const issue = object(record.issue)
    check(typeof issue.reason === 'string' && typeof issue.message === 'string' && typeof issue.terminal === 'boolean')
  }
  return value as CashierV4SessionDrafts
}

// Storage is required. Browser consumers opt into localStorage; unavailable/quota errors are never swallowed.
export class CashierV4DraftStorage {
  constructor(private readonly storage: Storage) {}
  readStart(identity: CashierV4StartIdentity): CashierV4PreparedStart | null {
    const key = cashierV4StartStorageKey(identity), raw = this.storage.getItem(key)
    if (raw === null) return null
    const record = validatePreparedStart(JSON.parse(raw))
    check(cashierV4StartStorageKey(record.identity) === key)
    return record
  }
  writeStart(record: CashierV4PreparedStart) {
    validatePreparedStart(record)
    const previous = this.readStart(record.identity)
    if (previous) {
      check(previous.prepared_start.operation_id === record.prepared_start.operation_id)
      if (previous.prepared_start.status === 'conflict') check(record.prepared_start.status === 'conflict')
    }
    this.storage.setItem(cashierV4StartStorageKey(record.identity), JSON.stringify(record))
  }
  confirmStart(identity: CashierV4StartIdentity, operationId: string, response: CashierV4MutationResult) {
    const parsed = parseCashierV4Mutation(response, 'start'), previous = this.readStart(identity)
    check(previous?.prepared_start.operation_id === operationId && parsed.panel_state.session.usuario_id === identity.usuario_id &&
      parsed.panel_state.session.sede_id === identity.sede_id)
    this.storage.removeItem(cashierV4StartStorageKey(identity))
  }
  read(scope: CashierV4DraftScope): CashierV4SessionDrafts {
    const raw = this.storage.getItem(cashierV4DraftStorageKey(scope))
    if (raw === null) return emptyCashierV4SessionDrafts(scope)
    const record = validateCashierV4SessionDrafts(JSON.parse(raw))
    check(cashierV4DraftStorageKey(record.scope) === cashierV4DraftStorageKey(scope))
    return record
  }
  write(record: CashierV4SessionDrafts) {
    validateCashierV4SessionDrafts(record)
    const key = cashierV4DraftStorageKey(record.scope)
    const raw = this.storage.getItem(key)
    if (raw !== null) {
      const existing = validateCashierV4SessionDrafts(JSON.parse(raw))
      if (existing.prepared && !record.prepared) check(existing.prepared.response !== null)
      if (existing.prepared && record.prepared) {
        const business = (p: CashierV4PreparedOperation) => JSON.stringify({
          action: p.action, operation_id: p.operation_id, conteo_id: p.conteo_id,
          expected_groups_revision: p.expected_groups_revision, ...('items' in p ? { items: p.items } : {}),
        })
        check(business(existing.prepared) === business(record.prepared))
      }
    }
    // One atomic envelope write covers drafts, prepared operation and confirmation together.
    this.storage.setItem(key, JSON.stringify(record))
  }
  sessions(identity: Pick<CashierV4DraftScope, 'usuario_id' | 'sede_id' | 'dispositivo_id'>): CashierV4SessionDrafts[] {
    const prefix = CASHIER_V4_STORAGE_PREFIX + [identity.usuario_id, identity.sede_id, identity.dispositivo_id]
      .map(encodeURIComponent).join(':') + ':'
    const result: CashierV4SessionDrafts[] = []
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index)
      if (!key?.startsWith(prefix)) continue
      const raw = this.storage.getItem(key)
      if (raw === null) continue
      const record = validateCashierV4SessionDrafts(JSON.parse(raw))
      check(cashierV4DraftStorageKey(record.scope) === key)
      result.push(record)
    }
    return result
  }
  discardForSafeFinish(scope: CashierV4DraftScope) {
    const record = this.read(scope)
    check(!record.finished)
    if (record.prepared) {
      check(record.prepared.status === 'rejected' && record.prepared.response === null)
    }
    record.normal = []
    record.recount = []
    record.prepared = null
    record.issue = null
    validateCashierV4SessionDrafts(record)
    // Explicit destructive path: bypass write()'s normal prepared-operation preservation guard.
    this.storage.setItem(cashierV4DraftStorageKey(scope), JSON.stringify(record))
  }
  cleanupConfirmedTerminal(scope: CashierV4DraftScope) {
    const record = this.read(scope)
    check(record.finished)
    if (record.prepared) {
      check(record.prepared.status === 'rejected' && record.prepared.response === null)
    }
    record.normal = []
    record.recount = []
    record.prepared = null
    record.delivery_state = null
    record.issue = null
    record.finished = true
    validateCashierV4SessionDrafts(record)
    this.storage.setItem(cashierV4DraftStorageKey(scope), JSON.stringify(record))
  }
  hasPending(identity: Pick<CashierV4DraftScope, 'usuario_id' | 'sede_id' | 'dispositivo_id'>, conteoId: string) {
    return this.sessions(identity).some(record => record.scope.conteo_id === conteoId &&
      (record.normal.length > 0 || record.recount.length > 0 || record.prepared !== null))
  }
}
