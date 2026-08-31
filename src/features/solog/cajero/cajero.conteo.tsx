import {
  AlertCircle,
  Boxes,
  LoaderCircle,
  MinusCircle,
  PackageCheck,
  PackageOpen,
  Play,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { SologOperationalBootstrap } from '../types'
import { CajeroCaptureModal, type CajeroCaptureView } from './cajero.captura.dialog'
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
import type {
  CajeroGroupsResponse,
  CajeroStockType,
} from './cajero.types'
import {
  deriveCajeroPeriodCategories,
  filterCajeroPeriodCategoryGroups,
  getCajeroCategoryIcon,
  isCajeroGroupInStockType,
} from './cajero.utils'

const STOCK_TYPES: Array<{
  id: CajeroStockType
  name: string
  icon: typeof PackageCheck
  view: CajeroCaptureView
}> = [
  { id: 'positive', name: 'Stock positivo', icon: PackageCheck, view: 'categoria' },
  { id: 'zero', name: 'Stock 0', icon: PackageOpen, view: 'stock_cero' },
  { id: 'negative', name: 'Stock negativo', icon: MinusCircle, view: 'stock_negativo' },
]

export function CajeroConteo({
  bootstrap,
  session,
}: {
  bootstrap: SologOperationalBootstrap
  session: CajeroSessionController
}) {
  const [selectedType, setSelectedType] = useState<CajeroStockType | null>(null)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const activeScope = session.activeScope
  const activeCountId = activeScope?.conteo_id ?? null
  const hasActiveSession = Boolean(bootstrap.sesion_activa)
  const loadOperationalGroups = session.loadOperationalGroups

  const loadGroups = useCallback(async () => {
    if (!hasActiveSession || !activeCountId) {
      setGroupsState(null)
      return
    }

    const currentRequest = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const response = await loadOperationalGroups('conteo')
      if (currentRequest !== requestVersion.current) return
      setGroupsState(response)
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setGroupsState(null)
      setError(getSologErrorMessageFromUnknown(loadError))
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [activeCountId, loadOperationalGroups, hasActiveSession])

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

  const handleObservationSaved = () => {
    const pending = session.activeScope
      ? getCajeroPendingCountForIdentity(session.activeScope)
      : 0
    if (shouldFlushCajeroBufferImmediately(pending)) {
      void session.sendPending()
    }
  }

  if (!bootstrap.sesion_activa || !activeScope) {
    return (
      <section className="cajero-module" aria-labelledby="cajero-conteo-title">
        <div className="cajero-module__heading">
          <div><h1 id="cajero-conteo-title">Conteo</h1></div>
        </div>
        <div className="cajero-empty-state" role="status">
          <Play aria-hidden="true" size={28} />
          <div>
            <strong>Inicia una sesión desde Inicio.</strong>
            <p>Necesitas una referencia TumiSoft vigente antes de capturar.</p>
          </div>
        </div>
      </section>
    )
  }

  const groups = groupsState?.grupos ?? []
  const typeItems: CajeroSelectionGridItem[] = STOCK_TYPES.map((type) => ({
    id: type.id,
    name: type.name,
    icon: type.icon,
    count: groups.filter(
      (group) =>
        isCajeroGroupInStockType(group, type.id),
    ).length,
  }))
  const effectiveType =
    selectedType && typeItems.some((item) => item.id === selectedType && item.count > 0)
      ? selectedType
      : (typeItems.find((item) => item.count > 0)?.id as CajeroStockType | undefined) ?? null
  const categories = effectiveType
    ? deriveCajeroPeriodCategories(groups, effectiveType)
    : []
  const categoryItems: CajeroSelectionGridItem[] = categories.map((category) => ({
    id: category.id,
    name: category.nombre,
    count: category.count,
    icon: getCajeroCategoryIcon(category.nombre),
  }))
  const openCategory = categories.find(
    (category) => category.id === openCategoryId && category.count > 0,
  )
  const modalGroups = openCategory && effectiveType
    ? filterCajeroPeriodCategoryGroups(
        groups,
        effectiveType,
        openCategory.id,
      )
    : []
  const openCategoryIndex = openCategory
    ? categories.findIndex((category) => category.id === openCategory.id)
    : -1
  const nextCategory = openCategoryIndex >= 0
    ? categories.slice(openCategoryIndex + 1).find((category) => category.count > 0)
    : undefined
  const modalView = STOCK_TYPES.find((type) => type.id === effectiveType)?.view

  return (
    <section className="cajero-module cajero-operational" aria-labelledby="cajero-conteo-title">
      <div className="cajero-module__heading cajero-operational__heading cajero-operational__heading--with-action">
        <div>
          <h1 id="cajero-conteo-title">Conteo</h1>
          <p>Registra la realidad</p>
        </div>
        <CajeroSendBar compact session={session} />
      </div>

      {groupsState ? (
        <>
          <section className="cajero-selection-level cajero-selection-level--stock">
            <CajeroSelectionGrid
              items={typeItems}
              label="Tipos de stock"
              onSelect={(id) => {
                setSelectedType(id as CajeroStockType)
                setOpenCategoryId(null)
              }}
              selectedId={effectiveType}
            />
          </section>
          {effectiveType ? (
            <section className="cajero-selection-level" aria-labelledby="cajero-stock-category-title">
              <h2 id="cajero-stock-category-title">Categorías</h2>
              <CajeroSelectionGrid
                items={categoryItems}
                label="Categorías del tipo de stock seleccionado"
                onSelect={setOpenCategoryId}
              />
            </section>
          ) : null}
        </>
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
      ) : groupsState && typeItems.every((item) => item.count === 0) ? (
        <div className="cajero-empty-state" role="status">
          <Boxes aria-hidden="true" size={28} />
          <div>
            <strong>No hay grupos pendientes.</strong>
            <p>La cobertura del período no tiene trabajo disponible.</p>
          </div>
        </div>
      ) : null}

      {openCategory && modalView && modalGroups.length > 0 ? (
        <CajeroCaptureModal
          categoryName={openCategory.nombre}
          disabled={!session.canCapture}
          groups={modalGroups}
          key={`${effectiveType}:${openCategory.id}`}
          onClose={() => setOpenCategoryId(null)}
          onNextCategory={nextCategory ? () => setOpenCategoryId(nextCategory.id) : undefined}
          onObservationSaved={handleObservationSaved}
          scope={activeScope}
          session={session}
          view={modalView}
        />
      ) : null}
    </section>
  )
}
