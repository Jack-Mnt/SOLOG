import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getSologErrorMessageFromUnknown, SologApiError } from '../errors'
import type { SologOperationalBootstrap } from '../types'
import type { CashierHistoryPeriod } from './cajero.history'
import { useCashier } from './cajero.v2.context'
import { CashierDraftCoordinator } from './cajero.flush'
import {
  clearCajeroMemory, getCajeroBufferRevision,
  readCajeroBuffer, readCajeroRecountDrafts,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import type {
  CajeroBufferScope, CajeroGroupsCacheEntry, CajeroGroupsResponse, CajeroStatusResponse,
  CajeroCachedView,
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
  const draftCoordinator = useMemo(() => new CashierDraftCoordinator(store), [store])
  const orchestrating = useSyncExternalStore(draftCoordinator.subscribe, draftCoordinator.getSnapshot, () => false)
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
  const normalPendingCount = activeScope ? readCajeroBuffer(activeScope).items.length : 0
  const recountPendingCount = activeScope ? readCajeroRecountDrafts(activeScope).items.length : 0
  const pendingCount = normalPendingCount + recountPendingCount
  const blockReason: CajeroBlockReason | null = expired ? 'expired' : inactive ? 'inactive' : null
  const canCapture = Boolean(activeScope && currentSession?.estado === 'activo' && bootstrap.device.autorizado && !expired && !inactive && !orchestrating && !store.busy && !store.hasPendingIntent)
  useEffect(() => {
    clearCajeroMemory()
    lastActivity.current = Date.now()
    queueMicrotask(() => setInactive(false))
  }, [bootstrap.identity.id, bootstrap.site.id, bootstrap.device.id, currentSession?.id])
  useEffect(() => {
    let cleared = false
    const check = () => {
      const isExpired = Boolean(currentSession && (currentSession.estado === 'expirado' || Date.now() + serverOffsetMs >= Date.parse(currentSession.expira_at)))
      // Una intención enviada cuyo resultado es incierto conserva su payload para replay.
      if (isExpired && !cleared) { clearCajeroMemory(); cleared = true }
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
    if (!s || s.estado !== 'activo' || !b?.device.autorizado || inactive || draftCoordinator.getSnapshot() || store.busy || store.hasPendingIntent || Date.now() + serverOffsetMs >= Date.parse(s.expira_at)) {
      throw new SologApiError('SOLOG_SESSION_EXPIRED')
    }
    return new Date(Date.now() + serverOffsetMs).toISOString()
  }, [store, serverOffsetMs, inactive, draftCoordinator])
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
  const executeDraftCommand = useCallback(async (command: Parameters<CashierDraftCoordinator['run']>[0]) => {
    try {
      await draftCoordinator.run(command)
      setError(null)
      return true
    } catch (e) { await handleError(e); return false }
  }, [draftCoordinator, handleError])
  const retryPending = useCallback(() => executeDraftCommand('retry'), [executeDraftCommand])
  const sendPending = useCallback(() => executeDraftCommand('normal'), [executeDraftCommand])
  const flushPendingDrafts = useCallback(() => executeDraftCommand('global'), [executeDraftCommand])
  const finishSession = useCallback(() => executeDraftCommand('finish'), [executeDraftCommand])
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
  const views = useMemo(() => {
    const lookup = new Map(panel.groups.map((g) => [g.grupo_id, g]))
    const result = {} as Record<CajeroCachedView, CajeroGroupsResponse>
    for (const view of ['conteo', 'conteo_diario', 'revisar'] as const) {
      const queue: Array<{ grupo_id: string; detalle_id?: string; ultima_diferencia?: number; contado_at?: string }> =
        view === 'revisar' ? panel.review_queue : panel.count_queue.map((grupo_id) => ({ grupo_id }))
      result[view] = {
        conteo_id: panel.session?.id ?? null, vista: view,
        snapshot_actual_id: panel.basis.snapshot_referencia_id,
        snapshot_actual_at: panel.basis.snapshot_referencia_id === bootstrap.start_capability.snapshot_id ? bootstrap.start_capability.snapshot_at : null,
        server_now: bootstrap.server_now,
        grupos: queue.map((item) => {
          const g = lookup.get(item.grupo_id)!
          const reviewItem = typeof item.detalle_id === 'string' ? item : null
          return { ...g, cubierto_periodo: g.cobertura_periodo, detalle_origen_id: g.detalle_reconteo_id,
            ...(reviewItem ? { detalle_origen_id: reviewItem.detalle_id, ultima_diferencia: reviewItem.ultima_diferencia!,
              contado_at_original: reviewItem.contado_at! } : {}),
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
    activeScope, blockReason, canCapture, error, pendingCount, normalPendingCount, recountPendingCount,
    pendingIntent: store.hasPendingIntent, pendingAction: store.pendingAction, sending: store.busy || orchestrating, starting: store.busy || orchestrating,
    startSession, sendPending, flushPendingDrafts, retrySend: retryPending, logoutSafely, finishSession, serverOffsetMs,
    periodComplete: panel.kpis.coverage_percent === 100,
    dailyPending: Math.max(0, panel.kpis.count_pending - normalPendingCount),
    reviewPending: panel.kpis.review_pending, cacheRevision: store.revision,
    captureTimestamp, getCachedOperationalGroups, loadOperationalGroups,
    getCachedHistory, loadHistory, clearError: () => setError(null),
    refresh: async () => { try { await store.refresh(); setError(null) } catch (e) { await handleError(e) } },
  }
}
export type CajeroSessionController = ReturnType<typeof useCajeroSession>
