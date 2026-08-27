import type {
  CajeroBatchPayload,
  CajeroBatchRejectedItem,
  CajeroBatchResponse,
  CajeroBuffer,
  CajeroBufferIdentity,
  CajeroBufferScope,
  CajeroObservationInput,
  CajeroObservationType,
  CajeroPendingObservation,
} from './cajero.types'
import { isValidPhysicalCount } from './cajero.utils'

export const CAJERO_BATCH_EXIT_THRESHOLD = 40
export const CAJERO_BATCH_IMMEDIATE_THRESHOLD = 80
export const CAJERO_BACKEND_BATCH_LIMIT = 500

const BUFFER_VERSION = 3
const BUFFER_KEY_PREFIX = 'solog.cajero.buffer.v3'
const BUFFER_EVENT = 'solog:cajero-buffer-change'
let bufferRevision = 0
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getStorage(storage?: Storage): Storage {
  if (storage) return storage
  if (typeof window === 'undefined') {
    throw new Error('sessionStorage no está disponible en este entorno.')
  }
  return window.sessionStorage
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

function isObservationType(value: unknown): value is CajeroObservationType {
  return (
    value === 'auto' ||
    value === 'base' ||
    value === 'seguimiento' ||
    value === 'reconteo'
  )
}

function isCountView(value: unknown): boolean {
  return (
    value === 'categoria' ||
    value === 'stock_cero' ||
    value === 'stock_negativo' ||
    value === 'conteo_diario' ||
    value === 'revisar' ||
    value === 'seguimiento'
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

export function isSameCajeroBufferIdentity(
  left: CajeroBufferIdentity,
  right: CajeroBufferIdentity,
): boolean {
  return (
    left.usuario_id === right.usuario_id &&
    left.sede_id === right.sede_id &&
    left.dispositivo_id === right.dispositivo_id
  )
}

export function isSameCajeroBufferScope(
  left: CajeroBufferScope,
  right: CajeroBufferScope,
): boolean {
  return (
    isSameCajeroBufferIdentity(left, right) &&
    left.conteo_id === right.conteo_id
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
    (error.detalle === undefined || typeof error.detalle === 'string')
  )
}

function isPendingObservation(value: unknown): value is CajeroPendingObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<CajeroPendingObservation>
  const display = item.display
  if (!display || typeof display !== 'object' || Array.isArray(display)) return false

  const validOrigin =
    item.tipo_observacion === 'reconteo'
      ? isUuid(item.observacion_origen_id)
      : item.observacion_origen_id === null
  const reviewView =
    display.vista === 'revisar' ||
    (display.vista as string) === 'seguimiento'
  const validViewType = reviewView
    ? item.tipo_observacion !== 'base' && item.tipo_observacion !== 'auto'
    : item.tipo_observacion === 'auto'

  return (
    isUuid(item.client_observation_id) &&
    isNonEmptyString(item.conteo_id) &&
    isNonEmptyString(item.grupo_id) &&
    typeof item.stock_fisico === 'number' &&
    isValidPhysicalCount(item.stock_fisico) &&
    isNonEmptyString(item.contado_at) &&
    !Number.isNaN(Date.parse(item.contado_at)) &&
    isObservationType(item.tipo_observacion) &&
    validOrigin &&
    validViewType &&
    isCountView(display.vista) &&
    isNullableString(display.categoria_id) &&
    isNonEmptyString(display.grupo) &&
    typeof display.categoria === 'string' &&
    typeof display.stock_teorico === 'number' &&
    Number.isSafeInteger(display.stock_teorico) &&
    typeof display.precio === 'number' &&
    Number.isFinite(display.precio) &&
    (display.ultima_diferencia === null ||
      (typeof display.ultima_diferencia === 'number' &&
        Number.isSafeInteger(display.ultima_diferencia))) &&
    isNullableString(display.motivo_seguimiento) &&
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

export function clearCajeroBuffer(
  scope: CajeroBufferScope,
  storage?: Storage,
): void {
  getStorage(storage).removeItem(getCajeroBufferKey(scope))
  emitBufferChange(scope)
}

function validateObservationInput(input: CajeroObservationInput): void {
  if (
    !isNonEmptyString(input.grupo_id) ||
    !isValidPhysicalCount(input.stock_fisico) ||
    !isNonEmptyString(input.contado_at) ||
    Number.isNaN(Date.parse(input.contado_at)) ||
    !isObservationType(input.tipo_observacion)
  ) {
    throw new Error('La observación local no es válida.')
  }

  if (
    input.display.vista !== 'revisar' &&
    input.tipo_observacion !== 'auto'
  ) {
    throw new Error(
      'Conteo base, Conteo diario, Stock 0 y Stock negativo deben usar tipo_observacion auto.',
    )
  }

  if (input.tipo_observacion === 'reconteo') {
    if (
      input.display.vista !== 'revisar' ||
      !isUuid(input.observacion_origen_id)
    ) {
      throw new Error(
        'Un reconteo requiere un observacion_origen_id válido del backend.',
      )
    }
  } else if (input.observacion_origen_id !== null) {
    throw new Error(
      'Solo un reconteo puede conservar observacion_origen_id.',
    )
  }
}

export function enqueueCajeroObservation(
  scope: CajeroBufferScope,
  input: CajeroObservationInput,
  storage?: Storage,
): CajeroPendingObservation {
  validateObservationInput(input)

  const observation: CajeroPendingObservation = {
    client_observation_id: crypto.randomUUID(),
    conteo_id: scope.conteo_id,
    grupo_id: input.grupo_id,
    stock_fisico: input.stock_fisico,
    contado_at: input.contado_at,
    tipo_observacion: input.tipo_observacion,
    observacion_origen_id: input.observacion_origen_id,
    display: input.display,
    error: null,
  }
  const current = readCajeroBuffer(scope, storage)
  writeCajeroBuffer(
    { ...current, items: [...current.items, observation] },
    storage,
  )
  return observation
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
    tipo_observacion: input.tipo_observacion,
    observacion_origen_id: input.observacion_origen_id,
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

export function shouldFlushCajeroBufferOnExit(itemCount: number): boolean {
  return itemCount >= CAJERO_BATCH_EXIT_THRESHOLD
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
          tipo_observacion,
          observacion_origen_id,
        }) => ({
          client_observation_id,
          grupo_id,
          stock_fisico,
          contado_at,
          tipo_observacion,
          observacion_origen_id,
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

  const items = current.items
    .filter((item) => !confirmedIds.has(item.client_observation_id))
    .map((item) => ({
      ...item,
      error: errorsById.get(item.client_observation_id) ?? item.error,
    }))
  const remaining: CajeroBuffer = { ...current, items }
  writeCajeroBuffer(remaining, storage)

  return {
    confirmedIds: [...confirmedIds],
    rejectedIds: [...errorsById.keys()],
    unassociatedErrors,
    remaining,
  }
}

export function subscribeCajeroBuffer(
  scope: CajeroBufferScope,
  listener: () => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const key = getCajeroBufferKey(scope)
  const handleChange = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      typeof event.detail === 'object' &&
      event.detail !== null &&
      'key' in event.detail &&
      event.detail.key !== key
    ) {
      return
    }
    listener()
  }

  window.addEventListener(BUFFER_EVENT, handleChange)
  return () => window.removeEventListener(BUFFER_EVENT, handleChange)
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
