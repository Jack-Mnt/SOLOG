import { useCallback, useEffect, useRef, useState } from 'react'
import { applyAdminIncidentDecision, getAdminIncidents } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type {
  SologAdminIncidentActionPayload,
  SologAdminIncidentsFilters,
  SologAdminIncidentsResponse,
  SologAdminIncidentType,
} from '../../types'
import { useAdminOperationalContext } from '../AdminOperationalContext'

export const ADMIN_INCIDENTS_PAGE_SIZE = 50

export interface AdminIncidentDraftFilters {
  tipo: '' | SologAdminIncidentType
  estado: AdminIncidentState
  search: string
}

export type AdminIncidentState =
  | 'pendiente'
  | 'revisada'
  | 'suprimida'
  | 'eliminada'

type LoadStatus = 'loading' | 'ready' | 'error'

function createDefaultFilters(): AdminIncidentDraftFilters {
  return { tipo: '', estado: 'pendiente', search: '' }
}

function validateFilters(
  filters: AdminIncidentDraftFilters,
  sedeId: string,
): string | null {
  if (!sedeId) return 'No hay una sede válida disponible para Incidencias.'
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
  filters: AdminIncidentDraftFilters,
  operational: { sedeId: string; dateFrom: string; dateTo: string },
  offset: number,
): SologAdminIncidentsFilters {
  const search = filters.search.trim()
  const isInternalCode = /^\d+$/.test(search)
  return {
    sede_id: operational.sedeId,
    ...(filters.tipo ? { tipo: filters.tipo } : {}),
    estado: filters.estado,
    ...(search && isInternalCode ? { c_interno: Number(search) } : {}),
    ...(search && !isInternalCode ? { producto: search } : {}),
    desde: operational.dateFrom,
    hasta: operational.dateTo,
    limit: ADMIN_INCIDENTS_PAGE_SIZE,
    offset,
  }
}

export function useAdminIncidents({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>
}) {
  const operational = useAdminOperationalContext()
  const { dateFrom, dateTo, sedeId } = operational
  const contextKey = `${sedeId}:${dateFrom}:${dateTo}`
  const [draftFilters, setDraftFilters] =
    useState<AdminIncidentDraftFilters>(createDefaultFilters)
  const [appliedFilters, setAppliedFilters] =
    useState<AdminIncidentDraftFilters>(createDefaultFilters)
  const [response, setResponse] =
    useState<SologAdminIncidentsResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [page, setPage] = useState(() => ({ offset: 0, contextKey }))
  const [actingId, setActingId] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const actionInProgress = useRef(false)
  const effectiveOffset = page.contextKey === contextKey ? page.offset : 0

  const load = useCallback(
    async (filters: AdminIncidentDraftFilters, nextOffset: number) => {
      const validationError = validateFilters(filters, sedeId)
      if (validationError) {
        setLoadError(validationError)
        setStatus('error')
        return false
      }
      const currentRequest = ++requestVersion.current
      setStatus('loading')
      setLoadError(null)
      setActionError(null)
      try {
        const next = await getAdminIncidents(
          createPayload(filters, { sedeId, dateFrom, dateTo }, nextOffset),
        )
        if (currentRequest !== requestVersion.current) return false
        setResponse(next)
        setStatus('ready')
        return true
      } catch (loadError) {
        if (currentRequest !== requestVersion.current) return false
        setLoadError(getSologErrorMessageFromUnknown(loadError))
        setStatus('error')
        if (isSologApiErrorCode(loadError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
          await refreshOperationalState()
        }
        return false
      }
    },
    [
      dateFrom,
      dateTo,
      sedeId,
      refreshOperationalState,
    ],
  )

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load(appliedFilters, effectiveOffset)
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [appliedFilters, effectiveOffset, load])

  const updateFilters = useCallback(
    (updates: Partial<AdminIncidentDraftFilters>) => {
      setDraftFilters((current) => ({ ...current, ...updates }))
    },
    [],
  )

  const applyFilters = useCallback(() => {
    setNotice(null)
    setPage({ contextKey, offset: 0 })
    setAppliedFilters({ ...draftFilters })
  }, [contextKey, draftFilters])

  const selectState = useCallback(
    (estado: AdminIncidentState) => {
      const next = { ...draftFilters, estado }
      setDraftFilters(next)
      setAppliedFilters(next)
      setPage({ contextKey, offset: 0 })
      setNotice(null)
    },
    [contextKey, draftFilters],
  )

  const resetFilters = useCallback(() => {
    const defaults = createDefaultFilters()
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
    setPage({ contextKey, offset: 0 })
    setNotice(null)
  }, [contextKey])

  const refresh = useCallback(() => {
    setNotice(null)
    return load(appliedFilters, effectiveOffset)
  }, [appliedFilters, effectiveOffset, load])

  const applyDecision = useCallback(
    async (payload: SologAdminIncidentActionPayload) => {
      if (actionInProgress.current) return false
      actionInProgress.current = true
      setActingId(payload.incident_id)
      setActionError(null)
      setNotice(null)
      try {
        await applyAdminIncidentDecision(payload)
        setNotice('La incidencia se actualizó correctamente.')
        await load(appliedFilters, effectiveOffset)
        return true
      } catch (actionError) {
        setActionError(getSologErrorMessageFromUnknown(actionError))
        if (isSologApiErrorCode(actionError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
          await refreshOperationalState()
        }
        return false
      } finally {
        actionInProgress.current = false
        setActingId(null)
      }
    },
    [appliedFilters, effectiveOffset, load, refreshOperationalState],
  )

  return {
    draftFilters,
    response,
    status,
    loadError,
    actionError,
    notice,
    offset: effectiveOffset,
    actingId,
    updateFilters,
    applyFilters,
    selectState,
    resetFilters,
    refresh,
    applyDecision,
    previousPage: () =>
      setPage({
        contextKey,
        offset: Math.max(0, effectiveOffset - ADMIN_INCIDENTS_PAGE_SIZE),
      }),
    nextPage: () =>
      setPage({
        contextKey,
        offset: effectiveOffset + ADMIN_INCIDENTS_PAGE_SIZE,
      }),
    dismissNotice: () => setNotice(null),
  }
}
