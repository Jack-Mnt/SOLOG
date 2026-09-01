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
  SologApiError,
  isSologApiErrorCode,
} from '../errors'
import { useSolog } from '../context'
import type { SologOperationalBootstrap } from '../types'
import {
  finishCajeroSession,
  getCajeroGroups,
  getCajeroHistory,
  getCajeroStatus,
  saveCajeroBatch,
  startCajeroSession,
  startCajeroRecount,
  saveCajeroRecount,
} from './cajero.api'
import {
  applyCajeroBatchResponse,
  clearCajeroBuffer,
  discardLegacyCajeroBuffers,
  buildNextCajeroBatch,
  getCajeroBufferRevision,
  readCajeroBuffersForIdentity,
  readCajeroRecountAttemptsForIdentity,
  removeCajeroRecountAttempt,
  removeCajeroRecountAttemptsForScope,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import { recoverExpiredCajeroContext } from './cajero.recovery'
import { getCajeroStartRestriction } from './cajero.stock'
import type {
  CajeroRecountStartResponse,
  CajeroRecountResponse,
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
  checkFreshness: () => Promise<CajeroBlockReason | null>
  logoutSafely: () => Promise<boolean>
  operationalStatus: CajeroStatusResponse | null
  periodComplete: boolean
  dailyPending: number
  reviewPending: number
  cacheRevision: number
  captureTimestamp: () => string
  beginRecount: (detalleId: string) => Promise<CajeroRecountStartResponse>
  saveRecount: (detalleId: string, physical: number, timestamp: string) => Promise<CajeroRecountResponse>
  getCachedOperationalGroups: (view: CajeroCachedView) => CajeroGroupsResponse | null
  loadOperationalGroups: (view: CajeroCachedView) => Promise<CajeroGroupsResponse | null>
  invalidateOperationalCaches: () => void
  getCachedHistory: (period: CajeroHistoryPeriod) => CajeroHistoryResponse | null
  loadHistory: (period: CajeroHistoryPeriod) => Promise<CajeroHistoryResponse>
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
  const [cacheRevision, setCacheRevision] = useState(0)
  const [operationalStatus, setOperationalStatus] = useState<CajeroStatusResponse | null>(null)
  const sendingRef = useRef(false)
  const generationRef = useRef(0)
  const latestStatusRef = useRef<CajeroStatusResponse | null>(null)
  const recountsRef = useRef(new Map<string, Promise<CajeroRecountStartResponse>>())
  const statusRequestRef = useRef<Promise<CajeroStatusResponse> | null>(null)
  const stageRefreshRef = useRef<Promise<SologOperationalBootstrap | null> | null>(null)
  const operationalCachesRef = useRef<Partial<Record<CajeroCachedView, CajeroGroupsCacheEntry>>>({})
  const historyCachesRef = useRef<Partial<Record<CajeroHistoryPeriod, CajeroHistoryResponse>>>({})
  const historyRequestsRef = useRef<Partial<Record<CajeroHistoryPeriod, Promise<CajeroHistoryResponse>>>>({})
  const recoveryRef = useRef<Promise<boolean> | null>(null)
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
    generationRef.current += 1
    operationalCachesRef.current = {}
    historyCachesRef.current = {}
    historyRequestsRef.current = {}
    statusRequestRef.current = null
    setCacheRevision((current) => current + 1)
  }, [])

  useEffect(() => {
    discardLegacyCajeroBuffers()
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      invalidateOperationalCaches()
      latestStatusRef.current = null
      statusRequestRef.current = null
      setOperationalStatus(null)
      recountsRef.current.clear()
    })
  }, [activeScope?.conteo_id, identity?.usuario_id, identity?.sede_id, identity?.dispositivo_id, invalidateOperationalCaches])

  const fetchOperationalStatus = useCallback(async function fetchStatus(): Promise<{
    status: CajeroStatusResponse
    reason: CajeroBlockReason | null
  }> {
    const requestedScope = activeScopeRef.current
    const requestedGeneration = generationRef.current
    let request = statusRequestRef.current
    if (!request) {
      request = getCajeroStatus({ device_token: getOrCreateDeviceToken() })
      statusRequestRef.current = request
    }

    try {
      let status = await request
      if (!isCurrentCajeroResponse(requestedScope, activeScopeRef.current, 0, 0)) {
        throw new Error('La sesión cambió durante la consulta de estado.')
      }
      if (requestedGeneration !== generationRef.current) return fetchStatus()
      // Una respuesta anterior no puede reinstalar el snapshot ni los contadores viejos.
      const latest = latestStatusRef.current
      if (latest && Date.parse(latest.server_now) > Date.parse(status.server_now)) status = latest
      latestStatusRef.current = status
      updateServerNow(status.server_now)
      setOperationalStatus(status)

      if (
        (latest && (
          latest.snapshot_actual_id !== status.snapshot_actual_id ||
          latest.conteo_id !== status.conteo_id ||
          latest.conteo_diario_pendientes !== status.conteo_diario_pendientes ||
          latest.revisar_pendientes !== status.revisar_pendientes
        )) ||
        shouldInvalidateCajeroCaches(operationalCachesRef.current, status.snapshot_actual_id)
      ) {
        invalidateOperationalCaches()
      }

      let bootstrap = bootstrapRef.current
      if (
        bootstrap &&
        (bootstrap.cobertura_periodo.completa !== status.cobertura_periodo_completa ||
          bootstrap.stock.snapshot_id !== status.snapshot_actual_id ||
          (bootstrap.sesion_activa?.id ?? null) !== status.conteo_id)
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

      const generation = generationRef.current
      const scope = activeScopeRef.current
      const response = await getCajeroGroups({
        device_token: getOrCreateDeviceToken(),
        vista: view,
      })
      if (!isCurrentCajeroResponse(scope, activeScopeRef.current, generation, generationRef.current)) return null
      if (response.conteo_id !== scope?.conteo_id) return null
      if (response.snapshot_actual_id !== status.snapshot_actual_id) {
        invalidateOperationalCaches()
        void fetchOperationalStatus().catch((statusError: unknown) => setError(getSologErrorMessageFromUnknown(statusError)))
        return null
      }
      updateServerNow(response.server_now)
      operationalCachesRef.current[view] = {
        snapshotId: response.snapshot_actual_id,
        response,
      }
      return response
    },
    [fetchOperationalStatus, invalidateOperationalCaches, updateServerNow],
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

      const generation = generationRef.current
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
        if (generation !== generationRef.current) throw new Error('La vista cambió durante la consulta. Actualiza el historial.')
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
  const finishSessionScope = useCallback(async (scope: CajeroBufferScope): Promise<void> => {
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

  const finishActiveSession = useCallback(async (): Promise<void> => {
    const scope = activeScopeRef.current
    if (scope) await finishSessionScope(scope)
  }, [finishSessionScope])

  const handleInactivity = useCallback(async (): Promise<void> => {
    const currentIdentity = identityRef.current
    const hasPending = currentIdentity
      ? readCajeroBuffersForIdentity(currentIdentity).some(
          (buffer) => buffer.items.length > 0,
        )
      : false

    if (hasPending) {
      setBlockReason('inactive')
      return
    }

    try {
      await finishActiveSession()
      await refreshSolog(true)
      setBlockReason(null)
    } catch (inactivityError) {
      setError(getSologErrorMessageFromUnknown(inactivityError))
      setBlockReason('inactive')
    }
  }, [finishActiveSession, refreshSolog])

  const sendPendingInternal = useCallback(
    async (reason: CajeroBlockReason | null = null): Promise<boolean> => {
      if (sendingRef.current) return false
      sendingRef.current = true
      setSending(true)
      setError(null)

      try {
        // El envío de pendientes no exige una sesión activa ni snapshot actual.
        // La elegibilidad temporal corresponde al backend y a la sesión original.
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
            let response
            try {
              response = await saveCajeroBatch(payload)
            } catch (sendError) {
              if (isSologApiErrorCode(sendError, 'SOLOG_EXPIRED_SESSION_SUPERSEDED')) {
                clearCajeroBuffer(buffer.scope)
                removeCajeroRecountAttemptsForScope(buffer.scope)
              }
              throw sendError
            }
            updateServerNow(response.server_now)
            if (response.guardados > 0 || response.ya_guardados > 0) {
              invalidateOperationalCaches()
            }
            const application = applyCajeroBatchResponse(buffer.scope, response)
            if (response.errores.some((item) => item.codigo === 'SOLOG_EXPIRED_SESSION_SUPERSEDED')) {
              clearCajeroBuffer(buffer.scope)
              removeCajeroRecountAttemptsForScope(buffer.scope)
              throw new SologApiError('SOLOG_EXPIRED_SESSION_SUPERSEDED')
            }
            if (
              application.rejectedIds.length > 0 ||
              application.confirmedIds.length === 0 ||
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
          setError((current) => current ?? 'Algunos conteos no pudieron enviarse. Revisa y reintenta el envío.')
          await fetchOperationalStatus()
          await refreshSolog(true)
          return false
        }

        if (reason === 'inactive') {
          await finishActiveSession()
          solog.setNotice('Conteo enviado. La sesión se cerró por inactividad.')
        }
        await refreshSolog(true)
        await fetchOperationalStatus()

        return true
      } catch (sendError) {
        setError(getSologErrorMessageFromUnknown(sendError))
        if (
          isSologApiErrorCode(
            sendError,
            'SOLOG_DEVICE_NOT_AUTHORIZED',
            'SOLOG_COUNT_EXPIRED',
            'SOLOG_COUNT_NOT_ACTIVE',
            'SOLOG_EXPIRED_SESSION_SUPERSEDED',
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

  const recoverExpiredContexts = useCallback(async (): Promise<boolean> => {
    if (recoveryRef.current) return recoveryRef.current

    const recovery = (async () => {
      if (sendingRef.current) return false
      const currentIdentity = identityRef.current
      if (!currentIdentity) return false

      const currentSession = bootstrapRef.current?.sesion_activa ?? null
      const serverNow = Date.now() + serverOffsetRef.current
      const sessionExpiration = currentSession
        ? Date.parse(currentSession.expira_at)
        : Number.NaN
      if (currentSession && (Number.isNaN(sessionExpiration) || serverNow < sessionExpiration)) {
        return false
      }

      const buffers = readCajeroBuffersForIdentity(currentIdentity)
      const recountAttempts = readCajeroRecountAttemptsForIdentity(currentIdentity)
      const scopes = new Map<string, CajeroBufferScope>()
      buffers.forEach((buffer) => scopes.set(buffer.scope.conteo_id, buffer.scope))
      recountAttempts.forEach((attempt) => scopes.set(attempt.scope.conteo_id, attempt.scope))
      if (scopes.size === 0) return true

      sendingRef.current = true
      setSending(true)
      setError(null)
      let discarded = false
      let superseded = false

      try {
        for (const scope of scopes.values()) {
          const result = await recoverExpiredCajeroContext({
            synchronize: async () => {
              let hasRemaining = false
              const payload = buildNextCajeroBatch(scope, getOrCreateDeviceToken())
              if (payload) {
                const response = await saveCajeroBatch(payload)
                updateServerNow(response.server_now)
                if (response.errores.some((item) => item.codigo === 'SOLOG_EXPIRED_SESSION_SUPERSEDED')) {
                  return 'superseded'
                }
                const application = applyCajeroBatchResponse(scope, response)
                if (response.guardados > 0 || response.ya_guardados > 0) {
                  invalidateOperationalCaches()
                }
                hasRemaining = application.remaining.items.length > 0
              }

              const storedRecounts = readCajeroRecountAttemptsForIdentity(currentIdentity)
                .filter((attempt) => attempt.scope.conteo_id === scope.conteo_id)
              for (const attempt of storedRecounts) {
                await saveCajeroRecount({
                  device_token: getOrCreateDeviceToken(),
                  ...attempt.payload,
                })
                removeCajeroRecountAttempt(scope, attempt.detalle_id)
                invalidateOperationalCaches()
              }

              return hasRemaining ? 'remaining' : 'complete'
            },
            clearRemaining: () => {
              clearCajeroBuffer(scope)
              removeCajeroRecountAttemptsForScope(scope)
            },
            closeContext: () => finishSessionScope(scope),
            isSupersededError: (recoveryError) =>
              isSologApiErrorCode(
                recoveryError,
                'SOLOG_EXPIRED_SESSION_SUPERSEDED',
              ),
          })
          discarded ||= result.outcome === 'discarded'
          superseded ||= result.outcome === 'superseded'
        }

        invalidateOperationalCaches()
        await refreshSolog(true)
        setBlockReason(null)
        if (superseded) {
          setError(getSologErrorMessageFromUnknown(
            new SologApiError('SOLOG_EXPIRED_SESSION_SUPERSEDED'),
          ))
        } else if (discarded) {
          setError('No se pudieron recuperar todos los conteos pendientes. El remanente se limpió para continuar con una sesión nueva.')
        } else {
          solog.setNotice('Los conteos pendientes de la sesión anterior se sincronizaron correctamente.')
        }
        return !discarded && !superseded
      } catch (recoveryError) {
        setError(getSologErrorMessageFromUnknown(recoveryError))
        await refreshSolog(true)
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    })()

    recoveryRef.current = recovery
    try {
      return await recovery
    } finally {
      if (recoveryRef.current === recovery) recoveryRef.current = null
    }
  }, [finishSessionScope, invalidateOperationalCaches, refreshSolog, solog, updateServerNow])

  const checkFreshness = useCallback(
    async (): Promise<CajeroBlockReason | null> => {
      try {
        const { reason } = await fetchOperationalStatus()
        return reason
      } catch (statusError) {
        setError(getSologErrorMessageFromUnknown(statusError))
        if (isSologApiErrorCode(statusError, 'SOLOG_DEVICE_NOT_AUTHORIZED')) {
          await refreshSolog(true)
        }
        return blockReasonRef.current
      }
    },
    [fetchOperationalStatus, refreshSolog],
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
        void handleInactivity()
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
  }, [activeScope, blockReason, handleInactivity])

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
      void refreshSolog(true)
    }, remaining)
    return () => clearTimeout(timer)
  }, [blockReason, refreshSolog, solog.bootstrap?.sesion_activa, solog.serverOffsetMs])

  useEffect(() => {
    const currentIdentity = identity
    if (!currentIdentity) return
    const session = solog.bootstrap?.sesion_activa ?? null
    const expiration = session ? Date.parse(session.expira_at) : Number.NaN
    const sessionExpired = session !== null && !Number.isNaN(expiration) &&
      Date.now() + solog.serverOffsetMs >= expiration
    if (session && !sessionExpired && blockReason !== 'expired') return

    const hasPendingBuffers = readCajeroBuffersForIdentity(currentIdentity).length > 0
    const hasPendingRecounts = readCajeroRecountAttemptsForIdentity(currentIdentity).length > 0
    if (!hasPendingBuffers && !hasPendingRecounts) return

    queueMicrotask(() => {
      void recoverExpiredContexts()
    })
  }, [blockReason, identity, pendingCount, recoverExpiredContexts, solog.bootstrap?.sesion_activa, solog.serverOffsetMs])

  useEffect(() => {
    const handleReturn = () => {
      if (document.visibilityState !== 'visible') return

      const scope = activeScopeRef.current
      if (scope && isCajeroInactive(readLastActivity(scope), Date.now())) {
        void handleInactivity()
        return
      }

      void checkFreshness()
    }

    window.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleReturn)
    return () => {
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleReturn)
    }
  }, [checkFreshness, handleInactivity])

  const captureTimestamp = useCallback((): string => {
    const bootstrap = bootstrapRef.current
    const now = Date.now() + serverOffsetRef.current
    if (!bootstrap?.sesion_activa || getCajeroSessionBlockReason(bootstrap, now) ||
        blockReasonRef.current || sendingRef.current) {
      throw new Error('La sesión no permite nuevas capturas. Los pendientes conservan su fecha original.')
    }
    return new Date(now).toISOString()
  }, [])

  const beginRecount = useCallback(async (detalleId: string): Promise<CajeroRecountStartResponse> => {
    captureTimestamp()
    const scope = activeScopeRef.current
    if (!scope || !detalleId) throw new Error('No hay una sesión o detalle para recontar.')
    const key = scope.conteo_id + ':' + detalleId
    let request = recountsRef.current.get(key)
    const isNewRequest = !request
    if (!request) {
      request = startCajeroRecount({
        device_token: getOrCreateDeviceToken(),
        conteo_id: scope.conteo_id,
        detalle_id: detalleId,
      })
      recountsRef.current.set(key, request)
    }
    try {
      const response = await request
      if (activeScopeRef.current?.conteo_id !== scope.conteo_id ||
          response.conteo_id !== scope.conteo_id || response.detalle_id !== detalleId) {
        throw new Error('La respuesta de reconteo no pertenece a la sesión y detalle actuales.')
      }
      if (isNewRequest) {
        updateServerNow(response.server_now)
        serverOffsetRef.current = Date.parse(response.server_now) - Date.now()
      }
      return response
    } catch (recountError) {
      recountsRef.current.delete(key)
      throw recountError
    }
  }, [captureTimestamp, updateServerNow])

  const saveRecount = useCallback(async (
    detalleId: string, physical: number, timestamp: string,
  ): Promise<CajeroRecountResponse> => {
    captureTimestamp()
    const scope = activeScopeRef.current
    if (!scope) throw new Error('No hay sesión activa para recontar.')
    const key = scope.conteo_id + ':' + detalleId
    const started = recountsRef.current.get(key)
    if (!started) throw new Error('Debes iniciar este reconteo antes de guardarlo.')
    const reference = await started
    captureTimestamp()
    if (!isCurrentCajeroResponse(scope, activeScopeRef.current, 0, 0)) {
      throw new Error('La sesión cambió antes de guardar el reconteo.')
    }
    if (sendingRef.current) throw new Error('Hay un envío en curso.')
    sendingRef.current = true
    setSending(true)
    try {
      const response = await saveCajeroRecount({
        device_token: getOrCreateDeviceToken(),
        conteo_id: scope.conteo_id,
        detalle_id: detalleId,
        stock_fisico: physical,
        contado_at: timestamp,
      })
      if (response.conteo_id !== scope.conteo_id || response.detalle_id !== detalleId ||
          response.snapshot_reconteo_id !== reference.snapshot_reconteo_id) {
        throw new Error('La respuesta no corresponde al reconteo iniciado.')
      }
      recountsRef.current.delete(key)
      invalidateOperationalCaches()
      // La respuesta guardada es definitiva, aunque falle luego una actualización visual.
      void refreshSolog(true)
      void fetchOperationalStatus().catch((refreshError: unknown) => setError(getSologErrorMessageFromUnknown(refreshError)))
      return response
    } catch (recountError) {
      recountsRef.current.delete(key)
      invalidateOperationalCaches()
      // No repetir recount automáticamente: volver a consultar elegibilidad/reanudar.
      throw recountError
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [captureTimestamp, fetchOperationalStatus, invalidateOperationalCaches, refreshSolog])

  const startSession = useCallback(async (): Promise<boolean> => {
    if (starting || sendingRef.current) return false
    if (bootstrapRef.current?.sesion_activa) return true
    const stock = bootstrapRef.current?.stock
    const startRestriction = stock
      ? getCajeroStartRestriction(stock, Date.now() + serverOffsetRef.current)
      : 'stock_expired'
    if (startRestriction) {
      setError(startRestriction === 'stock_expired'
        ? 'Actualiza el inventario desde ConeXion para comenzar un nuevo conteo.'
        : 'El stock está próximo a vencer. Actualiza el inventario antes de iniciar un nuevo conteo.')
      return false
    }
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
          'SOLOG_STOCK_EXPIRED',
          'SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY',
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
    const currentIdentity = identityRef.current
    if (
      currentIdentity &&
      readCajeroBuffersForIdentity(currentIdentity).some(
        (buffer) => buffer.items.length > 0,
      )
    ) {
      setError('Envía los conteos pendientes antes de cerrar sesión.')
      return false
    }

    try {
      await finishActiveSession()
      await onLogout()
      return true
    } catch (logoutError) {
      setError(getSologErrorMessageFromUnknown(logoutError))
      return false
    }
  }, [finishActiveSession, onLogout])

  const periodComplete =
    operationalStatus?.cobertura_periodo_completa ??
    solog.bootstrap?.cobertura_periodo.completa ??
    false
  const dailyPending =
    operationalStatus?.conteo_diario_pendientes ??
    solog.bootstrap?.vistas_inteligentes.conteo_diario?.cantidad ??
    0
  const reviewPending =
    operationalStatus?.revisar_pendientes ??
    solog.bootstrap?.vistas_inteligentes.revisar?.cantidad ??
    0
  return {
    activeScope,
    blockReason,
    canCapture:
      Boolean(activeScope) &&
      solog.bootstrap?.stock.disponible === true &&
      solog.bootstrap.stock.vigente &&
      blockReason === null &&
      !sending,
    error,
    pendingCount,
    operationalStatus,
    periodComplete,
    dailyPending,
    reviewPending,
    cacheRevision,
    captureTimestamp,
    beginRecount,
    saveRecount,
    getCachedOperationalGroups,
    loadOperationalGroups,
    invalidateOperationalCaches,
    getCachedHistory,
    loadHistory,
    sending,
    starting,
    startSession,
    sendPending: () =>
      (!activeScopeRef.current || blockReasonRef.current === 'expired')
        ? recoverExpiredContexts()
        : sendPendingInternal(null),
    retrySend: () =>
      (!activeScopeRef.current || blockReasonRef.current === 'expired')
        ? recoverExpiredContexts()
        : sendPendingInternal(blockReasonRef.current),
    checkFreshness,
    logoutSafely,
    clearError: () => setError(null),
  }
}
