import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologControlDetail } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type { SologControlDetailResponse } from '../../types'

export const SOLOG_CONTROL_HISTORY_PAGE_SIZE = 25

type DetailStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useSologControlDetail({
  detailId,
  refreshOperationalState,
}: {
  detailId: string
  refreshOperationalState: () => Promise<void>
}) {
  const [offset, setOffset] = useState(0)
  const [response, setResponse] = useState<SologControlDetailResponse | null>(null)
  const [status, setStatus] = useState<DetailStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const load = useCallback(async (selectedId: string) => {
    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setError(null)
    try {
      const nextResponse = await getSologControlDetail({
        detalle_id: selectedId,
      })
      if (currentRequest !== requestVersion.current) return
      setResponse(nextResponse)
      setOffset(0)
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
      if (active) void load(detailId)
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [detailId, load])

  return {
    offset,
    response,
    historyRows: response?.historial.slice(offset, offset + SOLOG_CONTROL_HISTORY_PAGE_SIZE) ?? [],
    status,
    error,
    retry: () => {
      void load(detailId)
    },
    previousPage: () => {
      setOffset((current) => Math.max(0, current - SOLOG_CONTROL_HISTORY_PAGE_SIZE))
    },
    nextPage: () => {
      setOffset((current) => current + SOLOG_CONTROL_HISTORY_PAGE_SIZE < (response?.historial.length ?? 0)
        ? current + SOLOG_CONTROL_HISTORY_PAGE_SIZE : current)
    },
  }
}
