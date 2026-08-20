import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { finishCount, getSologGroups, recountSologGroup } from '../api'
import { getOrCreateDeviceToken } from '../device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../errors'
import { useSolog } from '../SologContext'
import type {
  SologBatchResultItem,
  SologCountGroup,
  SologGroupsResponse,
  SologOperationalBootstrap,
  SologPendingCapture,
  SologRecountResponse,
} from '../types'
import { useInventoryExpiry } from './expiry'
import {
  clearPendingQueue,
  discardPendingCaptures,
  enqueuePendingCapture,
  flushPendingQueue,
  readPendingQueue,
  useCountQueue,
} from './queue'
import { isBatchView, type SologSelectedView } from './views'

type CountStatus = 'loading' | 'ready' | 'error'

export function useCountSession(
  bootstrap: SologOperationalBootstrap,
  selectedView: SologSelectedView,
) {
  const { serverOffsetMs, updateServerNow, refresh, setNotice } = useSolog()
  const session = bootstrap.sesion_activa
  const queue = useCountQueue()
  const [status, setStatus] = useState<CountStatus>('loading')
  const [response, setResponse] = useState<SologGroupsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [recountingIds, setRecountingIds] = useState<string[]>([])
  const [batchResults, setBatchResults] = useState<Record<string, SologBatchResultItem>>({})
  const [recountResults, setRecountResults] = useState<Record<string, SologRecountResponse>>({})
  const expiryFlushAttempted = useRef(false)
  const expiry = useInventoryExpiry(
    bootstrap.stock.snapshot_id,
    bootstrap.stock.expira_at,
    serverOffsetMs,
  )

  const loadGroups = useCallback(async () => {
    if (!session) return
    setStatus('loading')
    setError(null)
    try {
      const common = { device_token: getOrCreateDeviceToken() }
      const next = await getSologGroups(
        selectedView.vista === 'categoria'
          ? { ...common, vista: 'categoria', categoria_id: selectedView.categoriaId ?? '' }
          : { ...common, vista: selectedView.vista },
      )
      if (next.server_now) updateServerNow(next.server_now)
      setResponse(next)
      setStatus('ready')
      return next
    } catch (loadError) {
      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')
      if (
        isSologApiErrorCode(
          loadError,
          'SOLOG_DEVICE_NOT_AUTHORIZED',
          'SOLOG_COUNT_NOT_ACTIVE',
          'SOLOG_COUNT_EXPIRED',
          'SOLOG_SNAPSHOT_EXPIRED',
        )
      ) {
        await refresh()
      }
    }
  }, [refresh, selectedView.categoriaId, selectedView.vista, session, updateServerNow])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadGroups()
    })
    return () => {
      active = false
    }
  }, [loadGroups])

  const staleQueue = Boolean(queue && (!session || queue.conteo_id !== session.id))
  const sessionItems = useMemo(
    () => (queue && session && queue.conteo_id === session.id ? queue.items : []),
    [queue, session],
  )
  const pendingByGroup = useMemo(
    () =>
      Object.fromEntries(
        sessionItems
          .filter(
            (item) =>
              item.vista === selectedView.vista &&
              item.categoria_id === selectedView.categoriaId,
          )
          .map((item) => [item.grupo_id, item]),
      ) as Record<string, SologPendingCapture>,
    [selectedView.categoriaId, selectedView.vista, sessionItems],
  )

  const capture = useCallback(
    (groupId: string, stockFisico: number) => {
      if (!session || expiry.expired || !isBatchView(selectedView.vista)) return
      setError(null)
      try {
        enqueuePendingCapture(session.id, {
          local_id: crypto.randomUUID(),
          grupo_id: groupId,
          stock_fisico: stockFisico,
          contado_at: new Date(Date.now() + serverOffsetMs).toISOString(),
          vista: selectedView.vista,
          ...(selectedView.categoriaId
            ? { categoria_id: selectedView.categoriaId }
            : {}),
        })
      } catch (captureError) {
        setError(getSologErrorMessageFromUnknown(captureError))
      }
    },
    [expiry.expired, selectedView, serverOffsetMs, session],
  )

  const flush = useCallback(async () => {
    if (!session || syncing) return false
    setSyncing(true)
    setError(null)
    try {
      const results = await flushPendingQueue(session.id, updateServerNow)
      if (results.length > 0) {
        setBatchResults((current) => ({
          ...current,
          ...Object.fromEntries(results.map((item) => [item.grupo_id, item])),
        }))
        await refresh(true)
      }
      return true
    } catch (syncError) {
      const syncMessage = `${getSologErrorMessageFromUnknown(syncError)} Los datos permanecen guardados en esta tablet.`
      setError(syncMessage)
      if (
        isSologApiErrorCode(
          syncError,
          'SOLOG_GROUP_ALREADY_COVERED_QUINCENA',
          'SOLOG_DEVICE_NOT_AUTHORIZED',
          'SOLOG_COUNT_EXPIRED',
        )
      ) {
        await refresh(true)
        if (isSologApiErrorCode(syncError, 'SOLOG_GROUP_ALREADY_COVERED_QUINCENA')) {
          const nextGroups = await loadGroups()
          const currentQueue = readPendingQueue()
          if (nextGroups && currentQueue?.conteo_id === session.id) {
            const eligibleIds = new Set(nextGroups.grupos.map((group) => group.grupo_id))
            const obsoleteIds = new Set(
              currentQueue.items
                .filter(
                  (item) =>
                    item.vista === selectedView.vista &&
                    item.categoria_id === selectedView.categoriaId &&
                    !eligibleIds.has(item.grupo_id),
                )
                .map((item) => item.local_id),
            )
            discardPendingCaptures(session.id, obsoleteIds)
          }
          setError(
            `${syncMessage} Las capturas de grupos que el backend ya considera cubiertos se separaron del próximo reintento.`,
          )
        }
      }
      return false
    } finally {
      setSyncing(false)
    }
  }, [
    loadGroups,
    refresh,
    selectedView.categoriaId,
    selectedView.vista,
    session,
    syncing,
    updateServerNow,
  ])

  useEffect(() => {
    if (!expiry.expired || expiryFlushAttempted.current || sessionItems.length === 0) return
    expiryFlushAttempted.current = true
    void flush()
  }, [expiry.expired, flush, sessionItems.length])

  const recount = useCallback(
    async (detalleId: string, stockFisico: number) => {
      if (!session || expiry.expired || recountingIds.includes(detalleId)) return
      setRecountingIds((current) => [...current, detalleId])
      setError(null)
      const contadoAt = new Date(Date.now() + serverOffsetMs).toISOString()
      try {
        const result = await recountSologGroup({
          device_token: getOrCreateDeviceToken(),
          conteo_id: session.id,
          detalle_id: detalleId,
          stock_fisico: stockFisico,
          contado_at: contadoAt,
        })
        if (result.server_now) updateServerNow(result.server_now)
        setRecountResults((current) => ({ ...current, [detalleId]: result }))
      } catch (recountError) {
        setError(getSologErrorMessageFromUnknown(recountError))
        if (
          isSologApiErrorCode(
            recountError,
            'SOLOG_RECOUNT_NOT_AVAILABLE',
            'SOLOG_RECOUNT_NOT_ELIGIBLE',
            'SOLOG_RECOUNT_ALREADY_DONE',
          )
        ) {
          await loadGroups()
        }
      } finally {
        setRecountingIds((current) => current.filter((id) => id !== detalleId))
      }
    },
    [expiry.expired, loadGroups, recountingIds, serverOffsetMs, session, updateServerNow],
  )

  const finish = useCallback(async () => {
    if (!session || finishing || staleQueue) return false
    setFinishing(true)
    setError(null)
    try {
      const flushed = await flush()
      if (!flushed) return false
      const currentQueue = readPendingQueue()
      const remaining = currentQueue?.conteo_id === session.id ? currentQueue.items.length : 0
      if (remaining > 0) {
        setError('Aún existen capturas pendientes. No se finalizó la sesión.')
        return false
      }
      const result = await finishCount({
        device_token: getOrCreateDeviceToken(),
        conteo_id: session.id,
      })
      if (result.server_now) updateServerNow(result.server_now)
      setNotice('Sesión de conteo finalizada. La cobertura quincenal conserva su avance.')
      await refresh()
      return true
    } catch (finishError) {
      setError(getSologErrorMessageFromUnknown(finishError))
      return false
    } finally {
      setFinishing(false)
    }
  }, [finishing, flush, refresh, session, setNotice, staleQueue, updateServerNow])

  const groups = response?.grupos ?? []
  const countedGroups = groups.filter(
    (group: SologCountGroup) =>
      group.contado || Boolean(pendingByGroup[group.grupo_id]) || Boolean(batchResults[group.grupo_id]),
  ).length

  return {
    status,
    response,
    groups,
    error,
    expiry,
    queue,
    staleQueue,
    pendingByGroup,
    batchResults,
    recountResults,
    recountingIds,
    syncing,
    finishing,
    countedGroups,
    loadGroups,
    capture,
    recount,
    flush,
    finish,
    clearStaleQueue: clearPendingQueue,
  }
}
