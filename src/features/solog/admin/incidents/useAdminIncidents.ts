import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyAdminIncidentDecision,
  getAdminIncidents,
} from '../../api'
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

export const ADMIN_INCIDENTS_PAGE_SIZE = 50

export interface AdminIncidentDraftFilters {
  sedeId: string
  tipo: '' | SologAdminIncidentType
  estado: string
  internalCode: string
  producto: string
  desde: string
  hasta: string
}

type LoadStatus = 'loading' | 'ready' | 'error'

function createDefaultFilters(): AdminIncidentDraftFilters {
  return {
    sedeId: '',
    tipo: '',
    estado: 'pendiente',
    internalCode: '',
    producto: '',
    desde: '',
    hasta: '',
  }
}

function validateFilters(filters: AdminIncidentDraftFilters): string | null {
  if (filters.desde && filters.hasta && filters.desde > filters.hasta) {
    return 'La fecha Desde no puede ser posterior a la fecha Hasta.'
  }
  if (filters.internalCode && !/^\d+$/.test(filters.internalCode)) {
    return 'El código interno debe ser un entero positivo.'
  }
  return null
}

function createPayload(
  filters: AdminIncidentDraftFilters,
  offset: number,
): SologAdminIncidentsFilters {
  return {
    ...(filters.sedeId ? { sede_id: filters.sedeId } : {}),
    ...(filters.tipo ? { tipo: filters.tipo } : {}),
    ...(filters.estado ? { estado: filters.estado } : {}),
    ...(filters.internalCode ? { c_interno: Number(filters.internalCode) } : {}),
    ...(filters.producto.trim() ? { producto: filters.producto.trim() } : {}),
    ...(filters.desde ? { desde: filters.desde } : {}),
    ...(filters.hasta ? { hasta: filters.hasta } : {}),
    limit: ADMIN_INCIDENTS_PAGE_SIZE,
    offset,
  }
}

export function useAdminIncidents({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>
}) {
  const [draftFilters, setDraftFilters] =
    useState<AdminIncidentDraftFilters>(createDefaultFilters)
  const [appliedFilters, setAppliedFilters] =
    useState<AdminIncidentDraftFilters>(createDefaultFilters)
  const [response, setResponse] =
    useState<SologAdminIncidentsResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [actingId, setActingId] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const actionInProgress = useRef(false)

  const load = useCallback(async (
    filters: AdminIncidentDraftFilters,
    nextOffset: number,
  ) => {
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
      const next = await getAdminIncidents(createPayload(filters, nextOffset))
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

  const updateFilters = useCallback((updates: Partial<AdminIncidentDraftFilters>) => {
    setDraftFilters((current) => ({ ...current, ...updates }))
    setOffset(0)
  }, [])

  const applyFilters = useCallback(() => {
    setNotice(null)
    void load(draftFilters, 0)
  }, [draftFilters, load])

  const resetFilters = useCallback(() => {
    const defaults = createDefaultFilters()
    setDraftFilters(defaults)
    setNotice(null)
    void load(defaults, 0)
  }, [load])

  const refresh = useCallback(() => {
    setNotice(null)
    return load(appliedFilters, offset)
  }, [appliedFilters, load, offset])

  const applyDecision = useCallback(async (
    payload: SologAdminIncidentActionPayload,
  ) => {
    if (actionInProgress.current) return false
    actionInProgress.current = true
    setActingId(payload.incident_id)
    setError(null)
    setNotice(null)
    try {
      await applyAdminIncidentDecision(payload)
      setNotice('La incidencia se actualizó correctamente.')
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
      setActingId(null)
    }
  }, [appliedFilters, load, offset, refreshOperationalState])

  return {
    draftFilters,
    response,
    status,
    error,
    notice,
    offset,
    actingId,
    updateFilters,
    applyFilters,
    resetFilters,
    refresh,
    applyDecision,
    previousPage: () => void load(appliedFilters, Math.max(0, offset - ADMIN_INCIDENTS_PAGE_SIZE)),
    nextPage: () => void load(appliedFilters, offset + ADMIN_INCIDENTS_PAGE_SIZE),
    dismissNotice: () => setNotice(null),
  }
}
