import { useCallback, useEffect, useRef, useState } from 'react'
import { getCatalogReference, getSologControl } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type {
  SologCatalogReferenceCategory,
  SologControlPayload,
  SologControlResponse,
  SologControlScope,
  SologDifferenceState,
} from '../../types'
import { useAdminOperationalContext } from '../AdminOperationalContext'

export const SOLOG_CONTROL_PAGE_SIZE = 50

interface ControlQuery {
  contextKey: string
  scope: SologControlScope
  estado: '' | SologDifferenceState
  categoriaId: string
  search: string
  offset: number
}

type LoadStatus = 'loading' | 'ready' | 'error'
type CategoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useSologControl({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>
}) {
  const operational = useAdminOperationalContext()
  const contextKey = `${operational.sedeId}:${operational.dateFrom}:${operational.dateTo}`
  const [query, setQuery] = useState<ControlQuery>(() => ({
    contextKey,
    scope: 'resolver',
    estado: '',
    categoriaId: '',
    search: '',
    offset: 0,
  }))
  const [searchDraft, setSearchDraft] = useState('')
  const [response, setResponse] = useState<SologControlResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<SologCatalogReferenceCategory[]>([])
  const [categoryStatus, setCategoryStatus] = useState<CategoryStatus>('idle')
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const categoryRequest = useRef(false)
  const effectiveOffset = query.contextKey === contextKey ? query.offset : 0

  const load = useCallback(async (nextQuery: ControlQuery) => {
    if (!operational.sedeId) {
      setStatus('error')
      setError('No hay una sede válida disponible para Control.')
      return
    }

    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setError(null)
    try {
      const payload: SologControlPayload = {
        sede_id: operational.sedeId,
        date_from: operational.dateFrom,
        date_to: operational.dateTo,
        scope: nextQuery.scope,
        ...(nextQuery.estado ? { estado: nextQuery.estado } : {}),
        ...(nextQuery.categoriaId ? { categoria_id: nextQuery.categoriaId } : {}),
        ...(nextQuery.search ? { search: nextQuery.search } : {}),
        limit: SOLOG_CONTROL_PAGE_SIZE,
        offset: nextQuery.offset,
      }
      const nextResponse = await getSologControl(payload)
      if (currentRequest !== requestVersion.current) return
      setResponse(nextResponse)
      setStatus('ready')
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')
      if (isSologApiErrorCode(loadError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
        await refreshOperationalState()
      }
    }
  }, [
    operational.dateFrom,
    operational.dateTo,
    operational.sedeId,
    refreshOperationalState,
  ])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load({ ...query, contextKey, offset: effectiveOffset })
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [contextKey, effectiveOffset, load, query])

  const patchQuery = useCallback((updates: Partial<ControlQuery>) => {
    setQuery((current) => ({
      ...current,
      ...updates,
      contextKey,
      offset: 0,
    }))
  }, [contextKey])

  const selectScope = useCallback((scope: SologControlScope) => {
    setQuery((current) => ({
      ...current,
      contextKey,
      scope,
      estado:
        scope === 'resolver' &&
        (current.estado === 'coincide' || current.estado === 'probablemente_explicada')
          ? ''
          : current.estado,
      offset: 0,
    }))
  }, [contextKey])

  const submitSearch = useCallback(() => {
    patchQuery({ search: searchDraft.trim() })
  }, [patchQuery, searchDraft])

  const loadCategories = useCallback(async () => {
    if (categoryRequest.current || categoryStatus === 'ready') return
    categoryRequest.current = true
    setCategoryStatus('loading')
    setCategoryError(null)
    try {
      const reference = await getCatalogReference()
      setCategories(reference.categorias)
      setCategoryStatus('ready')
    } catch (loadError) {
      setCategoryError(getSologErrorMessageFromUnknown(loadError))
      setCategoryStatus('error')
    } finally {
      categoryRequest.current = false
    }
  }, [categoryStatus])

  return {
    query: {
      ...query,
      offset: effectiveOffset,
      sedeId: operational.sedeId,
      dateFrom: operational.dateFrom,
      dateTo: operational.dateTo,
    },
    searchDraft,
    response,
    status,
    error,
    categories,
    categoryStatus,
    categoryError,
    setSearchDraft,
    selectScope,
    selectState: (estado: '' | SologDifferenceState) => patchQuery({ estado }),
    selectCategory: (categoriaId: string) => patchQuery({ categoriaId }),
    submitSearch,
    loadCategories,
    retry: () => void load({ ...query, contextKey, offset: effectiveOffset }),
    previousPage: () => setQuery((current) => ({
      ...current,
      contextKey,
      offset: Math.max(0, effectiveOffset - SOLOG_CONTROL_PAGE_SIZE),
    })),
    nextPage: () => setQuery((current) => ({
      ...current,
      contextKey,
      offset: effectiveOffset + SOLOG_CONTROL_PAGE_SIZE,
    })),
  }
}
