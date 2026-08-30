import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologCatalogStatus } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type { SologCatalogStatus } from '../../types'

type CatalogStatusLoadState = 'loading' | 'ready' | 'error'

export function useCatalogStatus(
  refreshOperationalState: () => Promise<void>,
) {
  const [status, setStatus] = useState<CatalogStatusLoadState>('loading')
  const [data, setData] = useState<SologCatalogStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setData(null)
    setError(null)

    try {
      const response = await getSologCatalogStatus()
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

  return { status, data, error, refresh: load }
}
