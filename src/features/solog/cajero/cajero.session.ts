import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getSologErrorMessageFromUnknown, SologApiError } from '../errors'
import type { SologOperationalBootstrap } from '../types'
import type { CashierHistoryPeriod } from './cajero.history'
import { useCashier } from './cajero.v2.context'
import {
  buildNextCajeroBatch, clearCajeroMemory, getCajeroBufferRevision,
  readCajeroBuffersForIdentity, removeCajeroObservation, removeCajeroExpressionDrafts,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import type {
  CajeroBufferScope, CajeroGroupsCacheEntry, CajeroGroupsResponse, CajeroStatusResponse,
  CajeroCachedView,
  CajeroRecountStartResponse, CajeroRecountResponse,
} from './cajero.types'
export const CAJERO_INACTIVITY_MS = 20 * 60 * 1000

export type CajeroBlockReason =
  | 'expired'
  | 'inactive'
  | 'stock_unavailable'

export function getCajeroSessionBlockReason(
  bootstrap: SologOperationalBootstrap,
  now: number,
): CajeroBlockReason | null {
  const session = bootstrap.sesion_activa
  if (!session) return null
  if (!bootstrap.stock.disponible || !bootstrap.stock.vigente) return 'stock_unavailable'

  const expiration = Date.parse(session.expira_at)
  return !Number.isNaN(expiration) && now >= expiration ? 'expired' : null
}

export function getCajeroStatusBlockReason(
  bootstrap: SologOperationalBootstrap,
  status: CajeroStatusResponse,
  now: number,
): CajeroBlockReason | null {
  const session = bootstrap.sesion_activa
  if (!session) return null
  if (!bootstrap.stock.disponible || !bootstrap.stock.vigente || status.snapshot_actual_id === null) {
    return 'stock_unavailable'
  }

  const expiration = Date.parse(session.expira_at)
  return !Number.isNaN(expiration) && now >= expiration ? 'expired' : null
}
export function getReusableCajeroGroups(
  cache: CajeroGroupsCacheEntry | undefined,
  snapshotId: string | null,
): CajeroGroupsResponse | null {
  return cache?.snapshotId === snapshotId ? cache.response : null
}

export function shouldInvalidateCajeroCaches(
  caches: Partial<Record<CajeroCachedView, CajeroGroupsCacheEntry>>,
  snapshotId: string | null,
): boolean {
  return Object.values(caches).some((entry) => entry.snapshotId !== snapshotId)
}
export function isCurrentCajeroResponse(
  requestedScope: CajeroBufferScope | null,
  currentScope: CajeroBufferScope | null,
  requestedGeneration: number,
  currentGeneration: number,
): boolean {
  return requestedGeneration === currentGeneration &&
    requestedScope?.usuario_id === currentScope?.usuario_id &&
    requestedScope?.sede_id === currentScope?.sede_id &&
    requestedScope?.dispositivo_id === currentScope?.dispositivo_id &&
    requestedScope?.conteo_id === currentScope?.conteo_id
}

export function isCajeroInactive(lastActivity: number, now: number): boolean {
  return now - lastActivity >= CAJERO_INACTIVITY_MS
}


export function useCajeroSession(onLogout: () => Promise<void>) {
  const store = useCashier()
  const bootstrap = store.bootstrap!
  const panel = bootstrap.panel_state
  const currentSession = panel.session
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [inactive, setInactive] = useState(false)
  const lastActivity = useRef(0)
  useSyncExternalStore(subscribeCajeroBufferChanges, getCajeroBufferRevision, () => 0)
  const serverOffsetMs = store.serverOffsetMs
  const activeScope = useMemo<CajeroBufferScope | null>(() => currentSession && bootstrap.device.id ? {
    usuario_id: bootstrap.identity.id, sede_id: bootstrap.site.id,
    dispositivo_id: bootstrap.device.id, conteo_id: currentSession.id,
    groups_revision: currentSession.groups_revision,
  } : null, [bootstrap.identity.id, bootstrap.site.id, bootstrap.device.id, currentSession])
  const pendingCount = activeScope ? readCajeroBuffersForIdentity(activeScope).reduce((sum, b) => sum + b.items.length, 0) : 0
  const recounts = useRef(new Map<string, Promise<CajeroRecountStartResponse>>())
  const blockReason: CajeroBlockReason | null = expired ? 'expired' : inactive ? 'inactive' : null
  const canCapture = Boolean(activeScope && currentSession?.estado === 'activo' && bootstrap.device.autorizado && !expired && !inactive && !store.busy && !store.hasPendingIntent)
  useEffect(() => {
    clearCajeroMemory()
    recounts.current.clear()
    lastActivity.current = Date.now()
    queueMicrotask(() => setInactive(false))
  }, [bootstrap.identity.id, bootstrap.site.id, bootstrap.device.id, currentSession?.id])
  useEffect(() => {
    recounts.current.clear()
  }, [bootstrap.revisions.operational, bootstrap.revisions.devices, panel.basis.groups_revision])
  useEffect(() => {
    let cleared = false
    const check = () => {
      const isExpired = Boolean(currentSession && (currentSession.estado === 'expirado' || Date.now() + serverOffsetMs >= Date.parse(currentSession.expira_at)))
      // Una intención enviada cuyo resultado es incierto conserva su payload para replay.
      if (isExpired && !cleared) { clearCajeroMemory(); recounts.current.clear(); cleared = true }
      setExpired(isExpired)
    }
    queueMicrotask(check)
    const timer = window.setInterval(check, 1000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [currentSession, serverOffsetMs, store])
  const captureTimestamp = useCallback(() => {
    const b = store.bootstrap
    const s = b?.panel_state.session
    if (!s || s.estado !== 'activo' || !b?.device.autorizado || inactive || store.busy || store.hasPendingIntent || Date.now() + serverOffsetMs >= Date.parse(s.expira_at)) {
      throw new SologApiError('SOLOG_SESSION_EXPIRED')
    }
    return new Date(Date.now() + serverOffsetMs).toISOString()
  }, [store, serverOffsetMs, inactive])
  const handleError = useCallback(async (e: unknown) => {
    setError(getSologErrorMessageFromUnknown(e))
    if (e instanceof SologApiError && ['SOLOG_GROUPS_REVISION_CONFLICT', 'SOLOG_SESSION_REVISION_CONFLICT', 'SOLOG_SESSION_CONFLICT', 'SOLOG_DEVICE_UNAUTHORIZED'].includes(e.code)) {
      await store.refresh().catch(() => undefined)
    }
  }, [store])
  const startSession = useCallback(async () => {
    const session = store.bootstrap?.panel_state.session
    if (session?.estado === 'activo' && Date.now() + store.serverOffsetMs < Date.parse(session.expira_at)) return true
    try { await store.mutate('start'); setError(null); return true }
    catch (e) { await handleError(e); return false }
  }, [store, handleError])
  const sendPending = useCallback(async () => {
    if (!activeScope) return false
    try {
      if (store.hasPendingIntent) {
        const response = await store.retryPending()
        for (const item of response?.items ?? []) {
          removeCajeroObservation(activeScope, item.grupo_id)
          removeCajeroExpressionDrafts(activeScope, [item.grupo_id])
        }
      }
      let batch = buildNextCajeroBatch(activeScope, store.deviceToken)
      while (batch) {
        const response = await store.mutate('save_batch', { items: batch.items })
        for (const item of response.items ?? []) {
          removeCajeroObservation(activeScope, item.grupo_id)
          removeCajeroExpressionDrafts(activeScope, [item.grupo_id])
        }
        batch = buildNextCajeroBatch(activeScope, store.deviceToken)
      }
      setError(null)
      return true
    } catch (e) { await handleError(e); return false }
  }, [activeScope, store, handleError])
  const finishSession = useCallback(async () => {
    try {
      const session = store.bootstrap?.panel_state.session
      const isExpired = session && Date.now() + store.serverOffsetMs >= Date.parse(session.expira_at)
      if (isExpired && !store.hasPendingIntent) clearCajeroMemory()
      if (store.hasPendingIntent) {
        const result = await store.retryPending()
        if (activeScope) for (const item of result?.items ?? []) removeCajeroObservation(activeScope, item.grupo_id)
      }
      if (pendingCount && !isExpired && !(await sendPending())) return false
      if (store.bootstrap?.panel_state.session) {
        await store.mutate('finish')
        await store.refresh()
      }
      setError(null)
      return true
    } catch (e) { await handleError(e); return false }
  }, [pendingCount, sendPending, store, handleError, activeScope])
  const logoutSafely = useCallback(async () => {
    if (!(await finishSession())) return false
    store.dispose()
    await onLogout()
    return true
  }, [finishSession, store, onLogout])
  useEffect(() => {
    if (!currentSession || currentSession.estado !== 'activo') return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setInactive(true)
        void finishSession()
      }, Math.max(0, CAJERO_INACTIVITY_MS - (Date.now() - lastActivity.current)))
    }
    const register = () => { lastActivity.current = Date.now(); schedule() }
    schedule()
    window.addEventListener('pointerdown', register, { passive: true })
    window.addEventListener('keydown', register)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', register)
      window.removeEventListener('keydown', register)
    }
  }, [currentSession, finishSession])
  const beginRecount = useCallback(async (detalleId: string): Promise<CajeroRecountStartResponse> => {
    const key = store.scope + ':' + detalleId
    let request = recounts.current.get(key)
    if (!request) {
      request = store.mutate('recount_start', { detalle_id: detalleId }).then((r) => r as CajeroRecountStartResponse)
      recounts.current.set(key, request)
    }
    try { return await request }
    catch (e) { recounts.current.delete(key); await handleError(e); throw e }
  }, [store, handleError])
  const saveRecount = useCallback(async (detalleId: string, physical: number, timestamp: string): Promise<CajeroRecountResponse> => {
    try {
      const r = await store.mutate('recount_save', { detalle_id: detalleId, stock_fisico: physical, contado_at: timestamp })
      return r as CajeroRecountResponse
    } catch (e) { await handleError(e); throw e }
  }, [store, handleError])
  const views = useMemo(() => {
    const lookup = new Map(panel.groups.map((g) => [g.grupo_id, g]))
    const result = {} as Record<CajeroCachedView, CajeroGroupsResponse>
    for (const view of ['conteo', 'conteo_diario', 'revisar'] as const) {
      const ids = view === 'revisar' ? panel.review_queue.map((r) => r.grupo_id) : panel.count_queue
      result[view] = {
        conteo_id: panel.session?.id ?? null, vista: view,
        snapshot_actual_id: panel.basis.snapshot_referencia_id,
        snapshot_actual_at: panel.basis.snapshot_referencia_id === bootstrap.start_capability.snapshot_id ? bootstrap.start_capability.snapshot_at : null,
        server_now: bootstrap.server_now,
        grupos: ids.map((id) => {
          const g = lookup.get(id)!
          return { ...g, cubierto_periodo: g.cobertura_periodo, detalle_origen_id: g.detalle_reconteo_id,
            productos: g.productos.map((p) => ({ ...p, marca: p.marca ?? '' })) }
        }),
      }
    }
    return result
  }, [panel, bootstrap.server_now, bootstrap.start_capability])
  const getCachedOperationalGroups = useCallback((view: CajeroCachedView) => views[view], [views])
  const loadOperationalGroups = useCallback(async (view: CajeroCachedView) => views[view], [views])
  const getCachedHistory = useCallback((period: CashierHistoryPeriod) => store.history.get(period, Date.now() + store.serverOffsetMs), [store])
  const loadHistory = useCallback((period: CashierHistoryPeriod) => store.history.load(period, () => Date.now() + store.serverOffsetMs), [store])
  return {
    activeScope, blockReason, canCapture, error, pendingCount, pendingIntent: store.hasPendingIntent, sending: store.busy, starting: store.busy,
    startSession, sendPending, retrySend: sendPending, logoutSafely, finishSession, serverOffsetMs,
    periodComplete: panel.kpis.coverage_percent === 100,
    dailyPending: panel.kpis.count_pending, reviewPending: panel.kpis.review_pending, cacheRevision: store.revision,
    captureTimestamp, beginRecount, saveRecount, getCachedOperationalGroups, loadOperationalGroups,
    getCachedHistory, loadHistory, clearError: () => setError(null),
    refresh: async () => { try { await store.refresh(); setError(null) } catch (e) { await handleError(e) } },
  }
}
export type CajeroSessionController = ReturnType<typeof useCajeroSession>
