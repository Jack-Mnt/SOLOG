import { useEffect } from 'react'
import { Clock3, ListChecks, RotateCcw, X } from 'lucide-react'
import type { SologDashboardSite } from '../../types'
import {
  formatDashboardActivityDate,
  formatDashboardDuration,
  formatDashboardRelativeActivity,
  getDashboardSessionStateLabel,
} from './admin.dashboard.format'
import { useSologDashboardSiteActivity } from './admin.dashboard.actividad-sede.hook'

export function DashboardSiteActivityDrawer({
  site,
  onClose,
  refreshOperationalState,
}: {
  site: Pick<SologDashboardSite, 'sede_id' | 'sede'>
  onClose: () => void
  refreshOperationalState: () => Promise<void>
}) {
  const {
    data: response,
    error,
    load,
    retry,
    status,
  } = useSologDashboardSiteActivity(refreshOperationalState)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load(site.sede_id)
    })
    return () => {
      active = false
    }
  }, [load, site.sede_id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="control-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        aria-labelledby="dashboard-activity-title"
        aria-modal="true"
        className="control-drawer dashboard-activity-drawer"
        role="dialog"
      >
        <header className="control-drawer__header">
          <div className="control-drawer__heading">
            <h2 id="dashboard-activity-title">Actividad de conteo</h2>
            <strong>{site.sede}</strong>
            {response?.summary.sesion_activa ? (
              <span className="admin-dashboard-badge admin-dashboard-badge--success">Contando ahora</span>
            ) : null}
          </div>
          <button aria-label="Cerrar actividad" className="icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>

        <div className="control-drawer__body dashboard-activity-drawer__body">
          {status === 'loading' ? (
            <div aria-label="Cargando actividad de conteo" className="dashboard-activity-skeleton" role="status">
              <span /><span /><span /><span />
            </div>
          ) : null}

          {error ? (
            <div className="notice notice--error control-local-error" role="alert">
              <div><strong>No se pudo cargar la actividad</strong><p>{error}</p></div>
              <button className="button button--secondary" onClick={retry} type="button">
                <RotateCcw size={16} /> Reintentar
              </button>
            </div>
          ) : null}

          {response ? (
            <>
              <dl className="dashboard-activity-summary">
                <div><dt>Observaciones hoy</dt><dd>{response.summary.observaciones_registradas_hoy}</dd></div>
                <div><dt>Grupos verificados</dt><dd>{response.summary.grupos_verificados_distintos_hoy}</dd></div>
                <div><dt>Sesiones hoy</dt><dd>{response.summary.sesiones_hoy}</dd></div>
                <div>
                  <dt>Última actividad</dt>
                  <dd>{response.summary.ultima_actividad_at
                    ? formatDashboardRelativeActivity(response.summary.ultima_actividad_at, response.server_now)
                    : 'Sin actividad'}</dd>
                </div>
              </dl>

              <section className="dashboard-activity-history" aria-labelledby="dashboard-activity-history-title">
                <div className="dashboard-activity-history__heading">
                  <ListChecks aria-hidden="true" size={18} />
                  <h3 id="dashboard-activity-history-title">Actividad reciente</h3>
                </div>
                {response.sessions.length > 0 ? (
                  <ol className="dashboard-activity-timeline">
                    {response.sessions.map((session) => (
                      <li key={session.conteo_id}>
                        <span className={`dashboard-activity-timeline__marker dashboard-activity-timeline__marker--${session.estado}`} aria-hidden="true" />
                        <article>
                          <div className="dashboard-activity-session__heading">
                            <time dateTime={session.iniciado_at}>{formatDashboardActivityDate(session.iniciado_at)}</time>
                            <span className={`dashboard-session-state dashboard-session-state--${session.estado}`}>
                              {getDashboardSessionStateLabel(session.estado)}
                            </span>
                          </div>
                          <strong>{session.usuario}</strong>
                          <p>
                            {session.observaciones_registradas} {session.observaciones_registradas === 1 ? 'observación' : 'observaciones'}
                            <span aria-hidden="true"> · </span>
                            {session.grupos_verificados_distintos} {session.grupos_verificados_distintos === 1 ? 'grupo distinto' : 'grupos distintos'}
                            <span aria-hidden="true"> · </span>
                            <Clock3 aria-hidden="true" size={14} />
                            {formatDashboardDuration(session.duracion_segundos)}
                          </p>
                        </article>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state">No hay sesiones de conteo registradas.</div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}