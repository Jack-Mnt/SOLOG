import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyCatalogDecision,
  getCatalogChanges,
  getSologCatalogReference,
} from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type {
  SologCatalogChangeActionPayload,
  SologCatalogChangesFilters,
  SologCatalogChangesResponse,
  SologCatalogChangeStatus,
  SologCatalogChangeScope,
  SologCatalogChangeType,
  SologCatalogReference,
} from '../../types'

export const CATALOG_CHANGES_PAGE_SIZE = 50

export interface CatalogDraftFilters {
  tipo: '' | SologCatalogChangeType
  ambito: '' | SologCatalogChangeScope
  estado: SologCatalogChangeStatus
  search: string
}

type LoadStatus = 'loading' | 'ready' | 'error'
type ReferenceStatus = 'idle' | 'loading' | 'ready' | 'error'

function createDefaultFilters(): CatalogDraftFilters {
  return {
    tipo: '',
    ambito: '',
    estado: 'pendiente',
    search: '',
  }
}

function validateFilters(filters: CatalogDraftFilters): string | null {
  const search = filters.search.trim()
  if (/^\d+$/.test(search)) {
    const internalCode = Number(search)
    if (!Number.isSafeInteger(internalCode) || internalCode < 1) {
      return 'El código interno debe ser un entero positivo válido.'
    }
  }
  return null
}

function createPayload(
  filters: CatalogDraftFilters,
  offset: number,
): SologCatalogChangesFilters {
  const search = filters.search.trim()
  const isInternalCode = /^\d+$/.test(search)
  return {
    ...(filters.tipo ? { tipo: filters.tipo } : {}),
    ...(filters.ambito ? { ambito: filters.ambito } : {}),
    estado: filters.estado,
    ...(search && isInternalCode ? { c_interno: Number(search) } : {}),
    ...(search && !isInternalCode ? { producto: search } : {}),
    limit: CATALOG_CHANGES_PAGE_SIZE,
    offset,
  }
}

export function useCatalogChanges({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>
}) {
  const [draftFilters, setDraftFilters] = useState<CatalogDraftFilters>(createDefaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<CatalogDraftFilters>(createDefaultFilters)
  const [response, setResponse] = useState<SologCatalogChangesResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [actingFingerprint, setActingFingerprint] = useState<string | null>(null)
  const [reference, setReference] = useState<SologCatalogReference | null>(null)
  const [referenceStatus, setReferenceStatus] = useState<ReferenceStatus>('idle')
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const actionInProgress = useRef(false)

  const load = useCallback(async (filters: CatalogDraftFilters, nextOffset: number) => {
    const validationError = validateFilters(filters)
    if (validationError) {
      setError(validationError)
      setStatus('error')
      return false
    }
    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setError(null)
    try {
      const next = await getCatalogChanges(createPayload(filters, nextOffset))
      if (currentRequest !== requestVersion.current) return false
      setResponse(next)
      setAppliedFilters(filters)
      setOffset(nextOffset)
      setStatus('ready')
      return true
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return false
      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')
      if (isSologApiErrorCode(loadError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
        await refreshOperationalState()
      }
      return false
    }
  }, [refreshOperationalState])

  useEffect(() => {
    const initial = createDefaultFilters()
    let active = true
    queueMicrotask(() => {
      if (active) void load(initial, 0)
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [load])

  const updateFilters = useCallback((updates: Partial<CatalogDraftFilters>) => {
    setDraftFilters((current) => ({ ...current, ...updates }))
    setOffset(0)
  }, [])

  const applyFilters = useCallback(() => {
    setNotice(null)
    void load(draftFilters, 0)
  }, [draftFilters, load])

  const resetFilters = useCallback(() => {
    const defaults = { ...createDefaultFilters(), estado: draftFilters.estado }
    setDraftFilters(defaults)
    setNotice(null)
    void load(defaults, 0)
  }, [draftFilters.estado, load])

  const selectStatus = useCallback((nextStatus: SologCatalogChangeStatus) => {
    const nextFilters = { ...draftFilters, estado: nextStatus }
    setDraftFilters(nextFilters)
    setNotice(null)
    void load(nextFilters, 0)
  }, [draftFilters, load])

  const refresh = useCallback(() => {
    setNotice(null)
    return load(appliedFilters, offset)
  }, [appliedFilters, load, offset])

  const applyDecision = useCallback(async (payload: SologCatalogChangeActionPayload) => {
    if (actionInProgress.current) return false
    actionInProgress.current = true
    setActingFingerprint(payload.propuesta_fingerprint)
    setError(null)
    setNotice(null)
    try {
      await applyCatalogDecision(payload)
      setNotice(payload.decision === 'approve'
        ? 'El cambio quedó aprobado para una versión futura.'
        : payload.decision === 'withdraw'
          ? 'La aprobación se retiró y el cambio volvió a Pendiente.'
          : 'La propuesta exacta quedó ignorada.')
      await load(appliedFilters, offset)
      return true
    } catch (actionError) {
      setError(getSologErrorMessageFromUnknown(actionError))
      if (isSologApiErrorCode(actionError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
        await refreshOperationalState()
      }
      return false
    } finally {
      actionInProgress.current = false
      setActingFingerprint(null)
    }
  }, [appliedFilters, load, offset, refreshOperationalState])

  const loadReference = useCallback(async () => {
    if (reference) return true
    setReferenceStatus('loading')
    setReferenceError(null)
    try {
      setReference(await getSologCatalogReference())
      setReferenceStatus('ready')
      return true
    } catch (loadError) {
      setReferenceError(getSologErrorMessageFromUnknown(loadError))
      setReferenceStatus('error')
      return false
    }
  }, [reference])

  return {
    draftFilters,
    appliedFilters,
    response,
    status,
    error,
    notice,
    offset,
    actingFingerprint,
    reference,
    referenceStatus,
    referenceError,
    updateFilters,
    applyFilters,
    resetFilters,
    selectStatus,
    refresh,
    applyDecision,
    loadReference,
    previousPage: () => void load(appliedFilters, Math.max(0, offset - CATALOG_CHANGES_PAGE_SIZE)),
    nextPage: () => void load(appliedFilters, offset + CATALOG_CHANGES_PAGE_SIZE),
    dismissNotice: () => setNotice(null),
  }
}
