import { AlertCircle, CalendarCheck2, LoaderCircle, Tags } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import { CajeroCaptureModal } from './cajero.captura-modal'
import {
  CajeroSelectionGrid,
  CajeroSendBar,
  type CajeroSelectionGridItem,
} from './cajero.operativo'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  shouldFlushCajeroBufferImmediately,
} from './cajero.storage'
import type { CajeroGroupsResponse } from './cajero.types'
import {
  deriveCajeroCategories,
  filterCajeroByCategory,
} from './cajero.utils'

export function CajeroDiario({ session }: { session: CajeroSessionController }) {
  const cached = session.getCachedOperationalGroups('conteo_diario')
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(cached)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
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
    const existing = sessionRef.current.getCachedOperationalGroups('conteo_diario')
    if (!existing) setLoading(true)
    setError(null)
    try {
      const response = await loadOperationalGroups('conteo_diario')
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

  const handleObservationSaved = () => {
    const pending = activeScope
      ? getCajeroPendingCountForIdentity(activeScope)
      : 0
    if (shouldFlushCajeroBufferImmediately(pending)) {
      void session.sendPending()
    }
  }

  if (!activeScope) {
    return (
      <section className="cajero-module" aria-labelledby="cajero-conteo-diario-title">
        <div className="cajero-module__heading">
          <div><h1 id="cajero-conteo-diario-title">Conteo diario</h1></div>
        </div>
        <div className="cajero-empty-state" role="status">
          <CalendarCheck2 aria-hidden="true" size={28} />
          <div>
            <strong>Inicia una sesión desde Inicio.</strong>
            <p>Necesitas una referencia TumiSoft vigente para capturar.</p>
          </div>
        </div>
      </section>
    )
  }

  const confirmedIds = new Set(session.confirmedGroupIds)
  const groups = (groupsState?.grupos ?? []).filter(
    (group) => !confirmedIds.has(group.grupo_id),
  )
  const categories = deriveCajeroCategories(groups)
  const categoryItems: CajeroSelectionGridItem[] = categories.map((category) => ({
    id: category.id,
    name: category.nombre,
    count: category.count,
    icon: Tags,
  }))
  const openCategory = categories.find(
    (category) => category.id === openCategoryId && category.count > 0,
  )
  const modalGroups = openCategory
    ? filterCajeroByCategory(groups, openCategory.id)
    : []
  const openCategoryIndex = openCategory
    ? categories.findIndex((category) => category.id === openCategory.id)
    : -1
  const nextCategory = openCategoryIndex >= 0
    ? categories.slice(openCategoryIndex + 1).find((category) => category.count > 0)
    : undefined

  return (
    <section className="cajero-module cajero-operational" aria-labelledby="cajero-conteo-diario-title">
      <div className="cajero-module__heading cajero-operational__heading cajero-operational__heading--with-action">
        <div>
          <h1 id="cajero-conteo-diario-title">Conteo diario</h1>
          <p>Registra los cambios rutinarios detectados en el Stock TumiSoft.</p>
        </div>
        <CajeroSendBar compact session={session} />
      </div>

      {groupsState && categories.length > 0 ? (
        <section className="cajero-selection-level" aria-labelledby="cajero-daily-category-title">
          <h2 id="cajero-daily-category-title">Categorías</h2>
          <CajeroSelectionGrid
            items={categoryItems}
            label="Categorías con conteo diario pendiente"
            onSelect={setOpenCategoryId}
          />
        </section>
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
      ) : groupsState && groups.length === 0 && !error ? (
        <div className="cajero-empty-state" role="status">
          <CalendarCheck2 aria-hidden="true" size={28} />
          <div>
            <strong>Conteo diario completado</strong>
            <p>No hay grupos pendientes en este momento.</p>
          </div>
        </div>
      ) : null}

      {openCategory && modalGroups.length > 0 ? (
        <CajeroCaptureModal
          categoryName={openCategory.nombre}
          disabled={!session.canCapture}
          groups={modalGroups}
          key={openCategory.id}
          lockedGroupIds={confirmedIds}
          onClose={() => setOpenCategoryId(null)}
          onNextCategory={nextCategory ? () => setOpenCategoryId(nextCategory.id) : undefined}
          onObservationSaved={handleObservationSaved}
          scope={activeScope}
          view="conteo_diario"
        />
      ) : null}
    </section>
  )
}
