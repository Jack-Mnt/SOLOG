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
  handleStockUpdateDetected: () => void
  clearError: () => void
}

export function useCajeroSession(onLogout: () => Promise<void>): CajeroSessionController {
  const solog = useSolog()
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
  const sendingRef = useRef(false)
  const bootstrapRef = useRef(solog.bootstrap)
  const identityRef = useRef(identity)
  const activeScopeRef = useRef(activeScope)
  const blockReasonRef = useRef(blockReason)

  useEffect(() => {
    bootstrapRef.current = solog.bootstrap
    identityRef.current = identity
    activeScopeRef.current = activeScope
  }, [activeScope, identity, solog.bootstrap])

  useEffect(() => {
    blockReasonRef.current = blockReason
  }, [blockReason])


  const finishActiveSession = useCallback(async (): Promise<void> => {
    const scope = activeScopeRef.current
    if (!scope) return

    try {
      await finishCajeroSession({
        device_token: getOrCreateDeviceToken(),
        conteo_id: scope.conteo_id,
      })
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
  }, [])

  const sendPendingInternal = useCallback(
    async (reason: CajeroBlockReason | null = null): Promise<boolean> => {
      if (sendingRef.current) return false
      sendingRef.current = true
      setSending(true)
      setError(null)

      try {
        const fresh = await solog.refresh(true)
        if (fresh) {
          bootstrapRef.current = fresh
          const freshReason = getCajeroSessionBlockReason(
            fresh,
            Date.now() + solog.serverOffsetMs,
          )
          if (freshReason) {
            reason = reason ?? freshReason
            setBlockReason(reason)
          }
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
            solog.updateServerNow(response.server_now)
            if (response.stock_actualizado || response.requiere_nueva_sesion) {
              reason = 'stock_updated'
              setBlockReason('stock_updated')
            } else if (response.sesion_expirada) {
              reason = 'expired'
              setBlockReason('expired')
            }
            const application = applyCajeroBatchResponse(buffer.scope, response)
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
          const afterFinish = await solog.refresh(true)
          if (
            reason === 'stock_updated' &&
            afterFinish?.stock.disponible &&
            afterFinish.stock.puede_iniciar_conteo &&
            !afterFinish.sesion_activa
          ) {
            const started = await startCajeroSession({
              device_token: getOrCreateDeviceToken(),
            })
            solog.updateServerNow(started.server_now)
            await solog.refresh(true)
          }
          solog.setNotice(
            reason === 'inactive'
              ? 'Conteo enviado. La sesión se cerró por inactividad.'
              : 'Conteo enviado. Puedes continuar con el stock actualizado.',
          )
        } else if (reason === 'expired') {
          await solog.refresh(true)
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
          await solog.refresh(true)
        }
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [finishActiveSession, solog],
  )

  const checkFreshness = useCallback(
    async (autoSend = false): Promise<CajeroBlockReason | null> => {
      const fresh = await solog.refresh(true)
      if (!fresh) return blockReasonRef.current
      bootstrapRef.current = fresh
      const reason = getCajeroSessionBlockReason(
        fresh,
        Date.now() + solog.serverOffsetMs,
      )
      if (reason) {
        setBlockReason(reason)
        if (autoSend) void sendPendingInternal(reason)
      } else if (blockReasonRef.current !== 'inactive') {
        setBlockReason(null)
      }
      return reason
    },
    [sendPendingInternal, solog],
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
      solog.updateServerNow(response.server_now)
      await solog.refresh(true)
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
        await solog.refresh(true)
      }
      return false
    } finally {
      setStarting(false)
    }
  }, [solog, starting])

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