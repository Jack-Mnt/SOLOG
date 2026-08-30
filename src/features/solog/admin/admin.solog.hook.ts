import { useCallback, useEffect, useRef, useState } from 'react'
import {
  authorizeSologDevice,
  getSologAdminBootstrap,
  revokeSologDevice,
} from '../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../errors'
import type { SologAdminBootstrap } from '../types'

type AdminStatus = 'idle' | 'loading' | 'ready' | 'error'
type AdminMutationAction = 'authorize' | 'revoke' | 'reject'

export interface AdminMutation {
  action: AdminMutationAction
  deviceId: string
}

interface UseAdminSologOptions {
  enabled: boolean
  refreshOperationalState: () => Promise<void>
}

interface LoadOptions {
  preserveError?: boolean
  preserveView?: boolean
}

export function useAdminSolog({
  enabled,
  refreshOperationalState,
}: UseAdminSologOptions) {
  const [status, setStatus] = useState<AdminStatus>('idle')
  const [bootstrap, setBootstrap] = useState<SologAdminBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mutation, setMutation] = useState<AdminMutation | null>(null)
  const requestVersion = useRef(0)
  const mutationInProgress = useRef(false)

  const load = useCallback(
    async ({ preserveError = false, preserveView = false }: LoadOptions = {}) => {
      const currentRequest = ++requestVersion.current

      if (!enabled) {
        setStatus('idle')
        setBootstrap(null)
        return
      }

      if (!preserveView) setStatus('loading')
      if (!preserveError) setError(null)

      try {
        const nextBootstrap = await getSologAdminBootstrap()
        if (currentRequest !== requestVersion.current) return
        setBootstrap(nextBootstrap)
        setStatus('ready')
      } catch (loadError) {
        if (currentRequest !== requestVersion.current) return

        setError(getSologErrorMessageFromUnknown(loadError))
        if (!preserveView) setBootstrap(null)
        setStatus('error')

        if (isSologApiErrorCode(loadError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
          await refreshOperationalState()
        }
      }
    },
    [enabled, refreshOperationalState],
  )

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      if (active) void load()
    })

    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [load])

  const runMutation = useCallback(
    async (
      nextMutation: AdminMutation,
      successMessage: string,
      operation: () => Promise<unknown>,
    ) => {
      if (mutationInProgress.current) return

      mutationInProgress.current = true
      setMutation(nextMutation)
      setError(null)
      setNotice(null)

      try {
        await operation()
        setNotice(successMessage)
        await load({ preserveView: true })
      } catch (mutationError) {
        setError(getSologErrorMessageFromUnknown(mutationError))

        if (isSologApiErrorCode(mutationError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
          await refreshOperationalState()
        } else if (
          isSologApiErrorCode(
            mutationError,
            'SOLOG_PENDING_DEVICE_NOT_FOUND',
            'SOLOG_DEVICE_NOT_REVOCABLE',
          )
        ) {
          await load({ preserveError: true, preserveView: true })
        }
      } finally {
        mutationInProgress.current = false
        setMutation(null)
      }
    },
    [load, refreshOperationalState],
  )

  const authorize = useCallback(
    (deviceId: string) =>
      runMutation(
        { action: 'authorize', deviceId },
        'Tablet autorizada correctamente.',
        () => authorizeSologDevice(deviceId),
      ),
    [runMutation],
  )

  const revoke = useCallback(
    (deviceId: string) =>
      runMutation(
        { action: 'revoke', deviceId },
        'Tablet revocada correctamente.',
        () => revokeSologDevice(deviceId),
      ),
    [runMutation],
  )

  const reject = useCallback(
    (deviceId: string) =>
      runMutation(
        { action: 'reject', deviceId },
        'Solicitud rechazada correctamente.',
        () => revokeSologDevice(deviceId),
      ),
    [runMutation],
  )

  const refresh = useCallback(async () => {
    setNotice(null)
    await load({ preserveView: bootstrap !== null })
  }, [bootstrap, load])

  return {
    status,
    bootstrap,
    error,
    notice,
    mutation,
    refresh,
    authorize,
    revoke,
    reject,
    dismissNotice: () => setNotice(null),
  }
}
