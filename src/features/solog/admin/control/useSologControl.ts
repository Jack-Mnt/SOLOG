import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCatalogReference, getSologControl } from '../../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type {
  SologAdminSite,
  SologCatalogReferenceCategory,
  SologControlPayload,
  SologControlResponse,
  SologControlScope,
  SologDifferenceState,
} from '../../types'
import {
  getControlPeriodRange,
  getLimaDate,
  type ControlDateRange,
  type ControlPeriodPreset,
  validateControlDateRange,
} from './control-period'

export const SOLOG_CONTROL_PAGE_SIZE = 50

const SITE_ORDER = ['cutervo', 'huaca', 'divino', 'unidad', 'casuarinas'] as const

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

export function orderControlSites(sites: SologAdminSite[]): SologAdminSite[] {
  const position = new Map<string, number>(SITE_ORDER.map((name, index) => [name, index]))
  return sites
    .filter((site) => site.activo)
    .slice()
    .sort((left, right) => {
      const leftPosition = position.get(normalizeName(left.nombre)) ?? SITE_ORDER.length
      const rightPosition = position.get(normalizeName(right.nombre)) ?? SITE_ORDER.length
      return leftPosition - rightPosition || left.nombre.localeCompare(right.nombre, 'es')
    })
}

function getDefaultSiteId(sites: SologAdminSite[]): string {
  return sites.find((site) => normalizeName(site.nombre) === 'cutervo')?.id ?? sites[0]?.id ?? ''
}

interface ControlQuery {
  sedeId: string
  scope: SologControlScope
  dateFrom: string
  dateTo: string
  estado: '' | SologDifferenceState
  categoriaId: string
  search: string
  offset: number
}

type LoadStatus = 'loading' | 'ready' | 'error'
type CategoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useSologControl({
  sites,
  refreshOperationalState,
}: {
  sites: SologAdminSite[]
  refreshOperationalState: () => Promise<void>
}) {
  const orderedSites = useMemo(() => orderControlSites(sites), [sites])
  const initialRange = useMemo(() => getControlPeriodRange('today'), [])
  const [query, setQuery] = useState<ControlQuery>(() => ({
    sedeId: getDefaultSiteId(orderedSites),
    scope: 'resolver',
    dateFrom: initialRange.dateFrom,
    dateTo: initialRange.dateTo,
    estado: '',
    categoriaId: '',
    search: '',
    offset: 0,
  }))
  const [period, setPeriod] = useState<ControlPeriodPreset>('today')
  const [customRange, setCustomRange] = useState<ControlDateRange>(initialRange)
  const [searchDraft, setSearchDraft] = useState('')
  const [response, setResponse] = useState<SologControlResponse | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverNow, setServerNow] = useState<string | null>(null)
  const [categories, setCategories] = useState<SologCatalogReferenceCategory[]>([])
  const [categoryStatus, setCategoryStatus] = useState<CategoryStatus>('idle')
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const categoryRequest = useRef(false)

  const load = useCallback(async (nextQuery: ControlQuery) => {
    if (!nextQuery.sedeId) {
      setStatus('error')
      setError('No hay una sede válida disponible para Control.')
      return
    }

    const currentRequest = ++requestVersion.current
    setStatus('loading')
    setError(null)
    try {
      const payload: SologControlPayload = {
        sede_id: nextQuery.sedeId,
        date_from: nextQuery.dateFrom,
        date_to: nextQuery.dateTo,
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
      setServerNow(nextResponse.server_now)
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
      if (active) void load(query)
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [load, query])

  const patchQuery = useCallback((updates: Partial<ControlQuery>) => {
    setValidationError(null)
    setQuery((current) => ({ ...current, ...updates, offset: 0 }))
  }, [])

  const selectPeriod = useCallback((nextPeriod: ControlPeriodPreset) => {
    setPeriod(nextPeriod)
    setValidationError(null)
    if (nextPeriod === 'custom') return
    const range = getControlPeriodRange(nextPeriod, serverNow ?? undefined)
    setCustomRange(range)
    setQuery((current) => ({ ...current, ...range, offset: 0 }))
  }, [serverNow])

  const applyCustomRange = useCallback(() => {
    const nextError = validateControlDateRange(customRange)
    if (nextError) {
      setValidationError(nextError)
      return
    }
    setValidationError(null)
    setQuery((current) => ({ ...current, ...customRange, offset: 0 }))
  }, [customRange])

  const selectScope = useCallback((scope: SologControlScope) => {
    setQuery((current) => ({
      ...current,
      scope,
      estado:
        scope === 'resolver' &&
        (current.estado === 'coincide' || current.estado === 'probablemente_explicada')
          ? ''
          : current.estado,
      offset: 0,
    }))
  }, [])

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
    orderedSites,
    query,
    period,
    customRange,
    searchDraft,
    response,
    status,
    error,
    validationError,
    serverDate: getLimaDate(serverNow ?? undefined),
    categories,
    categoryStatus,
    categoryError,
    setSearchDraft,
    setCustomRange,
    selectSite: (sedeId: string) => patchQuery({ sedeId }),
    selectScope,
    selectPeriod,
    selectState: (estado: '' | SologDifferenceState) => patchQuery({ estado }),
    selectCategory: (categoriaId: string) => patchQuery({ categoriaId }),
    submitSearch,
    applyCustomRange,
    loadCategories,
    retry: () => void load(query),
    previousPage: () => setQuery((current) => ({
      ...current,
      offset: Math.max(0, current.offset - SOLOG_CONTROL_PAGE_SIZE),
    })),
    nextPage: () => setQuery((current) => ({
      ...current,
      offset: current.offset + SOLOG_CONTROL_PAGE_SIZE,
    })),
  }
}
