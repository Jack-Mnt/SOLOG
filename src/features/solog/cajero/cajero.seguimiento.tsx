import { AlertCircle, LoaderCircle, Play, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getOrCreateDeviceToken } from '../device'
import { getSologErrorMessageFromUnknown } from '../errors'
import { getCajeroGroups } from './cajero.api'
import type { CajeroSessionController } from './cajero.session'
import {
  getCajeroPendingCountForIdentity,
  shouldFlushCajeroBufferImmediately,
  shouldFlushCajeroBufferOnExit,
} from './cajero.storage'
import { CajeroCountTable } from './cajero.table'
import type { CajeroGroupsResponse } from './cajero.types'
import { sortFollowupGroups } from './cajero.utils'

export function CajeroSeguimiento({ session }: { session: CajeroSessionController }) {
  const [groupsState, setGroupsState] = useState<CajeroGroupsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const activeScope = session.activeScope
  const handleStockUpdateDetected = session.handleStockUpdateDetected
  const sessionRef = useRef(session)
  const previousSending = useRef(session.sending)
  const sortedGroups = useMemo(
    () => sortFollowupGroups(groupsState?.grupos ?? []),
    [groupsState?.grupos],
  )

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const loadGroups = useCallback(async () => {
    if (!activeScope) {
      setGroupsState(null)
      return
    }
    const currentRequest = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const response = await getCajeroGroups({
        device_token: getOrCreateDeviceToken(),
        vista: 'seguimiento',
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
  }, [activeScope, handleStockUpdateDetected])

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
    if (previousSending.current && !session.sending && activeScope) {
      void loadGroups()
    }
    previousSending.current = session.sending
  }, [activeScope, loadGroups, session.sending])

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

  if (!activeScope) {
    return (
      <section className="cajero-module" aria-labelledby="cajero-seguimiento-title">
        <div className="cajero-module__heading">
          <div><p className="cajero-module__eyebrow">Operación</p><h1 id="cajero-seguimiento-title">Por verificar</h1></div>
        </div>
        <div className="cajero-empty-state" role="status">
          <Play aria-hidden="true" size={28} />
          <div><strong>Inicia una sesión desde Inicio.</strong><p>Necesitas una referencia TumiSoft vigente para verificar grupos.</p></div>
        </div>
      </section>
    )
  }

  return (
    <section className="cajero-module" aria-labelledby="cajero-seguimiento-title">
      <div className="cajero-module__heading">
        <div>
          <p className="cajero-module__eyebrow">Operación</p>
          <h1 id="cajero-seguimiento-title">Por verificar</h1>
          <p>Primero diferencias, después reconteos y cambios de stock.</p>
        </div>
        {groupsState ? <span className="cajero-status">{groupsState.grupos.length} grupos</span> : null}
      </div>

      {error ? (
        <div className="cajero-alert cajero-alert--error" role="alert">
          <AlertCircle aria-hidden="true" size={21} /><p>{error}</p>
          <button className="button button--secondary" onClick={() => void loadGroups()} type="button">Reintentar</button>
        </div>
      ) : null}

      {loading ? (
        <div className="cajero-loading" role="status"><LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando grupos por verificar…</div>
      ) : groupsState ? (
        <CajeroCountTable
          disabled={!session.canCapture}
          groups={sortedGroups}
          key={`${groupsState.conteo_id}:seguimiento`}
          onBufferChange={handleBufferChange}
          scope={activeScope}
          view="seguimiento"
        />
      ) : !error ? (
        <div className="cajero-empty-state" role="status">
          <ShieldCheck aria-hidden="true" size={28} />
          <div><strong>No hay verificaciones cargadas.</strong><p>SOLOG consulta únicamente la cola vigente del backend.</p></div>
        </div>
      ) : null}
    </section>
  )
}