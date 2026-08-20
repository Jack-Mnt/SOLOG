import { useSyncExternalStore } from 'react'
import { saveCountBatch } from '../api'
import { getOrCreateDeviceToken } from '../device'
import type {
  SologBatchResultItem,
  SologCountBatchPayload,
  SologPendingCapture,
  SologPendingQueue,
} from '../types'

export const SOLOG_PENDING_COUNTS_KEY = 'solog.pending-counts.v2'
const QUEUE_EVENT = 'solog:pending-counts'
const MAX_BATCH_SIZE = 500

function isPendingCapture(value: unknown): value is SologPendingCapture {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SologPendingCapture>
  return (
    typeof item.local_id === 'string' &&
    typeof item.grupo_id === 'string' &&
    Number.isSafeInteger(item.stock_fisico) &&
    Number(item.stock_fisico) >= 0 &&
    typeof item.contado_at === 'string' &&
    (item.vista === 'categoria' ||
      item.vista === 'stock_cero' ||
      item.vista === 'cambios_recientes' ||
      item.vista === 'stock_negativo') &&
    (item.vista !== 'categoria' || typeof item.categoria_id === 'string')
  )
}

export function readPendingQueue(): SologPendingQueue | null {
  try {
    const raw = window.localStorage.getItem(SOLOG_PENDING_COUNTS_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const queue = value as Partial<SologPendingQueue>
    if (
      queue.version !== 2 ||
      typeof queue.conteo_id !== 'string' ||
      !Array.isArray(queue.items) ||
      !queue.items.every(isPendingCapture)
    ) {
      return null
    }
    return queue as SologPendingQueue
  } catch {
    return null
  }
}

function emitQueueChange(): void {
  window.dispatchEvent(new Event(QUEUE_EVENT))
}

function writePendingQueue(queue: SologPendingQueue | null): void {
  if (queue && queue.items.length > 0) {
    window.localStorage.setItem(SOLOG_PENDING_COUNTS_KEY, JSON.stringify(queue))
  } else {
    window.localStorage.removeItem(SOLOG_PENDING_COUNTS_KEY)
  }
  emitQueueChange()
}

export function clearPendingQueue(): void {
  writePendingQueue(null)
}

export function enqueuePendingCapture(
  conteoId: string,
  capture: SologPendingCapture,
): void {
  const current = readPendingQueue()
  if (current && current.conteo_id !== conteoId) {
    throw new Error(
      'Existen capturas locales de otra sesión. Revísalas o límpialas antes de continuar.',
    )
  }

  const items = current?.items ?? []
  const duplicate = items.some(
    (item) =>
      item.grupo_id === capture.grupo_id &&
      item.vista === capture.vista &&
      item.categoria_id === capture.categoria_id,
  )
  if (duplicate) return

  writePendingQueue({ version: 2, conteo_id: conteoId, items: [...items, capture] })
}

function removeConfirmedItems(conteoId: string, localIds: Set<string>): void {
  const current = readPendingQueue()
  if (!current || current.conteo_id !== conteoId) return
  writePendingQueue({
    ...current,
    items: current.items.filter((item) => !localIds.has(item.local_id)),
  })
}

export function discardPendingCaptures(
  conteoId: string,
  localIds: Set<string>,
): void {
  removeConfirmedItems(conteoId, localIds)
}

function groupKey(item: SologPendingCapture): string {
  return `${item.vista}:${item.categoria_id ?? ''}`
}

export async function flushPendingQueue(
  conteoId: string,
  onServerNow: (serverNow: string) => void,
): Promise<SologBatchResultItem[]> {
  const queue = readPendingQueue()
  if (!queue) return []
  if (queue.conteo_id !== conteoId) {
    throw new Error('Las capturas locales pertenecen a una sesión anterior y no se enviaron.')
  }

  const grouped = new Map<string, SologPendingCapture[]>()
  for (const item of queue.items) {
    const key = groupKey(item)
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }

  const results: SologBatchResultItem[] = []
  for (const items of grouped.values()) {
    for (let index = 0; index < items.length; index += MAX_BATCH_SIZE) {
      const chunk = items.slice(index, index + MAX_BATCH_SIZE)
      const first = chunk[0]
      const batchItems = chunk.map(({ grupo_id, stock_fisico, contado_at }) => ({
        grupo_id,
        stock_fisico,
        contado_at,
      }))
      const common = {
        device_token: getOrCreateDeviceToken(),
        conteo_id: conteoId,
        items: batchItems,
      }
      const payload: SologCountBatchPayload =
        first.vista === 'categoria'
          ? { ...common, vista: 'categoria', categoria_id: first.categoria_id ?? '' }
          : { ...common, vista: first.vista }
      const response = await saveCountBatch(payload)
      onServerNow(response.server_now)
      results.push(...response.items)
      removeConfirmedItems(conteoId, new Set(chunk.map((item) => item.local_id)))
    }
  }
  return results
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(QUEUE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(QUEUE_EVENT, onStoreChange)
  }
}

let cachedRaw: string | null | undefined
let cachedQueue: SologPendingQueue | null = null

function getSnapshot(): SologPendingQueue | null {
  const raw = window.localStorage.getItem(SOLOG_PENDING_COUNTS_KEY)
  if (raw === cachedRaw) return cachedQueue
  cachedRaw = raw
  cachedQueue = readPendingQueue()
  return cachedQueue
}

export function useCountQueue(): SologPendingQueue | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
