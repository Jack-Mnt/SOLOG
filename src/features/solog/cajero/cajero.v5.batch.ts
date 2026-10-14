import type {
  CashierV4Action, CashierV5CountItem, CashierV5RecountItem, CashierV5MutationResult,
} from './cajero.v4'
import { parseCashierV5Mutation } from './cajero.v4.api'
import {
  validCashierInitialObservation, validCashierRecountObservation,
} from './cajero.observaciones.v5'

// Formato único de operaciones nuevas. No migra ni reinterpreta operaciones de Cajero V4.
// Su integración al almacenamiento operativo corresponde a la activación de Fase 3.
export type CashierV5BatchAction = Extract<CashierV4Action, 'save_batch' | 'recount_save_batch'>
type PreparedBase = {
  protocol_version: 5
  operation_id: string
  conteo_id: string
  expected_groups_revision: number
  status: 'ready' | 'uncertain' | 'in_progress' | 'conflict' | 'rejected'
  response: CashierV5MutationResult | null
}
export type CashierV5PreparedBatch = PreparedBase & (
  | { action: 'save_batch'; items: CashierV5CountItem[] }
  | { action: 'recount_save_batch'; items: CashierV5RecountItem[] }
)

const uuid = (value: unknown) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const timestamp = (value: unknown) => typeof value === 'string' &&
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
function check(ok: unknown): asserts ok {
  if (!ok) throw new Error('La operación V5 almacenada es inválida. No se modificaron sus datos.')
}
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  check(Object.keys(value).sort().join(',') === keys.sort().join(','))
}
function validateItem(value: unknown, action: CashierV5BatchAction) {
  const v = object(value)
  const count = action === 'save_batch'
  exactKeys(v, count
    ? ['client_observation_id', 'grupo_id', 'stock_fisico', 'contado_at', 'motivo_diferencia', 'observacion_diferencia']
    : ['detalle_id', 'stock_fisico', 'contado_at', 'motivo_diferencia', 'observacion_reconteo'])
  check(uuid(v[count ? 'client_observation_id' : 'detalle_id']))
  if (count) check(uuid(v.grupo_id))
  check(Number.isSafeInteger(v.stock_fisico) && Number(v.stock_fisico) >= 0)
  check(timestamp(v.contado_at))
  check(count ? validCashierInitialObservation(v) : validCashierRecountObservation(v))
}
export function validateCashierV5PreparedBatch(value: unknown): CashierV5PreparedBatch {
  const v = object(value)
  check(v.protocol_version === 5 && (v.action === 'save_batch' || v.action === 'recount_save_batch'))
  exactKeys(v, ['protocol_version', 'operation_id', 'conteo_id', 'expected_groups_revision',
    'status', 'response', 'action', 'items'])
  check(uuid(v.operation_id) && uuid(v.conteo_id))
  check(Number.isSafeInteger(v.expected_groups_revision) && Number(v.expected_groups_revision) >= 0)
  check(['ready', 'uncertain', 'in_progress', 'conflict', 'rejected'].includes(String(v.status)))
  check(Array.isArray(v.items) && v.items.length > 0 && v.items.length <= 500)
  const ids = new Set<string>()
  const groups = new Set<string>()
  for (const item of v.items) {
    validateItem(item, v.action)
    const i = item as Record<string, unknown>
    const id = String(v.action === 'save_batch' ? i.client_observation_id : i.detalle_id)
    check(!ids.has(id)); ids.add(id)
    if (v.action === 'save_batch') {
      const group = String(i.grupo_id)
      check(!groups.has(group)); groups.add(group)
    }
  }
  if (v.response !== null) {
    const result = parseCashierV5Mutation(v.response, v.action)
    check(result.conteo_id === v.conteo_id && result.saved === v.items.length)
  }
  return value as CashierV5PreparedBatch
}
export function prepareCashierV5Batch<A extends CashierV5BatchAction>(
  action: A,
  items: A extends 'save_batch' ? CashierV5CountItem[] : CashierV5RecountItem[],
  scope: { operation_id: string; conteo_id: string; expected_groups_revision: number },
): CashierV5PreparedBatch {
  const prepared = { ...scope, protocol_version: 5 as const, action, items: structuredClone(items),
    status: 'ready' as const, response: null }
  return validateCashierV5PreparedBatch(prepared)
}
export function serializeCashierV5PreparedBatch(prepared: CashierV5PreparedBatch): string {
  validateCashierV5PreparedBatch(prepared)
  return JSON.stringify(prepared)
}
export function deserializeCashierV5PreparedBatch(raw: string): CashierV5PreparedBatch {
  return validateCashierV5PreparedBatch(JSON.parse(raw))
}
export function assertSameCashierV5Operation(
  original: CashierV5PreparedBatch, updated: CashierV5PreparedBatch,
) {
  validateCashierV5PreparedBatch(original)
  validateCashierV5PreparedBatch(updated)
  const business = (p: CashierV5PreparedBatch) => JSON.stringify({
    protocol_version: p.protocol_version, operation_id: p.operation_id,
    conteo_id: p.conteo_id, expected_groups_revision: p.expected_groups_revision,
    action: p.action, items: p.items,
  })
  check(business(original) === business(updated))
}


export const CASHIER_V5_PREPARED_STORAGE_PREFIX = 'solog.cashier-v5.prepared.v1:'

export interface CashierV5PreparedStoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Recibos y payloads preparados de V5. La escritura es atómica para cada operación.
 * No convierte ni reinterpreta claves de storage de otras versiones.
 */
export class CashierV5PreparedStorage {
  constructor(private readonly port: CashierV5PreparedStoragePort) {}

  private key(scope: { usuario_id: string; sede_id: string; dispositivo_id: string; conteo_id: string }) {
    check(uuid(scope.usuario_id) && uuid(scope.sede_id) && uuid(scope.dispositivo_id) && uuid(scope.conteo_id))
    return CASHIER_V5_PREPARED_STORAGE_PREFIX +
      [scope.usuario_id, scope.sede_id, scope.dispositivo_id, scope.conteo_id].map(encodeURIComponent).join(':')
  }

  read(scope: { usuario_id: string; sede_id: string; dispositivo_id: string; conteo_id: string }) {
    const raw = this.port.getItem(this.key(scope))
    return raw === null ? null : deserializeCashierV5PreparedBatch(raw)
  }

  write(
    scope: { usuario_id: string; sede_id: string; dispositivo_id: string; conteo_id: string },
    prepared: CashierV5PreparedBatch,
  ) {
    check(prepared.conteo_id === scope.conteo_id)
    const previous = this.read(scope)
    if (previous) {
      assertSameCashierV5Operation(previous, prepared)
      // No se puede reemplazar un recibo confirmado por uno nulo durante recuperación.
      if (previous.response !== null) check(prepared.response !== null)
    }
    this.port.setItem(this.key(scope), serializeCashierV5PreparedBatch(prepared))
  }

  clearConfirmed(
    scope: { usuario_id: string; sede_id: string; dispositivo_id: string; conteo_id: string },
    operationId: string,
  ) {
    const previous = this.read(scope)
    check(previous !== null && previous.operation_id === operationId && previous.response !== null)
    this.port.removeItem(this.key(scope))
  }
}
