import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  SologAdminSite,
  SologAdminIncidentType,
} from '../../types'
import {
  getIncidentPeriodRange,
  type IncidentDateRange,
  type IncidentPeriodPreset,
  validateIncidentDateRange,
} from './incident-period'

export const ADMIN_INCIDENTS_PAGE_SIZE = 50

export interface AdminIncidentDraftFilters {
  sedeId: string
  tipo: '' | SologAdminIncidentType
  estado: AdminIncidentState
  search: string
  desde: string
  hasta: string
}

export type AdminIncidentState =
  | 'pendiente'
  | 'revisada'
  | 'suprimida'
  | 'eliminada'

type LoadStatus = 'loading' | 'ready' | 'error'

const SITE_ORDER = ['cutervo', 'huaca', 'divino', 'unidad', 'casuarinas'] as const

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

export function orderIncidentSites(sites: SologAdminSite[]): SologAdminSite[] {
  const active = sites.filter((site) => site.activo)
  const positions = new Map<string, number>(SITE_ORDER.map((name, index) => [name, index]))
  const expected = active.filter((site) => positions.has(normalizeName(site.nombre)))
  const candidates = expected.length > 0 ? expected : active
  return candidates.slice().sort((left, right) => {
    const leftPosition = positions.get(normalizeName(left.nombre)) ?? SITE_ORDER.length
    const rightPosition = positions.get(normalizeName(right.nombre)) ?? SITE_ORDER.length
    return leftPosition - rightPosition || left.nombre.localeCompare(right.nombre, 'es')
  })
}

function getDefaultSiteId(sites: SologAdminSite[]): string {
  return sites.find((site) => normalizeName(site.nombre) === 'cutervo')?.id
    ?? sites[0]?.id
    ?? ''
}

function createDefaultFilters(sedeId: string): AdminIncidentDraftFilters {
  const range = getIncidentPeriodRange('today')
  return {
    sedeId,
    tipo: '',
    estado: 'pendiente',
    search: '',
    ...range,
  }
}

function validateFilters(filters: AdminIncidentDraftFilters): string | null {
  if (!filters.sedeId) return 'No hay una sede válida disponible para Incidencias.'
  const dateError = validateIncidentDateRange(filters)
  if (dateError) return dateError
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
  offset: number,
): SologAdminIncidentsFilters {
  const search = filters.search.trim()
  const isInternalCode = /^\d+$/.test(search)
  return {
    sede_id: filters.sedeId,
    ...(filters.tipo ? { tipo: filters.tipo } : {}),
    estado: filters.estado,
    ...(search && isInternalCode ? { c_interno: Number(search) } : {}),
    ...(search && !isInternalCode ? { producto: search } : {}),
    desde: filters.desde,
    hasta: filters.hasta,
    limit: ADMIN_INCIDENTS_PAGE_SIZE,
    offset,
  }
}

export function useAdminIncidents({
  sites,
  refreshOperationalState,
}: {
  sites: SologAdminSite[]
  refreshOperationalState: () => Promise<void>
}) {
  const orderedSites = useMemo(() => orderIncidentSites(sites), [sites])
  const defaultSiteId = getDefaultSiteId(orderedSites)
  const [draftFilters, setDraftFilters] =
    useState<AdminIncidentDraftFilters>(() => createDefaultFilters(defaultSiteId))
  const [appliedFilters, setAppliedFilters] =
    useState<AdminIncidentDraftFilters>(() => createDefaultFilters(defaultSiteId))
  const [period, setPeriod] = useState<IncidentPeriodPreset>('today')
  const [customRange, setCustomRange] = useState<IncidentDateRange>(() =>
    getIncidentPeriodRange('today'))
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
    const initial = createDefaultFilters(defaultSiteId)
    let active = true
    queueMicrotask(() => {
      if (active) void load(initial, 0)
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [defaultSiteId, load])

  const updateFilters = useCallback((updates: Partial<AdminIncidentDraftFilters>) => {
    setDraftFilters((current) => ({ ...current, ...updates }))
  }, [])

  const applyFilters = useCallback(() => {
    setNotice(null)
    void load(draftFilters, 0)
  }, [draftFilters, load])

  const applyImmediateFilters = useCallback((
    updates: Partial<AdminIncidentDraftFilters>,
  ) => {
    const next = { ...draftFilters, ...updates }
    setDraftFilters(next)
    setNotice(null)
    void load(next, 0)
  }, [draftFilters, load])

  const selectPeriod = useCallback((nextPeriod: IncidentPeriodPreset) => {
    setPeriod(nextPeriod)
    setNotice(null)
    if (nextPeriod === 'custom') return
    const range = getIncidentPeriodRange(nextPeriod)
    setCustomRange(range)
    applyImmediateFilters(range)
  }, [applyImmediateFilters])

  const applyCustomRange = useCallback(() => {
    const validationError = validateIncidentDateRange(customRange)
    if (validationError) {
      setError(validationError)
      return
    }
    applyImmediateFilters(customRange)
  }, [applyImmediateFilters, customRange])

  const resetFilters = useCallback(() => {
    const defaults = createDefaultFilters(draftFilters.sedeId)
    const range = { desde: defaults.desde, hasta: defaults.hasta }
    setDraftFilters(defaults)
    setPeriod('today')
    setCustomRange(range)
    setNotice(null)
    void load(defaults, 0)
  }, [draftFilters.sedeId, load])

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
    orderedSites,
    draftFilters,
    period,
    customRange,
    response,
    status,
    error,
    notice,
    offset,
    actingId,
    updateFilters,
    applyFilters,
    selectSite: (sedeId: string) => applyImmediateFilters({ sedeId }),
    selectState: (estado: AdminIncidentState) => applyImmediateFilters({ estado }),
    selectPeriod,
    setCustomRange,
    applyCustomRange,
    resetFilters,
    refresh,
    applyDecision,
    previousPage: () => void load(appliedFilters, Math.max(0, offset - ADMIN_INCIDENTS_PAGE_SIZE)),
    nextPage: () => void load(appliedFilters, offset + ADMIN_INCIDENTS_PAGE_SIZE),
    dismissNotice: () => setNotice(null),
  }
}
