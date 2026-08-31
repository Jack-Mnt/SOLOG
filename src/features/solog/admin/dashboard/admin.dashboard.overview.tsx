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
  SologDashboardDailyCoverage,
  SologDashboardResponse,
  SologDashboardSite,
} from '../../types'
import { DashboardSiteActivityDrawer } from './admin.dashboard.actividad-sede.drawer'
import { formatDashboardRelativeActivity } from './admin.dashboard.format'

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

function CoverageCell({ coverage, label }: { coverage: SologDashboardCoverage | SologDashboardDailyCoverage; label: string }) {
  const counted = 'grupos_verificados' in coverage ? coverage.grupos_verificados : coverage.grupos_contados
  const total = 'grupos_requeridos' in coverage ? coverage.grupos_requeridos : coverage.grupos_totales
  return (
    <div aria-label={`${label}: ${counted} de ${total}, ${coverage.porcentaje}%`} className="admin-dashboard-coverage">
      <div><strong>{counted} / {total}</strong><span>{coverage.porcentaje}%</span></div>
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
  const countedToday = dashboard.kpis.contados_hoy.grupos_contados

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
          <div><span>Contados hoy</span><strong>{countedToday}</strong><small>grupos contados hoy</small></div>
        </article>
        <article className={`admin-dashboard-kpi${dashboard.kpis.recontar > 0 ? ' admin-dashboard-kpi--warning' : ''}`}>
          <span className="admin-dashboard-kpi__icon"><Scale size={19} /></span>
          <div><span>Por recontar</span><strong>{dashboard.kpis.recontar}</strong><small>requieren reconteo</small></div>
        </article>
        <article className={`admin-dashboard-kpi${dashboard.kpis.confirmadas > 0 ? ' admin-dashboard-kpi--warning' : ''}`}>
          <span className="admin-dashboard-kpi__icon"><TriangleAlert size={19} /></span>
          <div><span>Confirmadas</span><strong>{dashboard.kpis.confirmadas}</strong><small>diferencias confirmadas</small></div>
        </article>
        <article className={`admin-dashboard-kpi${dashboard.kpis.inconsistentes > 0 ? ' admin-dashboard-kpi--danger' : ''}`}>
          <span className="admin-dashboard-kpi__icon"><ShieldAlert size={19} /></span>
          <div><span>Inconsistentes</span><strong>{dashboard.kpis.inconsistentes}</strong><small>requieren atención</small></div>
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
              <thead><tr><th>Sede</th><th>Cobertura quincenal</th><th>Cobertura diaria</th><th>Por recontar</th><th>Confirmadas</th><th>Inconsistentes</th><th>Actividad</th><th aria-label="Abrir actividad" /></tr></thead>
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
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.recontar > 0 ? 'warning' : 'muted'}`}>{site.recontar}</span></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.confirmadas > 0 ? 'warning' : 'muted'}`}>{site.confirmadas}</span></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.inconsistentes > 0 ? 'danger' : 'muted'}`}>{site.inconsistentes}</span></td>
                    <td>
                      {site.actividad.sesion_activa ? (
                        <div className="admin-dashboard-state"><span className="admin-dashboard-badge admin-dashboard-badge--success">Contando ahora</span></div>
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
