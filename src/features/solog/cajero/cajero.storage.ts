import type {
  CajeroRecountPayload,
  CajeroBatchPayload,
  CajeroBatchRejectedItem,
  CajeroBatchResponse,
  CajeroBuffer,
  CajeroBufferIdentity,
  CajeroBufferScope,
  CajeroExpressionDraftStore,
  CajeroObservationInput,
  CajeroPendingObservation,
} from './cajero.types'
import { isValidPhysicalCount } from './cajero.utils'

export const CAJERO_BATCH_IMMEDIATE_THRESHOLD = 80
export const CAJERO_BACKEND_BATCH_LIMIT = 500

const BUFFER_VERSION = 4
const BUFFER_KEY_PREFIX = 'solog.cajero.buffer.v4'
const EXPRESSION_KEY_PREFIX = 'solog.cajero.expressions.v1'
const RECOUNT_KEY_PREFIX = 'solog.cajero.recount.v1'
const BUFFER_EVENT = 'solog:cajero-buffer-change'
let bufferRevision = 0
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const memory = new Map<string, string>()
const memoryStorage: Storage = {
  get length() { return memory.size },
  key: (index) => [...memory.keys()][index] ?? null,
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value) },
  removeItem: (key) => { memory.delete(key) },
  clear: () => { memory.clear() },
}
function getStorage(storage?: Storage): Storage {
  return storage ?? memoryStorage
}

export function clearCajeroMemory(): void {
  memory.clear()
  bufferRevision += 1
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BUFFER_EVENT))
}

// Retirar solo persistencia operativa anterior; conservar Auth y token de tablet.
export function purgePersistedCajeroData(): void {
  if (typeof window === 'undefined') return
  for (const target of [window.sessionStorage, window.localStorage]) {
    const keys = Array.from({ length: target.length }, (_, index) => target.key(index))
    for (const key of keys) {
      if (key && /^solog\.cajero\.(buffer|expressions|recount|activity)\./.test(key)) target.removeItem(key)
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isCountView(value: unknown): boolean {
  return (
    value === 'conteo' ||
    value === 'categoria' ||
    value === 'stock_cero' ||
    value === 'stock_negativo' ||
    value === 'conteo_diario'
  )
}

function isScope(value: unknown): value is CajeroBufferScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const scope = value as Partial<CajeroBufferScope>
  return (
    isNonEmptyString(scope.usuario_id) &&
    isNonEmptyString(scope.sede_id) &&
    isNonEmptyString(scope.dispositivo_id) &&
    isNonEmptyString(scope.conteo_id)
  )
}

function isSameCajeroBufferIdentity(
  left: CajeroBufferIdentity,
  right: CajeroBufferIdentity,
): boolean {
  return (
    left.usuario_id === right.usuario_id &&
    left.sede_id === right.sede_id &&
    left.dispositivo_id === right.dispositivo_id
  )
}

function isSameCajeroBufferScope(
  left: CajeroBufferScope,
  right: CajeroBufferScope,
): boolean {
  return (
    isSameCajeroBufferIdentity(left, right) &&
    left.conteo_id === right.conteo_id &&
    left.groups_revision === right.groups_revision
  )
}

function isRejectedItem(value: unknown): value is CajeroBatchRejectedItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const error = value as Partial<CajeroBatchRejectedItem>
  return (
    (error.client_observation_id === null ||
      isNonEmptyString(error.client_observation_id)) &&
    (error.grupo_id === null || isNonEmptyString(error.grupo_id)) &&
    isNonEmptyString(error.codigo) &&
    (error.detalle === undefined || error.detalle === null || typeof error.detalle === 'string')
  )
}

function isPendingObservation(value: unknown): value is CajeroPendingObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<CajeroPendingObservation>
  const display = item.display
  if (!display || typeof display !== 'object' || Array.isArray(display)) return false

  return (
    isUuid(item.client_observation_id) &&
    isNonEmptyString(item.conteo_id) &&
    isNonEmptyString(item.grupo_id) &&
    typeof item.stock_fisico === 'number' &&
    isValidPhysicalCount(item.stock_fisico) &&
    isNonEmptyString(item.contado_at) &&
    !Number.isNaN(Date.parse(item.contado_at)) &&
    isCountView(display.vista) &&
    isNullableString(display.categoria_id) &&
    isNonEmptyString(display.grupo) &&
    typeof display.categoria === 'string' &&
    typeof display.stock_teorico === 'number' &&
    Number.isSafeInteger(display.stock_teorico) &&
    typeof display.precio === 'number' &&
    Number.isFinite(display.precio) &&
    (item.error === null || isRejectedItem(item.error))
  )
}

function isBuffer(value: unknown): value is CajeroBuffer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const buffer = value as Partial<CajeroBuffer>
  return (
    buffer.version === BUFFER_VERSION &&
    isScope(buffer.scope) &&
    Array.isArray(buffer.items) &&
    buffer.items.every(
      (item) =>
        isPendingObservation(item) &&
        item.conteo_id === buffer.scope?.conteo_id,
    )
  )
}

function isExpressionDraftStore(
  value: unknown,
): value is CajeroExpressionDraftStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const store = value as Partial<CajeroExpressionDraftStore>
  return (
    store.version === 1 &&
    isScope(store.scope) &&
    Array.isArray(store.items) &&
    store.items.every(
      (item) =>
        Boolean(item) &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        isNonEmptyString(item.grupo_id) &&
        typeof item.expresion === 'string',
    )
  )
}

function scopeSegment(value: string): string {
  return encodeURIComponent(value)
}

export function getCajeroBufferKey(scope: CajeroBufferScope): string {
  return [
    BUFFER_KEY_PREFIX,
    scope.usuario_id,
    scope.sede_id,
    scope.dispositivo_id,
    scope.conteo_id,
    ...(scope.groups_revision === undefined ? [] : [String(scope.groups_revision)]),
  ]
    .map(scopeSegment)
    .join(':')
}

function getCajeroExpressionDraftKey(
  scope: CajeroBufferScope,
): string {
  return [
    EXPRESSION_KEY_PREFIX,
    scope.usuario_id,
    scope.sede_id,
    scope.dispositivo_id,
    scope.conteo_id,
    ...(scope.groups_revision === undefined ? [] : [String(scope.groups_revision)]),
  ]
    .map(scopeSegment)
    .join(':')
}

function emitBufferChange(scope: CajeroBufferScope): void {
  bufferRevision += 1
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(BUFFER_EVENT, {
      detail: { key: getCajeroBufferKey(scope) },
    }),
  )
}

export function readCajeroBuffer(
  scope: CajeroBufferScope,
  storage?: Storage,
): CajeroBuffer {
  const target = getStorage(storage)
  const empty: CajeroBuffer = { version: BUFFER_VERSION, scope, items: [] }

  try {
    const raw = target.getItem(getCajeroBufferKey(scope))
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (!isBuffer(parsed) || !isSameCajeroBufferScope(parsed.scope, scope)) {
      return empty
    }
    return parsed
  } catch {
    return empty
  }
}

export function readCajeroBuffersForIdentity(
  identity: CajeroBufferIdentity,
  storage?: Storage,
): CajeroBuffer[] {
  const target = getStorage(storage)
  const buffers: CajeroBuffer[] = []

  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (!key?.startsWith(`${BUFFER_KEY_PREFIX}:`)) continue

    try {
      const raw = target.getItem(key)
      if (!raw) continue
      const parsed: unknown = JSON.parse(raw)
      if (
        isBuffer(parsed) &&
        isSameCajeroBufferIdentity(parsed.scope, identity) &&
        parsed.items.length > 0
      ) {
        buffers.push(parsed)
      }
    } catch {
      // Un buffer corrupto no se reutiliza ni afecta otras sesiones.
    }
  }

  return buffers.sort((left, right) =>
    left.scope.conteo_id.localeCompare(right.scope.conteo_id),
  )
}
export function getCajeroPendingCountForIdentity(
  identity: CajeroBufferIdentity,
  storage?: Storage,
): number {
  return readCajeroBuffersForIdentity(identity, storage).reduce(
    (total, buffer) => total + buffer.items.length,
    0,
  )
}

export function writeCajeroBuffer(
  buffer: CajeroBuffer,
  storage?: Storage,
): void {
  if (!isBuffer(buffer)) {
    throw new Error('El buffer local de Cajero no es válido.')
  }

  const target = getStorage(storage)
  const key = getCajeroBufferKey(buffer.scope)
  if (buffer.items.length === 0) {
    target.removeItem(key)
  } else {
    target.setItem(key, JSON.stringify(buffer))
  }
  emitBufferChange(buffer.scope)
}

export function readCajeroExpressionDrafts(
  scope: CajeroBufferScope,
  storage?: Storage,
): CajeroExpressionDraftStore {
  const empty: CajeroExpressionDraftStore = { version: 1, scope, items: [] }

  try {
    const raw = getStorage(storage).getItem(getCajeroExpressionDraftKey(scope))
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (
      !isExpressionDraftStore(parsed) ||
      !isSameCajeroBufferScope(parsed.scope, scope)
    ) {
      return empty
    }
    return parsed
  } catch {
    return empty
  }
}

function writeCajeroExpressionDrafts(
  store: CajeroExpressionDraftStore,
  storage?: Storage,
): void {
  if (!isExpressionDraftStore(store)) {
    throw new Error('Los borradores de calculadora no son válidos.')
  }

  const target = getStorage(storage)
  const key = getCajeroExpressionDraftKey(store.scope)
  if (store.items.length === 0) target.removeItem(key)
  else target.setItem(key, JSON.stringify(store))
  emitBufferChange(store.scope)
}

export function setCajeroExpressionDraft(
  scope: CajeroBufferScope,
  grupoId: string,
  expression: string,
  storage?: Storage,
): void {
  if (!isNonEmptyString(grupoId)) {
    throw new Error('El grupo del borrador no es válido.')
  }

  const current = readCajeroExpressionDrafts(scope, storage)
  const items = current.items.filter((item) => item.grupo_id !== grupoId)
  items.push({ grupo_id: grupoId, expresion: expression })
  writeCajeroExpressionDrafts({ ...current, items }, storage)
}

export function removeCajeroExpressionDrafts(
  scope: CajeroBufferScope,
  grupoIds: readonly string[],
  storage?: Storage,
): void {
  if (grupoIds.length === 0) return
  const ids = new Set(grupoIds)
  const current = readCajeroExpressionDrafts(scope, storage)
  const items = current.items.filter((item) => !ids.has(item.grupo_id))
  if (items.length !== current.items.length) {
    writeCajeroExpressionDrafts({ ...current, items }, storage)
  }
}

function validateObservationInput(input: CajeroObservationInput): void {
  if (
    !isNonEmptyString(input.grupo_id) ||
    !isValidPhysicalCount(input.stock_fisico) ||
    !isNonEmptyString(input.contado_at) ||
    Number.isNaN(Date.parse(input.contado_at)) ||
    !isCountView(input.display.vista)
  ) {
    throw new Error('La observación local no es válida. Los reconteos no pertenecen al batch normal.')
  }
}

export function upsertCajeroObservation(
  scope: CajeroBufferScope,
  input: CajeroObservationInput,
  storage?: Storage,
): CajeroPendingObservation {
  validateObservationInput(input)
  const current = readCajeroBuffer(scope, storage)
  const existing = current.items.find((item) => item.grupo_id === input.grupo_id)
  const observation: CajeroPendingObservation = {
    client_observation_id: existing?.client_observation_id ?? crypto.randomUUID(),
    conteo_id: scope.conteo_id,
    grupo_id: input.grupo_id,
    stock_fisico: input.stock_fisico,
    contado_at: existing?.contado_at ?? input.contado_at,
    display: input.display,
    error: null,
  }
  const items = existing
    ? current.items.map((item) =>
        item.client_observation_id === existing.client_observation_id
          ? observation
          : item,
      )
    : [...current.items, observation]
  writeCajeroBuffer({ ...current, items }, storage)
  return observation
}

export function saveCajeroLocalCapture(
  scope: CajeroBufferScope,
  input: CajeroObservationInput,
  expression: string,
  storage?: Storage,
): CajeroPendingObservation {
  setCajeroExpressionDraft(scope, input.grupo_id, expression, storage)
  return upsertCajeroObservation(scope, input, storage)
}

export function removeCajeroObservation(
  scope: CajeroBufferScope,
  grupoId: string,
  storage?: Storage,
): void {
  const current = readCajeroBuffer(scope, storage)
  const items = current.items.filter((item) => item.grupo_id !== grupoId)
  if (items.length !== current.items.length) {
    writeCajeroBuffer({ ...current, items }, storage)
  }
}

export function shouldFlushCajeroBufferImmediately(itemCount: number): boolean {
  return itemCount >= CAJERO_BATCH_IMMEDIATE_THRESHOLD
}

export function buildNextCajeroBatch(
  scope: CajeroBufferScope,
  deviceToken: string,
  storage?: Storage,
): CajeroBatchPayload | null {
  const buffer = readCajeroBuffer(scope, storage)
  if (buffer.items.length === 0) return null

  return {
    device_token: deviceToken,
    conteo_id: scope.conteo_id,
    items: buffer.items
      .slice(0, CAJERO_BACKEND_BATCH_LIMIT)
      .map(
        ({
          client_observation_id,
          grupo_id,
          stock_fisico,
          contado_at,
        }) => ({
          client_observation_id,
          grupo_id,
          stock_fisico,
          contado_at,
        }),
      ),
  }
}

export interface CajeroBatchApplication {
  confirmedIds: string[]
  rejectedIds: string[]
  unassociatedErrors: CajeroBatchRejectedItem[]
  remaining: CajeroBuffer
}

export function applyCajeroBatchResponse(
  scope: CajeroBufferScope,
  response: CajeroBatchResponse,
  storage?: Storage,
): CajeroBatchApplication {
  if (response.conteo_id !== scope.conteo_id) {
    throw new Error('La respuesta del lote pertenece a otra sesión.')
  }

  const current = readCajeroBuffer(scope, storage)
  const confirmedIds = new Set(
    response.items.map((item) => item.client_observation_id),
  )
  const errorsById = new Map(
    response.errores
      .filter(
        (
          error,
        ): error is CajeroBatchRejectedItem & {
          client_observation_id: string
        } => isNonEmptyString(error.client_observation_id),
      )
      .map((error) => [error.client_observation_id, error]),
  )
  const unassociatedErrors = response.errores.filter(
    (error) => !isNonEmptyString(error.client_observation_id),
  )
  const confirmedGroupIds = current.items
    .filter((item) => confirmedIds.has(item.client_observation_id))
    .map((item) => item.grupo_id)

  const items = current.items
    .filter((item) => !confirmedIds.has(item.client_observation_id))
    .map((item) => ({
      ...item,
      error: errorsById.get(item.client_observation_id) ?? item.error,
    }))
  const remaining: CajeroBuffer = { ...current, items }
  writeCajeroBuffer(remaining, storage)
  removeCajeroExpressionDrafts(scope, confirmedGroupIds, storage)

  return {
    confirmedIds: [...confirmedIds],
    rejectedIds: [...errorsById.keys()],
    unassociatedErrors,
    remaining,
  }
}

export function getCajeroBufferRevision(): number {
  return bufferRevision
}

export function subscribeCajeroBufferChanges(
  listener: () => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(BUFFER_EVENT, listener)
  return () => window.removeEventListener(BUFFER_EVENT, listener)
}

export function clearCajeroBuffer(scope: CajeroBufferScope, storage?: Storage): void {
  writeCajeroBuffer({ version: BUFFER_VERSION, scope, items: [] }, storage)
  getStorage(storage).removeItem(getCajeroExpressionDraftKey(scope))
}

// Solo versiones incompatibles de Cajero; nunca descartar pendientes V4.
export function discardLegacyCajeroBuffers(storage?: Storage): void {
  const target = getStorage(storage)
  const keys: string[] = []
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key && /^solog\.cajero\.buffer\.v[123]:/.test(key)) keys.push(key)
  }
  keys.forEach((key) => target.removeItem(key))
}

function getRecountDraftKey(scope: CajeroBufferScope, detalleId: string): string {
  return [
    RECOUNT_KEY_PREFIX,
    scope.usuario_id,
    scope.sede_id,
    scope.dispositivo_id,
    scope.conteo_id,
    ...(scope.groups_revision === undefined ? [] : [String(scope.groups_revision)]),
    detalleId,
  ].map(scopeSegment).join(':')
}

export interface CajeroStoredRecountAttempt {
  scope: CajeroBufferScope
  detalle_id: string
  payload: Omit<CajeroRecountPayload, 'device_token'>
}

export function readCajeroRecountAttemptsForIdentity(
  identity: CajeroBufferIdentity,
  storage?: Storage,
): CajeroStoredRecountAttempt[] {
  const target = getStorage(storage)
  const attempts: CajeroStoredRecountAttempt[] = []

  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (!key?.startsWith(`${RECOUNT_KEY_PREFIX}:`)) continue
    const segments = key.split(':').map((segment) => decodeURIComponent(segment))
    if (segments.length !== 6) continue
    const [, usuarioId, sedeId, dispositivoId, conteoId, detalleId] = segments
    if (
      usuarioId !== identity.usuario_id ||
      sedeId !== identity.sede_id ||
      dispositivoId !== identity.dispositivo_id ||
      !conteoId ||
      !detalleId
    ) continue
    const scope: CajeroBufferScope = {
      ...identity,
      conteo_id: conteoId,
    }
    const payload = readCajeroRecountAttempt(scope, detalleId, target)
    if (payload) attempts.push({ scope, detalle_id: detalleId, payload })
  }

  return attempts
}

export function removeCajeroRecountAttemptsForScope(
  scope: CajeroBufferScope,
  storage?: Storage,
): void {
  const target = getStorage(storage)
  const prefix = [
    RECOUNT_KEY_PREFIX,
    scope.usuario_id,
    scope.sede_id,
    scope.dispositivo_id,
    scope.conteo_id,
  ].map(scopeSegment).join(':') + ':'
  const keys: string[] = []
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  keys.forEach((key) => target.removeItem(key))
}

export function readCajeroRecountAttempt(
  scope: CajeroBufferScope, detalleId: string, storage?: Storage,
): Omit<CajeroRecountPayload, 'device_token'> | null {
  const raw = getStorage(storage).getItem(getRecountDraftKey(scope, detalleId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<CajeroRecountPayload>
    return value.conteo_id === scope.conteo_id && value.detalle_id === detalleId &&
      typeof value.stock_fisico === 'number' && isValidPhysicalCount(value.stock_fisico) &&
      typeof value.contado_at === 'string' && !Number.isNaN(Date.parse(value.contado_at))
      ? { conteo_id: value.conteo_id, detalle_id: detalleId, stock_fisico: value.stock_fisico, contado_at: value.contado_at }
      : null
  } catch { return null }
}

export function saveCajeroRecountAttempt(
  scope: CajeroBufferScope, detalleId: string, physical: number, timestamp: string, storage?: Storage,
): Omit<CajeroRecountPayload, 'device_token'> {
  const existing = readCajeroRecountAttempt(scope, detalleId, storage)
  if (existing) return existing
  if (!isValidPhysicalCount(physical) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error('La captura de reconteo no es válida.')
  }
  const value = { conteo_id: scope.conteo_id, detalle_id: detalleId, stock_fisico: physical, contado_at: timestamp }
  getStorage(storage).setItem(getRecountDraftKey(scope, detalleId), JSON.stringify(value))
  return value
}

export function removeCajeroRecountAttempt(scope: CajeroBufferScope, detalleId: string, storage?: Storage): void {
  getStorage(storage).removeItem(getRecountDraftKey(scope, detalleId))
  removeCajeroExpressionDrafts(scope, ['recount:' + detalleId], storage)
}
