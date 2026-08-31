import {
  AlertCircle,
  LoaderCircle,
  Play,
  Send,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  shouldFlushCajeroBufferImmediately,
} from './cajero.storage'
import { CajeroCountTable } from './cajero.table'
import type {
  CajeroCachedView,
  CajeroCountGroup,
  CajeroGroupsResponse,
} from './cajero.types'

export interface CajeroSelectionGridItem {
  id: string
  name: string
  count: number
  icon: LucideIcon
}

export function CajeroSelectionGrid({
  items,
  selectedId,
  onSelect,
  label,
}: {
  items: CajeroSelectionGridItem[]
  selectedId?: string | null
  onSelect: (id: string) => void
  label: string
}) {
  return (
    <div className="cajero-selection-grid" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        const selected = selectedId === item.id
        return (
          <button
            aria-pressed={selected}
            className={selected ? 'is-active' : undefined}
            disabled={item.count === 0}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <Icon aria-hidden="true" size={23} />
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

export function CajeroSendBar({
  session,
  compact = false,
}: {
  session: CajeroSessionController
  compact?: boolean
}) {
  return (
    <section
      className={`cajero-send-bar${compact ? ' cajero-send-bar--compact' : ''}`}
      aria-label="Enviar conteos pendientes"
    >
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
}: {
  session: CajeroSessionController
  view: CajeroCachedView
  title: string
  description: string
  emptyTitle: string
  emptyDetail: string
  icon: LucideIcon
  transformGroups?: (groups: CajeroCountGroup[]) => CajeroCountGroup[]
}) {
  const cached = session.getCachedOperationalGroups(view)
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(cached)
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
  }, [loadGroups, session.cacheRevision])

  const handleBufferChange = () => {
    const pending = activeScope
      ? getCajeroPendingCountForIdentity(activeScope)
      : 0
    if (shouldFlushCajeroBufferImmediately(pending)) void session.sendPending()
  }

  const groups = transformGroups(groupsState?.grupos ?? [])

  if (!activeScope) {
    return (
      <section className="cajero-module" aria-labelledby={`cajero-${view}-title`}>
        <div className="cajero-module__heading">
          <div>
            <p className="cajero-module__eyebrow">Operación</p>
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
          <p className="cajero-module__eyebrow">Operación</p>
          <h1 id={`cajero-${view}-title`}>{title}</h1>
          <p>{description}</p>
        </div>
        {groupsState ? (
          <span className="cajero-status">{groups.length} grupos</span>
        ) : null}
      </div>

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
        <CajeroCountTable
          disabled={!session.canCapture}
          groups={groups}
          key={`${groupsState.conteo_id}:${view}`}
          onBufferChange={handleBufferChange}
          scope={activeScope}
          session={session}
          view={view}
        />
      ) : groupsState && !error ? (
        <div className="cajero-empty-state" role="status">
          <EmptyIcon aria-hidden="true" size={28} />
          <div>
            <strong>{emptyTitle}</strong>
            <p>{emptyDetail}</p>
          </div>
        </div>
      ) : null}

    </section>
  )
}
