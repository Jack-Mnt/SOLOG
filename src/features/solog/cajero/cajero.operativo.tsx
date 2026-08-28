import {
  AlertCircle,
  LoaderCircle,
  Play,
  Send,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  readCajeroBuffer,
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

export interface CajeroCategoryCarouselItem {
  id: string
  name: string
  count: number
  icon: LucideIcon
}

export function CajeroCategoryCarousel({
  items,
  selectedId,
  onSelect,
  label = 'Categorías',
}: {
  items: CajeroCategoryCarouselItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  label?: string
}) {
  return (
    <div className="cajero-category-carousel" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        const selected = selectedId === item.id
        return (
          <button
            aria-pressed={selected}
            className={selected ? 'is-active' : undefined}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <Icon aria-hidden="true" size={21} />
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.count} {item.count === 1 ? 'pendiente' : 'pendientes'}
              </small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function CajeroCategorySummary({
  name,
  registered,
  total,
}: {
  name: string
  registered: number
  total: number
}) {
  const percentage =
    total > 0 ? Math.round((Math.min(registered, total) / total) * 100) : 0

  return (
    <section className="cajero-category-summary" aria-label={`Progreso de ${name}`}>
      <div className="cajero-category-summary__heading">
        <div>
          <h2>{name}</h2>
          <p>
            <strong>{registered} / {total}</strong> registrados
          </p>
        </div>
        <strong>{percentage}%</strong>
      </div>
      <span className="cajero-category-summary__track" aria-hidden="true">
        <span style={{ width: `${percentage}%` }} />
      </span>
    </section>
  )
}

export function CajeroSendBar({
  session,
}: {
  session: CajeroSessionController
}) {
  return (
    <section className="cajero-send-bar" aria-label="Enviar conteos pendientes">
      <p>
        <strong>{session.pendingCount}</strong>{' '}
        {session.pendingCount === 1 ? 'conteo por enviar' : 'conteos por enviar'}
      </p>
      <button
        className="button button--secondary"
        disabled={session.pendingCount === 0 || session.sending}
        onClick={() => void session.sendPending()}
        type="button"
      >
        <Send aria-hidden="true" size={18} />
        {session.sending ? 'Enviando…' : 'Enviar conteo'}
      </button>
    </section>
  )
}

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
  const registeredIds = activeScope
    ? new Set(readCajeroBuffer(activeScope).items.map((item) => item.grupo_id))
    : new Set<string>()
  const registeredCount = visibleGroups.filter((group) =>
    registeredIds.has(group.grupo_id),
  ).length
  const selectedCategory = categories.find(
    (category) => category.id === effectiveCategoryId,
  )

  if (!activeScope) {
    return (
      <section className="cajero-module" aria-labelledby={`cajero-${view}-title`}>
        <div className="cajero-module__heading">
          <div>
            {!categoryNavigation ? <p className="cajero-module__eyebrow">Operación</p> : null}
            <h1 id={`cajero-${view}-title`}>{title}</h1>
          </div>
        </div>
        <div className="cajero-empty-state" role="status">
          <Play aria-hidden="true" size={28} />
          <div>
            <strong>Inicia una sesión desde Inicio.</strong>
            <p>Necesitas una referencia TumiSoft vigente para capturar.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="cajero-module cajero-operational" aria-labelledby={`cajero-${view}-title`}>
      <div className="cajero-module__heading cajero-operational__heading">
        <div>
          {!categoryNavigation ? <p className="cajero-module__eyebrow">Operación</p> : null}
          <h1 id={`cajero-${view}-title`}>{title}</h1>
          <p>{description}</p>
        </div>
        {!categoryNavigation && groupsState ? (
          <span className="cajero-status">{groups.length} grupos</span>
        ) : null}
      </div>

      {categoryNavigation && categories.length > 0 ? (
        <CajeroCategoryCarousel
          items={categories.map((category) => ({
            id: category.id,
            name: category.nombre,
            count: category.count,
            icon: Tags,
          }))}
          onSelect={setSelectedCategoryId}
          selectedId={effectiveCategoryId}
        />
      ) : null}

      {error ? (
        <div className="cajero-alert cajero-alert--error" role="alert">
          <AlertCircle aria-hidden="true" size={21} />
          <p>{error}</p>
          <button className="button button--secondary" onClick={() => void loadGroups()} type="button">
            Reintentar
          </button>
        </div>
      ) : null}

      {loading && !groupsState ? (
        <div className="cajero-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando grupos…
        </div>
      ) : groupsState && groups.length > 0 ? (
        <>
          {categoryNavigation && selectedCategory ? (
            <CajeroCategorySummary
              name={selectedCategory.nombre}
              registered={registeredCount}
              total={visibleGroups.length}
            />
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
          <div>
            <strong>{emptyTitle}</strong>
            <p>{emptyDetail}</p>
          </div>
        </div>
      ) : null}

      {categoryNavigation ? <CajeroSendBar session={session} /> : null}
    </section>
  )
}
