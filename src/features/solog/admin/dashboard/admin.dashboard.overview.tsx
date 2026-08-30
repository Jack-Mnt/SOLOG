import {
  ChevronRight,
  CircleGauge,
  ListChecks,
  Scale,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import type {
  SologDashboardCoverage,
  SologDashboardResponse,
  SologDashboardSite,
} from '../../types'
import { DashboardSiteActivityDrawer } from './admin.dashboard.actividad-sede.drawer'
import { formatDashboardRelativeActivity } from './admin.dashboard.format'
import { formatAdminDate } from '../admin.format'

const dashboardPeriodFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatPeriodDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : dashboardPeriodFormatter.format(date)
}

function CoverageCell({ coverage, label }: { coverage: SologDashboardCoverage; label: string }) {
  return (
    <div aria-label={`${label}: ${coverage.grupos_contados} de ${coverage.grupos_totales}, ${coverage.porcentaje}%`} className="admin-dashboard-coverage">
      <div><strong>{coverage.grupos_contados} / {coverage.grupos_totales}</strong><span>{coverage.porcentaje}%</span></div>
      <progress aria-label={label} max="100" value={coverage.porcentaje}>{coverage.porcentaje}%</progress>
    </div>
  )
}

export function AdminDashboardLoading() {
  return (
    <div aria-label="Cargando Dashboard" className="admin-dashboard" role="status">
      <div className="admin-dashboard-kpis admin-dashboard-skeleton-kpis">
        {Array.from({ length: 5 }, (_, index) => <span className="admin-dashboard-skeleton" key={index} />)}
      </div>
      <span className="admin-dashboard-skeleton admin-dashboard-skeleton--table" />
    </div>
  )
}

export function AdminOverview({
  dashboard,
  refreshOperationalState,
}: {
  dashboard: SologDashboardResponse
  refreshOperationalState: () => Promise<void>
}) {
  const [selectedSite, setSelectedSite] = useState<SologDashboardSite | null>(null)
  const coverage = dashboard.kpis.cobertura_quincenal
  const verifiedToday = dashboard.kpis.verificados_hoy
  const requiredToday = dashboard.kpis.requeridos_hoy
  const activeSites = dashboard.kpis.contados_hoy.sedes_con_actividad

  return (
    <div className="admin-dashboard">
      <section className="admin-dashboard-kpis" aria-label="Indicadores principales">
        <article className="admin-dashboard-kpi admin-dashboard-kpi--coverage">
          <span className="admin-dashboard-kpi__icon"><CircleGauge size={19} /></span>
          <div><span>Cobertura quincenal</span><strong>{coverage.porcentaje}%</strong><small>{coverage.grupos_contados} / {coverage.grupos_totales} grupos</small></div>
          <progress aria-label="Cobertura quincenal global" max="100" value={coverage.porcentaje}>{coverage.porcentaje}%</progress>
        </article>
        <article className="admin-dashboard-kpi admin-dashboard-kpi--success">
          <span className="admin-dashboard-kpi__icon"><ListChecks size={19} /></span>
          <div><span>Verificados hoy</span><strong>{verifiedToday} / {requiredToday}</strong><small>seguimiento dinámico · {activeSites} {activeSites === 1 ? 'sede' : 'sedes'} con actividad</small></div>
        </article>
        <article className={`admin-dashboard-kpi${dashboard.kpis.diferencias_vigentes > 0 ? ' admin-dashboard-kpi--warning' : ''}`}>
          <span className="admin-dashboard-kpi__icon"><Scale size={19} /></span>
          <div><span>Diferencias vigentes</span><strong>{dashboard.kpis.diferencias_vigentes}</strong><small>saldo operativo confirmado</small></div>
        </article>
        <article className={`admin-dashboard-kpi${dashboard.kpis.diferencias_pendientes > 0 ? ' admin-dashboard-kpi--warning' : ''}`}>
          <span className="admin-dashboard-kpi__icon"><TriangleAlert size={19} /></span>
          <div><span>Diferencias pendientes</span><strong>{dashboard.kpis.diferencias_pendientes}</strong><small>requieren seguimiento</small></div>
        </article>
        <article className={`admin-dashboard-kpi${dashboard.kpis.persistentes > 0 ? ' admin-dashboard-kpi--danger' : ''}`}>
          <span className="admin-dashboard-kpi__icon"><ShieldAlert size={19} /></span>
          <div><span>Persistentes</span><strong>{dashboard.kpis.persistentes}</strong><small>requieren atención</small></div>
        </article>
      </section>

      <section className="admin-dashboard-sites" aria-labelledby="sites-title">
        <div className="admin-dashboard-sites__toolbar">
          <div><h2 id="sites-title">Resumen por sede</h2><p>Quincena: {formatPeriodDate(dashboard.periodo.quincena_desde)} – {formatPeriodDate(dashboard.periodo.quincena_hasta)}.</p></div>
        </div>

        {dashboard.sedes.length === 0 ? <div className="empty-state">No hay sedes disponibles.</div> : null}
        {dashboard.sedes.length > 0 ? (
          <div className="admin-dashboard-table-wrap">
            <table className="admin-dashboard-table">
              <caption>Estado operativo por sede</caption>
              <thead><tr><th>Sede</th><th>Cobertura quincenal</th><th>Seguimiento diario</th><th>Vigentes</th><th>Pendientes</th><th>Persistentes</th><th>Actividad</th><th aria-label="Abrir actividad" /></tr></thead>
              <tbody>
                {dashboard.sedes.map((site) => (
                  <tr
                    aria-label={`Ver actividad de conteo de ${site.sede}`}
                    className="admin-dashboard-site-row"
                    key={site.sede_id}
                    onClick={() => setSelectedSite(site)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedSite(site)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td><strong>{site.sede}</strong></td>
                    <td><CoverageCell coverage={site.cobertura_quincenal} label={`Cobertura quincenal de ${site.sede}`} /></td>
                    <td><CoverageCell coverage={site.cobertura_hoy} label={`Grupos verificados y requeridos hoy en ${site.sede}`} /></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.diferencias_vigentes > 0 ? 'warning' : 'muted'}`}>{site.diferencias_vigentes}</span></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.diferencias_pendientes > 0 ? 'warning' : 'muted'}`}>{site.diferencias_pendientes}</span></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.persistentes > 0 ? 'danger' : 'muted'}`}>{site.persistentes}</span></td>
                    <td>
                      {site.actividad.sesion_activa ? (
                        <div className="admin-dashboard-state"><span className="admin-dashboard-badge admin-dashboard-badge--success">Contando ahora</span>{site.actividad.sesion_iniciada_at ? <small>Desde {formatAdminDate(site.actividad.sesion_iniciada_at)}</small> : null}</div>
                      ) : site.actividad.ultima_actividad_at ? (
                        <span className="admin-dashboard-activity">{formatDashboardRelativeActivity(site.actividad.ultima_actividad_at, dashboard.server_now)}</span>
                      ) : (
                        <span className="admin-dashboard-badge admin-dashboard-badge--muted">Sin actividad</span>
                      )}
                    </td>
                    <td className="admin-dashboard-row-action"><ChevronRight aria-hidden="true" size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {selectedSite ? (
        <DashboardSiteActivityDrawer
          key={selectedSite.sede_id}
          onClose={() => setSelectedSite(null)}
          refreshOperationalState={refreshOperationalState}
          site={selectedSite}
        />
      ) : null}
    </div>
  )
}