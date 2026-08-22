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

  const load = useCallback(async (selectedId: string, nextOffset: number) => {
    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setError(null)
    try {
      const nextResponse = await getSologControlDetail({
        detalle_id: selectedId,
        limit: SOLOG_CONTROL_HISTORY_PAGE_SIZE,
        offset: nextOffset,
      })
      if (currentRequest !== requestVersion.current) return
      setResponse(nextResponse)
      setOffset(nextOffset)
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
      if (active) void load(detailId, 0)
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [detailId, load])

  return {
    offset,
    response,
    status,
    error,
    retry: () => {
      void load(detailId, offset)
    },
    previousPage: () => {
      const nextOffset = Math.max(0, offset - SOLOG_CONTROL_HISTORY_PAGE_SIZE)
      void load(detailId, nextOffset)
    },
    nextPage: () => {
      const nextOffset = offset + SOLOG_CONTROL_HISTORY_PAGE_SIZE
      void load(detailId, nextOffset)
    },
  }
}
