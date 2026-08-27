import { AlertCircle, LoaderCircle, Play, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  shouldFlushCajeroBufferImmediately,
  shouldFlushCajeroBufferOnExit,
} from './cajero.storage'
import { CajeroCountTable } from './cajero.table'
import type {
  CajeroCachedView,
  CajeroCountGroup,
  CajeroGroupsResponse,
} from './cajero.types'
import {
  deriveCajeroCategories,
  filterCajeroByCategory,
} from './cajero.utils'

export function CajeroOperationalView({
  session,
  view,
  title,
  description,
  emptyTitle,
  emptyDetail,
  icon: EmptyIcon,
  transformGroups = (groups) => groups,
  categoryNavigation = false,
}: {
  session: CajeroSessionController
  view: CajeroCachedView
  title: string
  description: string
  emptyTitle: string
  emptyDetail: string
  icon: LucideIcon
  transformGroups?: (groups: CajeroCountGroup[]) => CajeroCountGroup[]
  categoryNavigation?: boolean
}) {
  const cached = session.getCachedOperationalGroups(view)
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(cached)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(cached === null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const sessionRef = useRef(session)
  const activeScope = session.activeScope
  const loadOperationalGroups = session.loadOperationalGroups

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const loadGroups = useCallback(async () => {
    if (!activeScope) {
      setGroupsState(null)
      setLoading(false)
      return
    }

    const currentRequest = ++requestVersion.current
    const existing = sessionRef.current.getCachedOperationalGroups(view)
    if (!existing) setLoading(true)
    setError(null)
    try {
      const response = await loadOperationalGroups(view)
      if (currentRequest !== requestVersion.current) return
      if (response) setGroupsState(response)
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [activeScope, loadOperationalGroups, view])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadGroups()
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [loadGroups])

  useEffect(() => () => {
    const current = sessionRef.current
    const pending = current.activeScope
      ? getCajeroPendingCountForIdentity(current.activeScope)
      : 0
    if (shouldFlushCajeroBufferOnExit(pending)) void current.sendPending()
  }, [])



  const handleBufferChange = () => {
    const pending = activeScope
      ? getCajeroPendingCountForIdentity(activeScope)
      : 0
    if (shouldFlushCajeroBufferImmediately(pending)) void session.sendPending()
  }

  const confirmedGroupIds = categoryNavigation
    ? new Set(session.confirmedGroupIds)
    : null
  const availableGroups = confirmedGroupIds
    ? (groupsState?.grupos ?? []).filter(
        (group) => !confirmedGroupIds.has(group.grupo_id),
      )
    : groupsState?.grupos ?? []
  const groups = transformGroups(availableGroups)
  const categories = categoryNavigation ? deriveCajeroCategories(groups) : []
  const effectiveCategoryId = categoryNavigation
    ? categories.some((category) => category.id === selectedCategoryId)
      ? selectedCategoryId
      : categories[0]?.id ?? null
    : null
  const visibleGroups = categoryNavigation
    ? filterCajeroByCategory(groups, effectiveCategoryId)
    : groups


  if (!activeScope) {
    return (
      <section className="cajero-module" aria-labelledby={`cajero-${view}-title`}>
        <div className="cajero-module__heading">
          <div><p className="cajero-module__eyebrow">Operación</p><h1 id={`cajero-${view}-title`}>{title}</h1></div>
        </div>
        <div className="cajero-empty-state" role="status">
          <Play aria-hidden="true" size={28} />
          <div><strong>Inicia una sesión desde Inicio.</strong><p>Necesitas una referencia TumiSoft vigente para capturar.</p></div>
        </div>
      </section>
    )
  }

  return (
    <section className="cajero-module" aria-labelledby={`cajero-${view}-title`}>
      <div className="cajero-module__heading">
        <div>
          <p className="cajero-module__eyebrow">Operación</p>
          <h1 id={`cajero-${view}-title`}>{title}</h1>
          <p>{description}</p>
        </div>
        {groupsState ? <span className="cajero-status">{groups.length} grupos</span> : null}
      </div>

      {categoryNavigation && categories.length > 0 ? (
        <div className="cajero-category-selector" aria-label="Categoría">
          {categories.map((category) => (
            <button
              aria-pressed={effectiveCategoryId === category.id}
              className={effectiveCategoryId === category.id ? 'is-active' : undefined}
              key={category.id}
              onClick={() => setSelectedCategoryId(category.id)}
              type="button"
            >
              <strong>{category.nombre}</strong>
              <small>{category.count} pendientes</small>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="cajero-alert cajero-alert--error" role="alert">
          <AlertCircle aria-hidden="true" size={21} /><p>{error}</p>
          <button className="button button--secondary" onClick={() => void loadGroups()} type="button">Reintentar</button>
        </div>
      ) : null}

      {loading && !groupsState ? (
        <div className="cajero-loading" role="status"><LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando grupos…</div>
      ) : groupsState && groups.length > 0 ? (
        <>
          {categoryNavigation && effectiveCategoryId ? (
            <div className="cajero-section-heading">
              <h2>{categories.find((category) => category.id === effectiveCategoryId)?.nombre}</h2>
              <span>{visibleGroups.length} pendientes</span>
            </div>
          ) : null}
          <CajeroCountTable
            disabled={!session.canCapture}
            groups={visibleGroups}
            key={`${groupsState.conteo_id}:${view}`}
            onBufferChange={handleBufferChange}
            scope={activeScope}
            view={view}
          />
        </>
      ) : groupsState && !error ? (
        <div className="cajero-empty-state" role="status">
          <EmptyIcon aria-hidden="true" size={28} />
          <div><strong>{emptyTitle}</strong><p>{emptyDetail}</p></div>
        </div>
      ) : !error ? null : null}
    </section>
  )
}