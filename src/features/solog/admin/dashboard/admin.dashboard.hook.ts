import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologDashboard } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type { SologDashboardResponse } from '../../types'

type DashboardStatus = 'loading' | 'ready' | 'error'

export function useSologDashboard(
  refreshOperationalState: () => Promise<void>,
) {
  const [status, setStatus] = useState<DashboardStatus>('loading')
  const [data, setData] = useState<SologDashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setError(null)

    try {
      const response = await getSologDashboard()
      if (currentRequest !== requestVersion.current) return
      setData(response)
      setStatus('ready')
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')

      if (isSologApiErrorCode(loadError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
        await refreshOperationalState()
      }
    }
  }, [refreshOperationalState])

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

  return { status, data, error, retry: load }
}
