import {
  AlertCircle,
  Boxes,
  LoaderCircle,
  MinusCircle,
  PackageOpen,
  Play,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getOrCreateDeviceToken } from '../device'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { SologOperationalBootstrap } from '../types'
import { getCajeroGroups } from './cajero.api'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  shouldFlushCajeroBufferImmediately,
  shouldFlushCajeroBufferOnExit,
} from './cajero.storage'
import { CajeroCountTable } from './cajero.table'
import type {
  CajeroCountView,
  CajeroGroupsResponse,
} from './cajero.types'

type BaseCountView = Extract<
  CajeroCountView,
  'categoria' | 'stock_cero' | 'stock_negativo'
>


export function CajeroConteo({
  bootstrap,
  session,
}: {
  bootstrap: SologOperationalBootstrap
  session: CajeroSessionController
}) {
  const categories = bootstrap.conteo_principal.categorias
  const requestedCategory = new URLSearchParams(window.location.search).get('categoria')
  const initialCategory = categories.some((category) => category.id === requestedCategory)
    ? requestedCategory
    : categories[0]?.id ?? null
  const [view, setView] = useState<BaseCountView>('categoria')
  const [categoryId, setCategoryId] = useState<string | null>(initialCategory)
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const activeScope = session.activeScope
  const handleStockUpdateDetected = session.handleStockUpdateDetected
  const sessionRef = useRef(session)
  const previousSending = useRef(session.sending)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const loadGroups = useCallback(async () => {
    if (!bootstrap.sesion_activa || !activeScope) {
      setGroupsState(null)
      return
    }
    if (view === 'categoria' && !categoryId) {
      setGroupsState(null)
      return
    }

    const currentRequest = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const response = await getCajeroGroups(
        view === 'categoria'
          ? {
              device_token: getOrCreateDeviceToken(),
              vista: 'categoria',
              categoria_id: categoryId as string,
            }
          : { device_token: getOrCreateDeviceToken(), vista: view },
      )
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
  }, [activeScope, bootstrap.sesion_activa, categoryId, handleStockUpdateDetected, view])

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

  useEffect(() => {
    if (previousSending.current && !session.sending && bootstrap.sesion_activa) {
      void loadGroups()
    }
    previousSending.current = session.sending
  }, [bootstrap.sesion_activa, loadGroups, session.sending])

  useEffect(() => () => {
    const current = sessionRef.current
    if (shouldFlushCajeroBufferOnExit(current.activeScope ? getCajeroPendingCountForIdentity(current.activeScope) : 0)) {
      void current.sendPending()
    }
  }, [])

  const leaveView = (nextView: BaseCountView, nextCategory = categoryId) => {
    if (view === nextView && categoryId === nextCategory) return
    if (shouldFlushCajeroBufferOnExit(session.activeScope ? getCajeroPendingCountForIdentity(session.activeScope) : 0)) {
      void session.sendPending()
    }
    setGroupsState(null)
    setView(nextView)
    setCategoryId(nextCategory)
  }

  const handleBufferChange = () => {
    if (shouldFlushCajeroBufferImmediately(session.activeScope ? getCajeroPendingCountForIdentity(session.activeScope) : 0)) {
      void session.sendPending()
    }
  }

  if (!bootstrap.sesion_activa || !activeScope) {
    return (
      <section className="cajero-module" aria-labelledby="cajero-conteo-title">
        <div className="cajero-module__heading">
          <div><p className="cajero-module__eyebrow">Operación</p><h1 id="cajero-conteo-title">Conteo</h1></div>
        </div>
        <div className="cajero-empty-state" role="status">
          <Play aria-hidden="true" size={28} />
          <div><strong>Inicia una sesión desde Inicio.</strong><p>Necesitas una referencia TumiSoft vigente antes de capturar.</p></div>
        </div>
      </section>
    )
  }

  return (
    <section className="cajero-module" aria-labelledby="cajero-conteo-title">
      <div className="cajero-module__heading">
        <div>
          <p className="cajero-module__eyebrow">Operación</p>
          <h1 id="cajero-conteo-title">Conteo</h1>
          <p>Registra una única cantidad física para cada grupo.</p>
        </div>
      </div>

      <div className="cajero-count-tabs" role="tablist" aria-label="Vistas de conteo">
        <button aria-selected={view === 'categoria'} className={view === 'categoria' ? 'is-active' : undefined} onClick={() => leaveView('categoria')} role="tab" type="button"><Boxes aria-hidden="true" size={19} /> Por categoría</button>
        <button aria-selected={view === 'stock_cero'} className={view === 'stock_cero' ? 'is-active' : undefined} onClick={() => leaveView('stock_cero')} role="tab" type="button"><PackageOpen aria-hidden="true" size={19} /> Stock 0 <span>{bootstrap.conteo_principal.stock_cero_pendientes}</span></button>
        <button aria-selected={view === 'stock_negativo'} className={view === 'stock_negativo' ? 'is-active' : undefined} onClick={() => leaveView('stock_negativo')} role="tab" type="button"><MinusCircle aria-hidden="true" size={19} /> Stock negativo <span>{bootstrap.vistas_inteligentes.stock_negativo.cantidad}</span></button>
      </div>

      {view === 'categoria' ? (
        <div className="cajero-category-selector" aria-label="Categoría">
          {categories.map((category) => (
            <button
              aria-pressed={categoryId === category.id}
              className={categoryId === category.id ? 'is-active' : undefined}
              key={category.id}
              onClick={() => leaveView('categoria', category.id)}
              type="button"
            >
              <strong>{category.nombre}</strong>
              <small>{category.grupos_pendientes_quincena} pendientes</small>
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

      {loading ? (
        <div className="cajero-loading" role="status"><LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando grupos…</div>
      ) : groupsState && activeScope ? (
        <CajeroCountTable
          disabled={!session.canCapture}
          groups={groupsState.grupos}
          key={`${groupsState.conteo_id}:${view}:${categoryId ?? ''}`}
          onBufferChange={handleBufferChange}
          scope={activeScope}
          view={view}
        />
      ) : !error ? (
        <div className="cajero-empty-state" role="status">
          <Boxes aria-hidden="true" size={28} />
          <div><strong>Selecciona una categoría o vista.</strong><p>SOLOG cargará únicamente los grupos necesarios.</p></div>
        </div>
      ) : null}
    </section>
  )
}