import { useEffect, useMemo, useRef, useState } from 'react'

const WARNING_KEY_PREFIX = 'solog.expiry-warnings.v2:'

const WARNING_MESSAGES: Record<5 | 10 | 15, string> = {
  15: 'El inventario vence en 15 minutos. Procura terminar el conteo actual.',
  10: 'Quedan 10 minutos. Termina los grupos pendientes.',
  5: 'Quedan 5 minutos. Finaliza el conteo. Será necesario subir un inventario actualizado para continuar.',
}

export type InventoryExpirySource =
  | { available: false }
  | { available: true; snapshotId: string; expiraAt: string }

function getRemainingSeconds(
  expiraAt: string,
  serverOffsetMs: number,
  currentTime: number,
): number {
  return Math.max(0, Math.ceil((Date.parse(expiraAt) - (currentTime + serverOffsetMs)) / 1000))
}

function readSeenWarnings(snapshotId: string): number[] {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(`${WARNING_KEY_PREFIX}${snapshotId}`) ?? '[]',
    )
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : []
  } catch {
    return []
  }
}

export function useInventoryExpiry(
  source: InventoryExpirySource,
  serverOffsetMs: number,
) {
  const [currentTime, setCurrentTime] = useState(Date.now)
  const [warning, setWarning] = useState<string | null>(null)
  const snapshotId = source.available ? source.snapshotId : null
  const previousSnapshot = useRef(snapshotId)
  const remainingSeconds = source.available
    ? getRemainingSeconds(source.expiraAt, serverOffsetMs, currentTime)
    : null

  useEffect(() => {
    if (!source.available) return
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [source.available])

  useEffect(() => {
    if (previousSnapshot.current !== snapshotId) {
      previousSnapshot.current = snapshotId
      setWarning(null)
    }
    if (
      !source.available ||
      snapshotId === null ||
      remainingSeconds === null ||
      remainingSeconds <= 0
    ) return

    const minutes = remainingSeconds / 60
    const threshold: 5 | 10 | 15 | null =
      minutes <= 5 ? 5 : minutes <= 10 ? 10 : minutes <= 15 ? 15 : null
    if (!threshold) return

    const seen = readSeenWarnings(snapshotId)
    if (seen.includes(threshold)) return
    const nowSeen = [15, 10, 5].filter((value) => value >= threshold)
    window.localStorage.setItem(
      `${WARNING_KEY_PREFIX}${snapshotId}`,
      JSON.stringify([...new Set([...seen, ...nowSeen])]),
    )
    const notification = window.setTimeout(
      () => setWarning(WARNING_MESSAGES[threshold]),
      0,
    )
    return () => window.clearTimeout(notification)
  }, [remainingSeconds, snapshotId, source.available])

  return useMemo(
    () => ({
      available: source.available,
      remainingSeconds,
      expired: source.available && remainingSeconds === 0,
      warning: source.available ? warning : null,
    }),
    [remainingSeconds, source.available, warning],
  )
}

export function formatRemainingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':')
}
