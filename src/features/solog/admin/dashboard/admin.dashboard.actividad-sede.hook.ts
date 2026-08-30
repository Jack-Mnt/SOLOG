import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologDashboardSiteActivity } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type { SologDashboardSiteActivityResponse } from '../../types'

type SiteActivityStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useSologDashboardSiteActivity(
  refreshOperationalState: () => Promise<void>,
) {
  const [status, setStatus] = useState<SiteActivityStatus>('idle')
  const [data, setData] = useState<SologDashboardSiteActivityResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const currentSiteId = useRef<string | null>(null)
  const requestInFlight = useRef<{
    siteId: string
    promise: Promise<SologDashboardSiteActivityResponse>
  } | null>(null)

  const requestActivity = useCallback((siteId: string) => {
    if (requestInFlight.current?.siteId === siteId) {
      return requestInFlight.current.promise
    }

    const promise = getSologDashboardSiteActivity(siteId).finally(() => {
      if (requestInFlight.current?.promise === promise) {
        requestInFlight.current = null
      }
    })
    requestInFlight.current = { siteId, promise }
    return promise
  }, [])

  const load = useCallback(async (siteId: string) => {
    const currentRequest = ++requestVersion.current
    currentSiteId.current = siteId
    setStatus('loading')
    setData(null)
    setError(null)

    try {
      const response = await requestActivity(siteId)
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
  }, [refreshOperationalState, requestActivity])

  const retry = useCallback(() => {
    if (currentSiteId.current) void load(currentSiteId.current)
  }, [load])

  useEffect(() => () => {
    requestVersion.current += 1
  }, [])

  return { status, data, error, load, retry }
}
