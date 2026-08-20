import { useEffect, useMemo, useRef, useState } from 'react'

const WARNING_KEY_PREFIX = 'solog.expiry-warnings.v2:'

const WARNING_MESSAGES: Record<5 | 10 | 15, string> = {
  15: 'El inventario vence en 15 minutos. Procura terminar el conteo actual.',
  10: 'Quedan 10 minutos. Termina los grupos pendientes.',
  5: 'Quedan 5 minutos. Finaliza el conteo. Será necesario subir un inventario actualizado para continuar.',
}

function getRemainingSeconds(expiraAt: string | null, serverOffsetMs: number): number {
  if (!expiraAt) return 0
  return Math.max(0, Math.ceil((Date.parse(expiraAt) - (Date.now() + serverOffsetMs)) / 1000))
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
  snapshotId: string | null,
  expiraAt: string | null,
  serverOffsetMs: number,
) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(expiraAt, serverOffsetMs),
  )
  const [warning, setWarning] = useState<string | null>(null)
  const previousSnapshot = useRef(snapshotId)

  useEffect(() => {
    const update = () => setRemainingSeconds(getRemainingSeconds(expiraAt, serverOffsetMs))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [expiraAt, serverOffsetMs])

  useEffect(() => {
    if (previousSnapshot.current !== snapshotId) {
      previousSnapshot.current = snapshotId
      setWarning(null)
    }
    if (!snapshotId || remainingSeconds <= 0) return

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
  }, [remainingSeconds, snapshotId])

  return useMemo(
    () => ({ remainingSeconds, expired: remainingSeconds <= 0, warning }),
    [remainingSeconds, warning],
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
