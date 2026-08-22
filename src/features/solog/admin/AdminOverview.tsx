import {
  CircleGauge,
  ListChecks,
  Search,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  SologDashboardCoverage,
  SologDashboardResponse,
} from '../types'
import { formatAdminDate } from './format'

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

function formatRelativeActivity(value: string, serverNow: string): string {
  const activityTime = new Date(value).getTime()
  const serverTime = new Date(serverNow).getTime()
  if (!Number.isFinite(activityTime) || !Number.isFinite(serverTime)) return formatAdminDate(value)

  const elapsedMinutes = Math.max(0, Math.floor((serverTime - activityTime) / 60_000))
  if (elapsedMinutes < 1) return 'Hace menos de 1 min'
  if (elapsedMinutes < 60) return `Hace ${elapsedMinutes} min`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `Hace ${elapsedHours} h`
  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 7) return `Hace ${elapsedDays} d`
  return formatAdminDate(value)
}

export function AdminDashboardLoading() {
  return (
    <div aria-label="Cargando Dashboard" className="admin-dashboard" role="status">
      <div className="admin-dashboard-kpis admin-dashboard-skeleton-kpis">
        {Array.from({ length: 4 }, (_, index) => <span className="admin-dashboard-skeleton" key={index} />)}
      </div>
      <span className="admin-dashboard-skeleton admin-dashboard-skeleton--table" />
    </div>
  )
}

export function AdminOverview({ dashboard }: { dashboard: SologDashboardResponse }) {
  const [search, setSearch] = useState('')
  const visibleSites = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es')
    if (!normalizedSearch) return dashboard.sedes
    return dashboard.sedes.filter((site) => site.sede.toLocaleLowerCase('es').includes(normalizedSearch))
  }, [dashboard.sedes, search])
  const coverage = dashboard.kpis.cobertura_quincenal
  const countedToday = dashboard.kpis.contados_hoy

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
          <div><span>Contados hoy</span><strong>{countedToday.grupos_contados}</strong><small>{countedToday.sedes_con_actividad} {countedToday.sedes_con_actividad === 1 ? 'sede' : 'sedes'} con actividad</small></div>
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
          <label className="admin-dashboard-search">
            <Search aria-hidden="true" size={17} />
            <input aria-label="Buscar sede" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sede" type="search" value={search} />
          </label>
        </div>

        {dashboard.sedes.length === 0 ? <div className="empty-state">No hay sedes disponibles.</div> : null}
        {dashboard.sedes.length > 0 && visibleSites.length === 0 ? <div className="empty-state">No hay sedes que coincidan con la búsqueda.</div> : null}
        {visibleSites.length > 0 ? (
          <div className="admin-dashboard-table-wrap">
            <table className="admin-dashboard-table">
              <caption>Estado operativo por sede</caption>
              <thead><tr><th>Sede</th><th>Cobertura quincenal</th><th>Cobertura hoy</th><th>Diferencias</th><th>Persistentes</th><th>Actividad</th></tr></thead>
              <tbody>
                {visibleSites.map((site) => (
                  <tr key={site.sede_id}>
                    <td><strong>{site.sede}</strong></td>
                    <td><CoverageCell coverage={site.cobertura_quincenal} label={`Cobertura quincenal de ${site.sede}`} /></td>
                    <td><CoverageCell coverage={site.cobertura_hoy} label={`Cobertura de hoy de ${site.sede}`} /></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.diferencias_pendientes > 0 ? 'warning' : 'muted'}`}>{site.diferencias_pendientes}</span></td>
                    <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.persistentes > 0 ? 'danger' : 'muted'}`}>{site.persistentes}</span></td>
                    <td>
                      {site.actividad.sesion_activa ? (
                        <div className="admin-dashboard-state"><span className="admin-dashboard-badge admin-dashboard-badge--success">Contando ahora</span>{site.actividad.sesion_iniciada_at ? <small>Desde {formatAdminDate(site.actividad.sesion_iniciada_at)}</small> : null}</div>
                      ) : site.actividad.ultima_actividad_at ? (
                        <span className="admin-dashboard-activity">{formatRelativeActivity(site.actividad.ultima_actividad_at, dashboard.server_now)}</span>
                      ) : (
                        <span className="admin-dashboard-badge admin-dashboard-badge--muted">Sin actividad</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
