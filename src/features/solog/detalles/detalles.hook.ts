import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSologDetailsSummary,
  requestSologDetailsAccess,
} from '../api'
import { useSolog } from '../context'
import { getOrCreateDeviceToken } from '../device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../errors'
import type { SologDetailsSummaryResponse } from '../types'

type DetailsSummaryStatus = 'loading' | 'ready' | 'error'

const REQUEST_MESSAGES = {
  DEVICE_REQUESTED: 'Solicitud enviada. El dispositivo queda pendiente de autorización.',
  DEVICE_REQUEST_ALREADY_PENDING: 'La solicitud de este dispositivo ya estaba pendiente.',
  DEVICE_ALREADY_AUTHORIZED: 'Este dispositivo ya está autorizado. El acceso operativo se habilitará con el próximo inicio de sesión.',
} as const

export function useSologDetailsSummary() {
  const { updateServerNow } = useSolog()
  const [status, setStatus] = useState<DetailsSummaryStatus>('loading')
  const [summary, setSummary] = useState<SologDetailsSummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const requestVersion = useRef(0)
  const requestAccessRunning = useRef(false)

  const loadSummary = useCallback(async (preserveFeedback = false) => {
    const version = ++requestVersion.current
    if (!preserveFeedback) {
      setError(null)
      setNotice(null)
      setStatus('loading')
    }

    try {
      const response = await getSologDetailsSummary(getOrCreateDeviceToken())
      if (version !== requestVersion.current) return null

      updateServerNow(response.server_now)
      setSummary(response)
      setStatus('ready')
      return response
    } catch (loadError) {
      if (version !== requestVersion.current) return null

      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')
      return null
    }
  }, [updateServerNow])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadSummary()
    })

    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [loadSummary])

  const requestAccess = useCallback(async () => {
    if (requestAccessRunning.current) return

    requestAccessRunning.current = true
    setRequesting(true)
    setError(null)
    setNotice(null)

    try {
      const response = await requestSologDetailsAccess(getOrCreateDeviceToken())
      updateServerNow(response.server_now)
      setNotice(REQUEST_MESSAGES[response.codigo])
      await loadSummary(true)
    } catch (requestError) {
      setError(getSologErrorMessageFromUnknown(requestError))

      if (
        isSologApiErrorCode(
          requestError,
          'SOLOG_SEDE_DEVICE_ALREADY_AUTHORIZED',
        )
      ) {
        await loadSummary(true)
      }
    } finally {
      requestAccessRunning.current = false
      setRequesting(false)
    }
  }, [loadSummary, updateServerNow])

  return {
    error,
    loadSummary,
    notice,
    requestAccess,
    requesting,
    status,
    summary,
  }
}
