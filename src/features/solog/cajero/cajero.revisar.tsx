import {
  AlertCircle,
  ChevronRight,
  LoaderCircle,
  Play,
  SearchCheck,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import { CajeroCaptureModal } from './cajero.captura.dialog'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroBufferRevision,
  getCajeroPendingCountForIdentity,
  readCajeroBuffer,
  shouldFlushCajeroBufferImmediately,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import type { CajeroGroupsResponse } from './cajero.types'
import {
  calculateDifference,
  formatCajeroDifference,
  filterCajeroReviewGroups,
  getCajeroDifferenceClass,
  isCajeroRecountGroup,
  sortFollowupGroups,
  toggleCajeroReviewDifferenceFilter,
  type CajeroReviewDifferenceFilter,
} from './cajero.utils'

export function CajeroRevisar({ session }: { session: CajeroSessionController }) {
  const cached = session.getCachedOperationalGroups('revisar')
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(cached)
  const [loading, setLoading] = useState(cached === null)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [differenceFilter, setDifferenceFilter] =
    useState<CajeroReviewDifferenceFilter>('all')
  const requestVersion = useRef(0)
  const sessionRef = useRef(session)
  const activeScope = session.activeScope
  const loadOperationalGroups = session.loadOperationalGroups

  useSyncExternalStore(
    subscribeCajeroBufferChanges,
    getCajeroBufferRevision,
    () => 0,
  )

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
    const existing = sessionRef.current.getCachedOperationalGroups('revisar')
    if (!existing) setLoading(true)
    setError(null)
    try {
      const response = await loadOperationalGroups('revisar')
      if (currentRequest !== requestVersion.current) return
      if (response) setGroupsState(response)
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [activeScope, loadOperationalGroups])

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

  const groups = useMemo(
    () => sortFollowupGroups(groupsState?.grupos ?? []),
    [groupsState?.grupos],
  )
  const visibleGroups = useMemo(
    () => filterCajeroReviewGroups(groups, differenceFilter),
    [differenceFilter, groups],
  )
  const buffer = activeScope ? readCajeroBuffer(activeScope) : null
  const pendingByGroup = useMemo(
    () => new Map(buffer?.items.map((item) => [item.grupo_id, item]) ?? []),
    [buffer?.items],
  )
  const lockedGroupIds = useMemo(
    () => new Set(
      groups
        .filter((group) => isCajeroRecountGroup(group) && !group.detalle_origen_id)
        .map((group) => group.grupo_id),
    ),
    [groups],
  )

  const handleObservationSaved = () => {
    if (!activeScope) return
    const pending = getCajeroPendingCountForIdentity(activeScope)
    if (shouldFlushCajeroBufferImmediately(pending)) void session.sendPending()
  }

  if (!activeScope) {
    return (
      <section className="cajero-module cajero-review" aria-labelledby="cajero-revisar-title">
        <div className="cajero-module__heading">
          <div><h1 id="cajero-revisar-title">Revisar</h1></div>
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
    <section className="cajero-module cajero-review" aria-labelledby="cajero-revisar-title">
      <div className="cajero-module__heading cajero-review__heading">
        <div>
          <h1 id="cajero-revisar-title">Revisar</h1>
          <p>Registra la realidad</p>
        </div>
        <div
          aria-label="Filtrar por última diferencia"
          className="cajero-review-filter"
          role="group"
        >
          <button
            aria-label="Mostrar últimas diferencias positivas"
            aria-pressed={differenceFilter === 'all' || differenceFilter === 'positive'}
            className={differenceFilter === 'all' || differenceFilter === 'positive' ? 'is-active' : undefined}
            onClick={() => setDifferenceFilter((current) =>
              toggleCajeroReviewDifferenceFilter(current, 'positive')
            )}
            type="button"
          >
            +
          </button>
          <button
            aria-label="Mostrar últimas diferencias negativas"
            aria-pressed={differenceFilter === 'all' || differenceFilter === 'negative'}
            className={differenceFilter === 'all' || differenceFilter === 'negative' ? 'is-active' : undefined}
            onClick={() => setDifferenceFilter((current) =>
              toggleCajeroReviewDifferenceFilter(current, 'negative')
            )}
            type="button"
          >
            −
          </button>
        </div>
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
          <LoaderCircle aria-hidden="true" className="spin" size={24} />
          Cargando casos…
        </div>
      ) : groupsState && groups.length > 0 && visibleGroups.length > 0 ? (
        <div className="cajero-review-list">
          <div className="cajero-review-list__head" aria-hidden="true">
            <span>Nombre</span>
            <span>Última diferencia</span>
            <span>Diferencia actual</span>
            <span />
          </div>
          <div className="cajero-review-list__rows">
            {visibleGroups.map((group) => {
              const pending = pendingByGroup.get(group.grupo_id)
              const currentDifference = pending
                ? calculateDifference(pending.stock_fisico, group.stock_teorico)
                : null
              const lastDifference = group.ultima_diferencia ?? null

              return (
                <button
                  aria-label={`Revisar ${group.nombre}`}
                  className={pending ? 'is-counted' : undefined}
                  key={group.grupo_id}
                  onClick={() => setSelectedGroupId(group.grupo_id)}
                  type="button"
                >
                  <strong>{group.nombre}</strong>
                  <span className={getCajeroDifferenceClass(lastDifference)}>
                    {formatCajeroDifference(lastDifference)}
                  </span>
                  <span className={getCajeroDifferenceClass(currentDifference)}>
                    {formatCajeroDifference(currentDifference)}
                  </span>
                  <ChevronRight aria-hidden="true" size={21} />
                </button>
              )
            })}
          </div>
        </div>
      ) : groupsState && groups.length > 0 && !error ? (
        <div className="cajero-empty-state" role="status">
          <SearchCheck aria-hidden="true" size={28} />
          <div>
            <strong>No hay casos con este filtro.</strong>
            <p>Selecciona ambos signos para volver a mostrar todos.</p>
          </div>
        </div>
      ) : groupsState && !error ? (
        <div className="cajero-empty-state" role="status">
          <SearchCheck aria-hidden="true" size={28} />
          <div>
            <strong>No hay casos para revisar.</strong>
            <p>SOLOG consulta únicamente los casos problemáticos vigentes.</p>
          </div>
        </div>
      ) : null}

      {selectedGroupId ? (
        <CajeroCaptureModal
          categoryName="Revisar"
          disabled={!session.canCapture}
          groups={visibleGroups}
          initialGroupId={selectedGroupId}
          lockedGroupIds={lockedGroupIds}
          onClose={() => setSelectedGroupId(null)}
          onObservationSaved={handleObservationSaved}
          scope={activeScope}
          view="revisar"
        />
      ) : null}
    </section>
  )
}
