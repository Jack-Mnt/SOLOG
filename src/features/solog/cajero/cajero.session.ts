import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { getOrCreateDeviceToken } from '../device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../errors'
import { useSolog } from '../SologContext'
import type { SologOperationalBootstrap } from '../types'
import {
  finishCajeroSession,
  getCajeroGroups,
  getCajeroHistory,
  getCajeroStatus,
  saveCajeroBatch,
  startCajeroSession,
} from './cajero.api'
import {
  applyCajeroBatchResponse,
  buildNextCajeroBatch,
  getCajeroBufferRevision,
  readCajeroBuffersForIdentity,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import type {
  CajeroBufferIdentity,
  CajeroBufferScope,
  CajeroCachedView,
  CajeroGroupsCacheEntry,
  CajeroGroupsResponse,
  CajeroHistoryPeriod,
  CajeroHistoryResponse,
  CajeroStatusResponse,
} from './cajero.types'

export const CAJERO_INACTIVITY_MS = 20 * 60 * 1000
const ACTIVITY_KEY_PREFIX = 'solog.cajero.activity.v3'

export type CajeroBlockReason =
  | 'expired'
  | 'stock_updated'
  | 'inactive'
  | 'stock_unavailable'

export function getCajeroSessionBlockReason(
  bootstrap: SologOperationalBootstrap,
  now: number,
): CajeroBlockReason | null {
  const session = bootstrap.sesion_activa
  if (!session) return null
  if (!bootstrap.stock.disponible) return 'stock_unavailable'
  if (bootstrap.stock.snapshot_id !== session.snapshot_referencia_id) {
    return 'stock_updated'
  }

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
  if (!bootstrap.stock.disponible || status.snapshot_actual_id === null) {
    return 'stock_unavailable'
  }
  if (
    status.stock_actualizado ||
    status.snapshot_actual_id !== status.snapshot_referencia_id ||
    (status.snapshot_referencia_id !== null &&
      status.snapshot_referencia_id !== session.snapshot_referencia_id)
  ) {
    return 'stock_updated'
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
export function isCajeroInactive(lastActivity: number, now: number): boolean {
  return now - lastActivity >= CAJERO_INACTIVITY_MS
}

function getIdentity(
  bootstrap: SologOperationalBootstrap,
): CajeroBufferIdentity | null {
  if (
    bootstrap.usuario.rol !== 'cajero' ||
    !bootstrap.usuario.id ||
    !bootstrap.sede.id ||
    !bootstrap.dispositivo.id
  ) {
    return null
  }

  return {
    usuario_id: bootstrap.usuario.id,
    sede_id: bootstrap.sede.id,
    dispositivo_id: bootstrap.dispositivo.id,
  }
}

function getActivityKey(scope: CajeroBufferScope): string {
  return [
    ACTIVITY_KEY_PREFIX,
    scope.usuario_id,
    scope.sede_id,
    scope.dispositivo_id,
    scope.conteo_id,
  ]
    .map(encodeURIComponent)
    .join(':')
}

function readLastActivity(scope: CajeroBufferScope): number {
  const parsed = Number(sessionStorage.getItem(getActivityKey(scope)))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now()
}

function writeLastActivity(scope: CajeroBufferScope, value: number): void {
  sessionStorage.setItem(getActivityKey(scope), String(value))
}

export interface CajeroSessionController {
  activeScope: CajeroBufferScope | null
  blockReason: CajeroBlockReason | null
  canCapture: boolean
  error: string | null
  pendingCount: number
  sending: boolean
  starting: boolean
  startSession: () => Promise<boolean>
  sendPending: () => Promise<boolean>
  retrySend: () => Promise<boolean>
  checkFreshness: (autoSend?: boolean) => Promise<CajeroBlockReason | null>
  logoutSafely: () => Promise<boolean>
  operationalStatus: CajeroStatusResponse | null
  fortnightComplete: boolean
  dailyPending: number
  reviewPending: number
  confirmedGroupIds: string[]
  getCachedOperationalGroups: (view: CajeroCachedView) => CajeroGroupsResponse | null
  loadOperationalGroups: (view: CajeroCachedView) => Promise<CajeroGroupsResponse | null>
  invalidateOperationalCaches: () => void
  getCachedHistory: (period: CajeroHistoryPeriod) => CajeroHistoryResponse | null
  loadHistory: (period: CajeroHistoryPeriod) => Promise<CajeroHistoryResponse>
  handleStockUpdateDetected: () => void
  clearError: () => void
}

export function useCajeroSession(onLogout: () => Promise<void>): CajeroSessionController {
  const solog = useSolog()
  const refreshSolog = solog.refresh
  const updateServerNow = solog.updateServerNow
  const identity = useMemo(
    () => (solog.bootstrap ? getIdentity(solog.bootstrap) : null),
    [solog.bootstrap],
  )
  useSyncExternalStore(
    subscribeCajeroBufferChanges,
    getCajeroBufferRevision,
    () => 0,
  )

  const buffers = identity ? readCajeroBuffersForIdentity(identity) : []
  const pendingCount = buffers.reduce(
    (total, buffer) => total + buffer.items.length,
    0,
  )
  const activeSession = solog.bootstrap?.sesion_activa ?? null
  const activeScope = useMemo(
    () =>
      identity && activeSession
        ? { ...identity, conteo_id: activeSession.id }
        : null,
    [activeSession, identity],
  )
  const [blockReason, setBlockReason] = useState<CajeroBlockReason | null>(() =>
    solog.bootstrap
      ? getCajeroSessionBlockReason(
          solog.bootstrap,
          Date.now() + solog.serverOffsetMs,
        )
      : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmedGroups, setConfirmedGroups] = useState<{
    conteoId: string | null
    ids: string[]
  }>({ conteoId: null, ids: [] })
  const [operationalStatus, setOperationalStatus] = useState<CajeroStatusResponse | null>(null)
  const sendingRef = useRef(false)
  const statusRequestRef = useRef<Promise<CajeroStatusResponse> | null>(null)
  const stageRefreshRef = useRef<Promise<SologOperationalBootstrap | null> | null>(null)
  const operationalCachesRef = useRef<Partial<Record<CajeroCachedView, CajeroGroupsCacheEntry>>>({})
  const historyCachesRef = useRef<Partial<Record<CajeroHistoryPeriod, CajeroHistoryResponse>>>({})
  const historyRequestsRef = useRef<Partial<Record<CajeroHistoryPeriod, Promise<CajeroHistoryResponse>>>>({})
  const bootstrapRef = useRef(solog.bootstrap)
  const identityRef = useRef(identity)
  const activeScopeRef = useRef(activeScope)
  const blockReasonRef = useRef(blockReason)
  const serverOffsetRef = useRef(solog.serverOffsetMs)

  useEffect(() => {
    bootstrapRef.current = solog.bootstrap
    identityRef.current = identity
    activeScopeRef.current = activeScope
    serverOffsetRef.current = solog.serverOffsetMs
  }, [activeScope, identity, solog.bootstrap, solog.serverOffsetMs])

  useEffect(() => {
    blockReasonRef.current = blockReason
  }, [blockReason])

  const invalidateOperationalCaches = useCallback(() => {
    operationalCachesRef.current = {}
  }, [])

  const fetchOperationalStatus = useCallback(async (): Promise<{
    status: CajeroStatusResponse
    reason: CajeroBlockReason | null
  }> => {
    let request = statusRequestRef.current
    if (!request) {
      request = getCajeroStatus({ device_token: getOrCreateDeviceToken() })
      statusRequestRef.current = request
    }

    try {
      const status = await request
      updateServerNow(status.server_now)
      setOperationalStatus(status)

      if (
        shouldInvalidateCajeroCaches(
          operationalCachesRef.current,
          status.snapshot_actual_id,
        )
      ) {
        invalidateOperationalCaches()
      }

      let bootstrap = bootstrapRef.current
      if (
        bootstrap &&
        bootstrap.cobertura_quincenal.completa !==
          status.cobertura_quincenal_completa
      ) {
        invalidateOperationalCaches()
        let refreshRequest = stageRefreshRef.current
        if (!refreshRequest) {
          refreshRequest = refreshSolog(true)
          stageRefreshRef.current = refreshRequest
        }
        try {
          const refreshed = await refreshRequest
          if (refreshed) {
            bootstrap = refreshed
            bootstrapRef.current = refreshed
          }
        } finally {
          if (stageRefreshRef.current === refreshRequest) {
            stageRefreshRef.current = null
          }
        }
      }

      const reason = bootstrap
        ? getCajeroStatusBlockReason(
            bootstrap,
            status,
            Date.now() + serverOffsetRef.current,
          )
        : null
      if (reason) setBlockReason(reason)
      else if (blockReasonRef.current !== 'inactive') setBlockReason(null)
      return { status, reason }
    } finally {
      if (statusRequestRef.current === request) statusRequestRef.current = null
    }
  }, [invalidateOperationalCaches, refreshSolog, updateServerNow])

  const getCachedOperationalGroups = useCallback(
    (view: CajeroCachedView): CajeroGroupsResponse | null =>
      operationalCachesRef.current[view]?.response ?? null,
    [],
  )

  const loadOperationalGroups = useCallback(
    async (view: CajeroCachedView): Promise<CajeroGroupsResponse | null> => {
      if (!activeScopeRef.current) return null
      const { status, reason } = await fetchOperationalStatus()
      if (reason) return null

      const cached = getReusableCajeroGroups(
        operationalCachesRef.current[view],
        status.snapshot_actual_id,
      )
      if (cached) return cached

      const response = await getCajeroGroups({
        device_token: getOrCreateDeviceToken(),
        vista: view,
      })
      if (response.stock_actualizado) {
        setBlockReason('stock_updated')
        invalidateOperationalCaches()
        return null
      }

      operationalCachesRef.current[view] = {
        snapshotId: status.snapshot_actual_id,
        response,
      }
      return response
    },
    [fetchOperationalStatus, invalidateOperationalCaches],
  )
  const getCachedHistory = useCallback(
    (period: CajeroHistoryPeriod): CajeroHistoryResponse | null =>
      historyCachesRef.current[period] ?? null,
    [],
  )

  const loadHistory = useCallback(
    async (period: CajeroHistoryPeriod): Promise<CajeroHistoryResponse> => {
      const cached = historyCachesRef.current[period]
      if (cached) return cached

      let request = historyRequestsRef.current[period]
      if (!request) {
        request = getCajeroHistory({
          device_token: getOrCreateDeviceToken(),
          periodo: period,
        })
        historyRequestsRef.current[period] = request
      }

      try {
        const response = await request
        historyCachesRef.current[period] = response
        updateServerNow(response.server_now)
        return response
      } catch (historyError) {
        if (isSologApiErrorCode(historyError, 'SOLOG_DEVICE_NOT_AUTHORIZED')) {
          await refreshSolog(true)
        }
        throw historyError
      } finally {
        if (historyRequestsRef.current[period] === request) {
          delete historyRequestsRef.current[period]
        }
      }
    },
    [refreshSolog, updateServerNow],
  )
  const finishActiveSession = useCallback(async (): Promise<void> => {
    const scope = activeScopeRef.current
    if (!scope) return

    try {
      await finishCajeroSession({
        device_token: getOrCreateDeviceToken(),
        conteo_id: scope.conteo_id,
      })
      invalidateOperationalCaches()
    } catch (finishError) {
      if (
        !isSologApiErrorCode(
          finishError,
          'SOLOG_COUNT_EXPIRED',
          'SOLOG_COUNT_NOT_ACTIVE',
          'SOLOG_COUNT_NOT_AVAILABLE',
        )
      ) {
        throw finishError
      }
    }
  }, [invalidateOperationalCaches])

  const sendPendingInternal = useCallback(
    async (reason: CajeroBlockReason | null = null): Promise<boolean> => {
      if (sendingRef.current) return false
      sendingRef.current = true
      setSending(true)
      setError(null)

      try {
        const statusCheck = await fetchOperationalStatus()
        if (statusCheck.reason) {
          reason = reason ?? statusCheck.reason
          setBlockReason(reason)
        }

        const currentIdentity = identityRef.current
        if (!currentIdentity) return false
        const currentBuffers = readCajeroBuffersForIdentity(currentIdentity)
        let allConfirmed = true

        for (const buffer of currentBuffers) {
          let payload = buildNextCajeroBatch(
            buffer.scope,
            getOrCreateDeviceToken(),
          )
          while (payload) {
            const response = await saveCajeroBatch(payload)
            updateServerNow(response.server_now)
            if (response.guardados > 0 || response.ya_guardados > 0) {
              invalidateOperationalCaches()
            }
            if (response.stock_actualizado || response.requiere_nueva_sesion) {
              reason = 'stock_updated'
              setBlockReason('stock_updated')
            } else if (response.sesion_expirada) {
              reason = 'expired'
              setBlockReason('expired')
            }
            const application = applyCajeroBatchResponse(buffer.scope, response)
            const confirmedGroupIds = [...new Set(response.items.map((item) => item.grupo_id))]
            if (confirmedGroupIds.length > 0) {
              setConfirmedGroups((current) => ({
                conteoId: buffer.scope.conteo_id,
                ids: current.conteoId === buffer.scope.conteo_id
                  ? [...new Set([...current.ids, ...confirmedGroupIds])]
                  : confirmedGroupIds,
              }))
            }
            if (
              application.remaining.items.length > 0 ||
              application.unassociatedErrors.length > 0
            ) {
              allConfirmed = false
              break
            }
            payload = buildNextCajeroBatch(
              buffer.scope,
              getOrCreateDeviceToken(),
            )
          }
        }

        if (!allConfirmed) {
          setError('Algunos conteos no pudieron enviarse. Revisa y reintenta el envío.')
          return false
        }

        if (reason === 'inactive' || reason === 'stock_updated') {
          await finishActiveSession()
          const afterFinish = await refreshSolog(true)
          if (
            reason === 'stock_updated' &&
            afterFinish?.stock.disponible &&
            afterFinish.stock.puede_iniciar_conteo &&
            !afterFinish.sesion_activa
          ) {
            const started = await startCajeroSession({
              device_token: getOrCreateDeviceToken(),
            })
            updateServerNow(started.server_now)
            await refreshSolog(true)
          }
          solog.setNotice(
            reason === 'inactive'
              ? 'Conteo enviado. La sesión se cerró por inactividad.'
              : 'Conteo enviado. Puedes continuar con el stock actualizado.',
          )
        } else if (reason === 'expired') {
          await refreshSolog(true)
        }

        return true
      } catch (sendError) {
        setError(getSologErrorMessageFromUnknown(sendError))
        if (
          isSologApiErrorCode(
            sendError,
            'SOLOG_DEVICE_NOT_AUTHORIZED',
            'SOLOG_COUNT_EXPIRED',
            'SOLOG_COUNT_NOT_ACTIVE',
          )
        ) {
          await refreshSolog(true)
        }
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [
      fetchOperationalStatus,
      finishActiveSession,
      invalidateOperationalCaches,
      refreshSolog,
      solog,
      updateServerNow,
    ],
  )

  const checkFreshness = useCallback(
    async (autoSend = false): Promise<CajeroBlockReason | null> => {
      try {
        const { reason } = await fetchOperationalStatus()
        if (reason && autoSend) void sendPendingInternal(reason)
        return reason
      } catch (statusError) {
        setError(getSologErrorMessageFromUnknown(statusError))
        if (isSologApiErrorCode(statusError, 'SOLOG_DEVICE_NOT_AUTHORIZED')) {
          await refreshSolog(true)
        }
        return blockReasonRef.current
      }
    },
    [fetchOperationalStatus, refreshSolog, sendPendingInternal],
  )

  useEffect(() => {
    const scope = activeScope
    if (!scope || blockReason) return

    let inactivityTimer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      const lastActivity = readLastActivity(scope)
      const remaining = Math.max(
        0,
        CAJERO_INACTIVITY_MS - (Date.now() - lastActivity),
      )
      inactivityTimer = setTimeout(() => {
        setBlockReason('inactive')
        void sendPendingInternal('inactive')
      }, remaining)
    }
    const registerActivity = () => {
      const now = Date.now()
      writeLastActivity(scope, now)
      schedule()
    }
    if (!sessionStorage.getItem(getActivityKey(scope))) registerActivity()
    else schedule()

    window.addEventListener('pointerdown', registerActivity, { passive: true })
    window.addEventListener('keydown', registerActivity)
    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      window.removeEventListener('pointerdown', registerActivity)
      window.removeEventListener('keydown', registerActivity)
    }
  }, [activeScope, blockReason, sendPendingInternal])

  useEffect(() => {
    const session = solog.bootstrap?.sesion_activa
    if (!session || blockReason) return
    const expiration = Date.parse(session.expira_at)
    if (Number.isNaN(expiration)) return
    const remaining = Math.max(
      0,
      expiration - (Date.now() + solog.serverOffsetMs),
    )
    const timer = setTimeout(() => {
      setBlockReason('expired')
      void sendPendingInternal('expired')
    }, remaining)
    return () => clearTimeout(timer)
  }, [blockReason, sendPendingInternal, solog.bootstrap?.sesion_activa, solog.serverOffsetMs])

  useEffect(() => {
    const handleReturn = () => {
      if (document.visibilityState !== 'visible') return
      const scope = activeScopeRef.current
      if (scope && isCajeroInactive(readLastActivity(scope), Date.now())) {
        setBlockReason('inactive')
        void sendPendingInternal('inactive')
        return
      }
      void checkFreshness(true)
    }

    window.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleReturn)
    return () => {
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleReturn)
    }
  }, [checkFreshness, sendPendingInternal])

  const handleStockUpdateDetected = useCallback(() => {
    setBlockReason('stock_updated')
    void sendPendingInternal('stock_updated')
  }, [sendPendingInternal])

  const startSession = useCallback(async (): Promise<boolean> => {
    if (starting || sendingRef.current) return false
    if (bootstrapRef.current?.sesion_activa) return true
    const currentIdentity = identityRef.current
    if (
      currentIdentity &&
      readCajeroBuffersForIdentity(currentIdentity).some(
        (buffer) => buffer.items.length > 0,
      )
    ) {
      setError('Envía los conteos pendientes antes de iniciar una nueva sesión.')
      return false
    }

    setStarting(true)
    setError(null)
    try {
      const response = await startCajeroSession({
        device_token: getOrCreateDeviceToken(),
      })
      updateServerNow(response.server_now)
      invalidateOperationalCaches()
      setOperationalStatus(null)
      await refreshSolog(true)
      setBlockReason(null)
      return true
    } catch (startError) {
      setError(getSologErrorMessageFromUnknown(startError))
      if (
        isSologApiErrorCode(
          startError,
          'SOLOG_ACTIVE_COUNT_EXISTS',
          'SOLOG_DEVICE_NOT_AUTHORIZED',
        )
      ) {
        await refreshSolog(true)
      }
      return false
    } finally {
      setStarting(false)
    }
  }, [
    invalidateOperationalCaches,
    refreshSolog,
    starting,
    updateServerNow,
  ])

  const logoutSafely = useCallback(async (): Promise<boolean> => {
    const sent = await sendPendingInternal(blockReasonRef.current)
    const currentIdentity = identityRef.current
    if (
      currentIdentity &&
      readCajeroBuffersForIdentity(currentIdentity).some(
        (buffer) => buffer.items.length > 0,
      )
    ) {
      return false
    }

    try {
      await finishActiveSession()
      await onLogout()
      return sent || pendingCount === 0
    } catch (logoutError) {
      setError(getSologErrorMessageFromUnknown(logoutError))
      return false
    }
  }, [finishActiveSession, onLogout, pendingCount, sendPendingInternal])

  const fortnightComplete =
    operationalStatus?.cobertura_quincenal_completa ??
    solog.bootstrap?.cobertura_quincenal.completa ??
    false
  const dailyPending =
    operationalStatus?.conteo_diario_pendientes ??
    solog.bootstrap?.vistas_inteligentes.conteo_diario?.cantidad ??
    0
  const reviewPending =
    operationalStatus?.revisar_pendientes ??
    solog.bootstrap?.vistas_inteligentes.revisar?.cantidad ??
    solog.bootstrap?.vistas_inteligentes.seguimiento.cantidad ??
    0
  const confirmedGroupIds =
    confirmedGroups.conteoId === activeScope?.conteo_id
      ? confirmedGroups.ids
      : []
  return {
    activeScope,
    blockReason,
    canCapture:
      Boolean(activeScope) &&
      solog.bootstrap?.stock.disponible === true &&
      blockReason === null &&
      !sending,
    error,
    pendingCount,
    operationalStatus,
    fortnightComplete,
    dailyPending,
    reviewPending,
    confirmedGroupIds,
    getCachedOperationalGroups,
    loadOperationalGroups,
    invalidateOperationalCaches,
    getCachedHistory,
    loadHistory,
    sending,
    starting,
    startSession,
    sendPending: () => sendPendingInternal(null),
    retrySend: () => sendPendingInternal(blockReasonRef.current),
    checkFreshness,
    logoutSafely,
    handleStockUpdateDetected,
    clearError: () => setError(null),
  }
}