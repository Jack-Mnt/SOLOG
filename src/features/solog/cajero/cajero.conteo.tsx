import {
  AlertCircle,
  Boxes,
  LoaderCircle,
  MinusCircle,
  PackageOpen,
  Play,
  Tags,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getOrCreateDeviceToken } from '../device'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { SologOperationalBootstrap } from '../types'
import { getCajeroGroups } from './cajero.api'
import {
  CajeroCategoryCarousel,
  CajeroCategorySummary,
  CajeroSendBar,
} from './cajero.operativo'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  readCajeroBuffer,
  shouldFlushCajeroBufferImmediately,
  shouldFlushCajeroBufferOnExit,
} from './cajero.storage'
import { CajeroCountTable } from './cajero.table'
import type {
  CajeroCountView,
  CajeroGroupsResponse,
} from './cajero.types'
import {
  deriveCajeroCategories,
  filterCajeroFortnightGroups,
} from './cajero.utils'

const STOCK_ZERO_ID = 'view:stock_cero'
const STOCK_NEGATIVE_ID = 'view:stock_negativo'
const categorySelectionId = (categoryId: string) => `category:${categoryId}`

export function CajeroConteo({
  bootstrap,
  session,
}: {
  bootstrap: SologOperationalBootstrap
  session: CajeroSessionController
}) {
  const requestedCategory = new URLSearchParams(window.location.search).get('categoria')
  const [selectedId, setSelectedId] = useState<string | null>(
    requestedCategory ? categorySelectionId(requestedCategory) : null,
  )
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const activeScope = session.activeScope
  const activeCountId = activeScope?.conteo_id ?? null
  const hasActiveSession = Boolean(bootstrap.sesion_activa)
  const handleStockUpdateDetected = session.handleStockUpdateDetected
  const sessionRef = useRef(session)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const loadGroups = useCallback(async () => {
    if (!hasActiveSession || !activeCountId) {
      setGroupsState(null)
      return
    }

    const currentRequest = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const response = await getCajeroGroups({
        device_token: getOrCreateDeviceToken(),
        vista: 'conteo',
      })
      if (currentRequest !== requestVersion.current) return
      setGroupsState(response)
      if (response.stock_actualizado) handleStockUpdateDetected()
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setGroupsState(null)
      setError(getSologErrorMessageFromUnknown(loadError))
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [activeCountId, handleStockUpdateDetected, hasActiveSession])

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

  const selectView = (nextId: string) => {
    if (selectedId === nextId) return
    const pending = session.activeScope
      ? getCajeroPendingCountForIdentity(session.activeScope)
      : 0
    if (shouldFlushCajeroBufferOnExit(pending)) void session.sendPending()
    setSelectedId(nextId)
  }

  const handleBufferChange = () => {
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
          <div>
            <h1 id="cajero-conteo-title">Conteo</h1>
          </div>
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

  const confirmedIds = new Set(session.confirmedGroupIds)
  const pendingGroups = (groupsState?.grupos ?? []).filter(
    (group) =>
      group.pendiente_quincena === true &&
      !confirmedIds.has(group.grupo_id),
  )
  const normalGroups = filterCajeroFortnightGroups(
    pendingGroups,
    'categoria',
  )
  const categories = deriveCajeroCategories(normalGroups)
  const stockZeroGroups = filterCajeroFortnightGroups(
    pendingGroups,
    'stock_cero',
  )
  const stockNegativeGroups = filterCajeroFortnightGroups(
    pendingGroups,
    'stock_negativo',
  )
  const carouselItems = [
    ...categories.map((category) => ({
      id: categorySelectionId(category.id),
      name: category.nombre,
      count: category.count,
      icon: Tags,
    })),
    {
      id: STOCK_ZERO_ID,
      name: 'Stock 0',
      count: stockZeroGroups.length,
      icon: PackageOpen,
    },
    {
      id: STOCK_NEGATIVE_ID,
      name: 'Stock negativo',
      count: stockNegativeGroups.length,
      icon: MinusCircle,
    },
  ]
  const selectableIds = new Set(carouselItems.map((item) => item.id))
  const effectiveSelectedId =
    selectedId && selectableIds.has(selectedId)
      ? selectedId
      : carouselItems.find((item) => item.count > 0)?.id ??
        carouselItems[0]?.id ??
        null

  let tableView: Extract<CajeroCountView, 'categoria' | 'stock_cero' | 'stock_negativo'> =
    'categoria'
  let visibleGroups = normalGroups
  let activeName = categories[0]?.nombre ?? 'Conteo'

  if (effectiveSelectedId === STOCK_ZERO_ID) {
    tableView = 'stock_cero'
    visibleGroups = stockZeroGroups
    activeName = 'Stock 0'
  } else if (effectiveSelectedId === STOCK_NEGATIVE_ID) {
    tableView = 'stock_negativo'
    visibleGroups = stockNegativeGroups
    activeName = 'Stock negativo'
  } else if (effectiveSelectedId?.startsWith('category:')) {
    const categoryId = effectiveSelectedId.slice('category:'.length)
    visibleGroups = filterCajeroFortnightGroups(
      pendingGroups,
      'categoria',
      categoryId,
    )
    activeName =
      categories.find((category) => category.id === categoryId)?.nombre ??
      'Conteo'
  }

  const bufferedIds = new Set(
    readCajeroBuffer(activeScope).items.map((item) => item.grupo_id),
  )
  const registeredCount = visibleGroups.filter((group) =>
    bufferedIds.has(group.grupo_id),
  ).length

  return (
    <section className="cajero-module cajero-operational" aria-labelledby="cajero-conteo-title">
      <div className="cajero-module__heading cajero-operational__heading">
        <div>
          <h1 id="cajero-conteo-title">Conteo</h1>
          <p>Selecciona una categoría y registra una sola cantidad por nombre.</p>
        </div>
      </div>

      {groupsState ? (
        <CajeroCategoryCarousel
          items={carouselItems}
          label="Categorías y vistas de conteo"
          onSelect={selectView}
          selectedId={effectiveSelectedId}
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

      {loading ? (
        <div className="cajero-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando grupos…
        </div>
      ) : groupsState && effectiveSelectedId ? (
        <>
          <CajeroCategorySummary
            name={activeName}
            registered={registeredCount}
            total={visibleGroups.length}
          />
          <CajeroCountTable
            disabled={!session.canCapture}
            groups={visibleGroups}
            key={`${groupsState.conteo_id}:${tableView}:${effectiveSelectedId}`}
            onBufferChange={handleBufferChange}
            scope={activeScope}
            view={tableView}
          />
        </>
      ) : !error ? (
        <div className="cajero-empty-state" role="status">
          <Boxes aria-hidden="true" size={28} />
          <div>
            <strong>No hay grupos pendientes.</strong>
            <p>La cobertura quincenal no tiene trabajo disponible.</p>
          </div>
        </div>
      ) : null}

      <CajeroSendBar session={session} />
    </section>
  )
}
