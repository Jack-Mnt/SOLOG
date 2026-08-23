import { useCallback, useEffect, useRef, useState } from 'react'
import { getAdminGroups, getCatalogReference, saveAdminGroupChange, saveAdminGroupValuation } from '../../api'
import { getSologErrorMessageFromUnknown, isSologApiErrorCode } from '../../errors'
import type {
  SologAdminGroupsFilters,
  SologAdminGroupsResponse,
  SologCatalogReference,
  SologGroupChangePayload,
  SologGroupValuationSavePayload,
} from '../../types'

export const GROUPS_PAGE_SIZE = 50
export type GroupsLoadStatus = 'loading' | 'ready' | 'error'

export interface GroupsDraftFilters {
  buscar: string
  categoria_id: string
  tipo: '' | 'Único' | 'Agrupado'
}

const defaults = (): GroupsDraftFilters => ({ buscar: '', categoria_id: '', tipo: '' })

function payload(filters: GroupsDraftFilters, offset: number): SologAdminGroupsFilters {
  return {
    ...(filters.buscar.trim() ? { buscar: filters.buscar.trim() } : {}),
    ...(filters.categoria_id ? { categoria_id: filters.categoria_id } : {}),
    ...(filters.tipo ? { tipo: filters.tipo } : {}),
    limit: GROUPS_PAGE_SIZE,
    offset,
  }
}

export function useAdminGroups(refreshOperationalState: () => Promise<void>) {
  const [draftFilters, setDraftFilters] = useState<GroupsDraftFilters>(defaults)
  const [appliedFilters, setAppliedFilters] = useState<GroupsDraftFilters>(defaults)
  const [response, setResponse] = useState<SologAdminGroupsResponse | null>(null)
  const [reference, setReference] = useState<SologCatalogReference | null>(null)
  const [status, setStatus] = useState<GroupsLoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [saving, setSaving] = useState(false)
  const [valuationError, setValuationError] = useState<string | null>(null)
  const request = useRef(0)
  const referenceRef = useRef<SologCatalogReference | null>(null)
  const saveInProgress = useRef(false)

  const load = useCallback(async (filters: GroupsDraftFilters, nextOffset: number) => {
    const version = ++request.current
    setStatus('loading')
    setError(null)
    try {
      const [groups, catalogReference] = await Promise.all([
        getAdminGroups(payload(filters, nextOffset)),
        referenceRef.current ? Promise.resolve(referenceRef.current) : getCatalogReference(),
      ])
      if (version !== request.current) return false
      setResponse(groups)
      setReference(catalogReference)
      referenceRef.current = catalogReference
      setAppliedFilters(filters)
      setOffset(nextOffset)
      setStatus('ready')
      return true
    } catch (loadError) {
      if (version !== request.current) return false
      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')
      if (isSologApiErrorCode(loadError, 'SOLOG_ADMIN_ROLE_REQUIRED')) await refreshOperationalState()
      return false
    }
  }, [refreshOperationalState])

  useEffect(() => {
    const initial = defaults()
    let active = true
    queueMicrotask(() => { if (active) void load(initial, 0) })
    return () => { active = false; request.current += 1 }
  }, [load])

  const save = useCallback(async (change: SologGroupChangePayload) => {
    if (saveInProgress.current) return false
    saveInProgress.current = true
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await saveAdminGroupChange(change)
      setNotice('La propuesta estructural quedó pendiente para la próxima versión del catálogo.')
      await load(appliedFilters, offset)
      return true
    } catch (saveError) {
      setError(getSologErrorMessageFromUnknown(saveError))
      if (isSologApiErrorCode(saveError, 'SOLOG_ADMIN_ROLE_REQUIRED')) await refreshOperationalState()
      return false
    } finally {
      saveInProgress.current = false
      setSaving(false)
    }
  }, [appliedFilters, load, offset, refreshOperationalState])

  const saveValuation = useCallback(async (valuation: SologGroupValuationSavePayload) => {
    if (saveInProgress.current) return false
    saveInProgress.current = true
    setSaving(true)
    setValuationError(null)
    setNotice(null)
    try {
      await saveAdminGroupValuation(valuation)
      setNotice('La valorización del grupo se actualizó correctamente.')
      await load(appliedFilters, offset)
      return true
    } catch (saveError) {
      if (isSologApiErrorCode(saveError, 'SOLOG_GROUP_VALUATION_NOOP')) {
        setNotice('La valorización del grupo ya estaba actualizada.')
        await load(appliedFilters, offset)
        return true
      }
      setValuationError(getSologErrorMessageFromUnknown(saveError))
      if (isSologApiErrorCode(saveError, 'SOLOG_ADMIN_ROLE_REQUIRED')) await refreshOperationalState()
      return false
    } finally {
      saveInProgress.current = false
      setSaving(false)
    }
  }, [appliedFilters, load, offset, refreshOperationalState])

  const applyFilters = () => { setNotice(null); void load(draftFilters, 0) }
  const resetFilters = () => {
    const next = defaults()
    setDraftFilters(next)
    setNotice(null)
    void load(next, 0)
  }

  return {
    draftFilters, response, reference, status, error, notice, offset, saving, valuationError,
    setDraftFilters, applyFilters, resetFilters, save, saveValuation,
    clearValuationError: () => setValuationError(null),
    dismissNotice: () => setNotice(null),
    previousPage: () => void load(appliedFilters, Math.max(0, offset - GROUPS_PAGE_SIZE)),
    nextPage: () => void load(appliedFilters, offset + GROUPS_PAGE_SIZE),
  }
}
