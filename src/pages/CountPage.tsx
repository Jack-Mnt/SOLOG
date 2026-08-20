import { PageShell } from '../components/PageShell'
import { CountGroupCard } from '../features/solog/count/CountGroupCard'
import { formatRemainingTime } from '../features/solog/count/expiry'
import { RecountGroupCard } from '../features/solog/count/RecountGroupCard'
import { useCountSession } from '../features/solog/count/useCountSession'
import { readSelectedView } from '../features/solog/count/views'
import type { SologOperationalBootstrap } from '../features/solog/types'
import { navigateTo } from '../lib/router'

export function CountPage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  const selectedView = readSelectedView()
  const session = bootstrap.sesion_activa
  const smartViewBlocked =
    selectedView &&
    (selectedView.vista === 'cambios_recientes' ||
      selectedView.vista === 'stock_negativo' ||
      selectedView.vista === 'contar_detalladamente') &&
    !bootstrap.cobertura_quincenal.completa

  if (!session || !selectedView || smartViewBlocked) {
    return (
      <PageShell description="Selecciona una vista desde el inicio operativo." eyebrow={bootstrap.sede.nombre} onLogout={onLogout} title="Vista no disponible">
        <button className="button" onClick={() => navigateTo('/')}><ArrowLeft size={19} /> Volver al inicio</button>
      </PageShell>
    )
  }

  return <ActiveCount bootstrap={bootstrap} onLogout={onLogout} selectedView={selectedView} />
}

function ActiveCount({
  bootstrap,
  onLogout,
  selectedView,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
  selectedView: NonNullable<ReturnType<typeof readSelectedView>>
}) {
  const count = useCountSession(bootstrap, selectedView)
  const session = bootstrap.sesion_activa
  if (!session) return null
  const isRecount = selectedView.vista === 'contar_detalladamente'
  const pendingThisSession = count.queue?.conteo_id === session.id ? count.queue.items.length : 0

  const handleBack = async () => {
    if (count.syncing) return
    const sent = await count.flush()
    if (sent) navigateTo('/')
  }

  const handleFinish = async () => {
    if (!window.confirm('Se enviarán todas las capturas pendientes y se finalizará esta sesión general. ¿Continuar?')) return
    if (await count.finish()) navigateTo('/')
  }

  return (
    <PageShell
      description={isRecount ? 'Reconteo individual de observaciones elegibles.' : 'Registra cantidades localmente; se enviarán juntas al salir de la vista.'}
      eyebrow={bootstrap.sede.nombre}
      onLogout={onLogout}
      title={selectedView.title}
      wide
    >
      <div className="count-summary" aria-label="Estado de la sesión">
        <div><span>Vista</span><strong>{selectedView.title}</strong></div>
        <div><span>Sede</span><strong>{bootstrap.sede.nombre}</strong></div>
        <div><span>{isRecount ? 'Observaciones' : 'Progreso local'}</span><strong>{isRecount ? count.groups.length : `${count.countedGroups} / ${count.groups.length}`}</strong></div>
        <div><span>Vigencia del Excel</span><strong className="metric-with-icon"><Clock3 size={17} /> {formatRemainingTime(count.expiry.remainingSeconds)}</strong></div>
      </div>

      {count.expiry.warning ? <div className="notice notice--warning" role="alert"><strong>{count.expiry.warning}</strong></div> : null}
      {count.expiry.expired ? <div className="notice notice--warning" role="alert"><strong>El inventario venció</strong><p>No se permiten capturas nuevas. Se intentará transmitir lo registrado antes del vencimiento.</p></div> : null}
      {count.staleQueue ? (
        <div className="notice notice--warning" role="alert"><strong>Capturas de una sesión anterior</strong><p>No se mezclarán con esta sesión.</p><button className="button button--secondary" onClick={count.clearStaleQueue}>Limpiar datos obsoletos</button></div>
      ) : null}
      {count.error ? <div className="notice notice--error" role="alert"><strong>No se pudo completar la operación</strong><p>{count.error}</p></div> : null}
      {count.status === 'loading' ? <p className="empty-state" role="status">Cargando grupos…</p> : null}
      {count.status === 'error' ? <button className="button" onClick={() => void count.loadGroups()}>Reintentar carga</button> : null}

      {count.status === 'ready' ? (
        <section className="content-section" aria-labelledby="groups-title">
          <div className="section-heading"><div><div className="section-title-row"><span className="section-icon"><ListChecks size={20} /></span><h2 id="groups-title">Grupos</h2></div><p>{isRecount ? 'Cada fila usa el detalle original como identidad.' : 'El stock teórico procede del snapshot congelado.'}</p></div></div>
          <div className="count-group-list">
            {count.groups.map((group) =>
              isRecount && group.detalle_id ? (
                <RecountGroupCard
                  captureDisabled={count.expiry.expired || count.finishing || count.staleQueue}
                  group={group}
                  key={group.detalle_id}
                  onRecount={count.recount}
                  result={count.recountResults[group.detalle_id]}
                  saving={count.recountingIds.includes(group.detalle_id)}
                />
              ) : !isRecount ? (
                <CountGroupCard
                  captureDisabled={count.expiry.expired || count.finishing || count.syncing || count.staleQueue}
                  group={group}
                  key={group.grupo_id}
                  onCapture={count.capture}
                  pending={count.pendingByGroup[group.grupo_id]}
                  result={count.batchResults[group.grupo_id]}
                />
              ) : null,
            )}
          </div>
          {count.groups.length === 0 ? <p className="empty-state">Esta vista no contiene grupos pendientes.</p> : null}
        </section>
      ) : null}

      <div className="finish-bar">
        <div><strong>{pendingThisSession} capturas pendientes en la tablet</strong><p>Salir envía los lotes pendientes y actualiza la cobertura.</p></div>
        <div className="admin-report-filter-actions">
          <button className="button button--secondary" disabled={count.syncing || count.finishing || count.staleQueue} onClick={() => void count.flush()}><CloudUpload size={19} /> {count.syncing ? 'Enviando…' : 'Enviar ahora'}</button>
          <button className="button" disabled={count.syncing || count.finishing || count.staleQueue} onClick={() => void handleBack()}><ArrowLeft size={19} /> Volver al inicio</button>
          <button className="button button--danger" disabled={count.syncing || count.finishing || count.staleQueue} onClick={() => void handleFinish()}>{count.finishing ? <RotateCcw className="icon-spin" size={18} /> : <Square size={17} />} {count.finishing ? 'Finalizando…' : 'Finalizar sesión'}</button>
        </div>
      </div>
    </PageShell>
  )
}
import {
  ArrowLeft,
  Clock3,
  CloudUpload,
  ListChecks,
  RotateCcw,
  Square,
} from 'lucide-react'
