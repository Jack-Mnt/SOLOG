import {
  Activity,
  Building2,
  CalendarClock,
  Search,
  SlidersHorizontal,
  TabletSmartphone,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatAdminDate } from './format'
import type { SologAdminBootstrap, SologAdminSite } from '../types'

type SiteFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'active_session'
  | 'without_session'
  | 'authorized_device'
  | 'pending_device'
  | 'without_device'

function CoverageCell({
  label,
  counted,
  total,
  percentage,
}: {
  label: string
  counted: number
  total: number
  percentage: number
}) {
  return (
    <div className="admin-dashboard-coverage" aria-label={`${label}: ${counted} de ${total}, ${percentage}%`}>
      <div><strong>{counted} / {total}</strong><span>{percentage}%</span></div>
      <progress aria-label={label} max="100" value={percentage}>{percentage}%</progress>
    </div>
  )
}

function matchesSiteFilter(
  site: SologAdminSite,
  filter: SiteFilter,
  hasPendingDevice: boolean,
): boolean {
  switch (filter) {
    case 'active': return site.activo
    case 'inactive': return !site.activo
    case 'active_session': return site.sesion_activa !== null
    case 'without_session': return site.sesion_activa === null
    case 'authorized_device': return site.tablet !== null
    case 'pending_device': return hasPendingDevice
    case 'without_device': return site.tablet === null && !hasPendingDevice
    case 'all': return true
  }
}

export function AdminOverview({
  bootstrap,
}: {
  bootstrap: SologAdminBootstrap
}) {
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [siteFilter, setSiteFilter] = useState<SiteFilter>('all')
  const activeSites = bootstrap.sedes.filter((site) => site.activo).length
  const authorizedDevices = bootstrap.sedes.filter((site) => Boolean(site.tablet)).length
  const activeSessions = bootstrap.sedes.filter((site) => site.sesion_activa !== null).length
  const pendingSiteIds = useMemo(
    () => new Set(bootstrap.dispositivos_pendientes.map((device) => device.sede_id)),
    [bootstrap.dispositivos_pendientes],
  )
  const visibleSites = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es')
    return bootstrap.sedes.filter((site) => {
      const matchesSearch = !normalizedSearch || site.nombre.toLocaleLowerCase('es').includes(normalizedSearch)
      return matchesSearch && matchesSiteFilter(site, siteFilter, pendingSiteIds.has(site.id))
    })
  }, [bootstrap.sedes, pendingSiteIds, search, siteFilter])

  return (
    <>
      <section className="admin-dashboard-kpis" aria-label="Indicadores principales">
        <article className="admin-dashboard-kpi admin-dashboard-kpi--primary">
          <span className="admin-dashboard-kpi__icon"><Building2 size={19} /></span>
          <div><span>Sedes activas</span><strong>{activeSites}</strong><small>de {bootstrap.sedes.length} registradas</small></div>
        </article>
        <article className="admin-dashboard-kpi admin-dashboard-kpi--success">
          <span className="admin-dashboard-kpi__icon"><TabletSmartphone size={19} /></span>
          <div><span>Tablets autorizadas</span><strong>{authorizedDevices}</strong><small>dispositivos operativos</small></div>
        </article>
        <article className="admin-dashboard-kpi admin-dashboard-kpi--warning">
          <span className="admin-dashboard-kpi__icon"><CalendarClock size={19} /></span>
          <div><span>Solicitudes pendientes</span><strong>{bootstrap.dispositivos_pendientes.length}</strong><small>por revisar</small></div>
        </article>
        <article className="admin-dashboard-kpi admin-dashboard-kpi--primary">
          <span className="admin-dashboard-kpi__icon"><Activity size={19} /></span>
          <div><span>Sesiones activas</span><strong>{activeSessions}</strong><small>conteos en curso</small></div>
        </article>
      </section>

      <section className="admin-dashboard-sites" aria-labelledby="sites-title">
        <div className="admin-dashboard-sites__toolbar">
          <div>
            <h2 id="sites-title">Resumen por sede</h2>
            <p>Cobertura y estado operativo actual de cada sede.</p>
          </div>
          <div className="admin-dashboard-sites__tools">
            <label className="admin-dashboard-search">
              <Search aria-hidden="true" size={17} />
              <input aria-label="Buscar sede" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sede" type="search" value={search} />
            </label>
            <button
              aria-expanded={filtersOpen}
              className={`button button--secondary${siteFilter !== 'all' ? ' admin-dashboard-filter-button--active' : ''}`}
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
            >
              <SlidersHorizontal size={17} /> Filtros
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="admin-dashboard-filter-panel">
            <label>Estado operativo
              <select onChange={(event) => setSiteFilter(event.target.value as SiteFilter)} value={siteFilter}>
                <option value="all">Todas las sedes</option>
                <option value="active">Sedes activas</option>
                <option value="inactive">Sedes inactivas</option>
                <option value="active_session">Con sesión activa</option>
                <option value="without_session">Sin sesión activa</option>
                <option value="authorized_device">Tablet autorizada</option>
                <option value="pending_device">Tablet pendiente</option>
                <option value="without_device">Sin tablet autorizada</option>
              </select>
            </label>
            {siteFilter !== 'all' ? <button className="text-button" onClick={() => setSiteFilter('all')} type="button">Limpiar filtro</button> : null}
          </div>
        ) : null}

        {bootstrap.sedes.length === 0 ? <div className="empty-state">No hay sedes disponibles.</div> : null}
        {bootstrap.sedes.length > 0 && visibleSites.length === 0 ? <div className="empty-state">No hay sedes que coincidan con la búsqueda o filtro.</div> : null}
        {visibleSites.length > 0 ? (
          <div className="admin-dashboard-table-wrap">
            <table className="admin-dashboard-table">
              <caption>Estado operativo por sede</caption>
              <thead><tr><th>Sede</th><th>Estado</th><th>Cobertura quincenal</th><th>Cobertura de hoy</th><th>Sesión</th><th>Tablet</th></tr></thead>
              <tbody>
                {visibleSites.map((site) => {
                  const pendingDevice = pendingSiteIds.has(site.id)
                  return (
                    <tr key={site.id}>
                      <td><strong>{site.nombre}</strong></td>
                      <td><span className={`admin-dashboard-badge admin-dashboard-badge--${site.activo ? 'success' : 'muted'}`}>{site.activo ? 'Activa' : 'Inactiva'}</span></td>
                      <td><CoverageCell counted={site.cobertura_quincenal.grupos_contados} label={`Cobertura quincenal de ${site.nombre}`} percentage={site.cobertura_quincenal.porcentaje} total={site.cobertura_quincenal.grupos_totales} /></td>
                      <td><CoverageCell counted={site.cobertura_diaria.grupos_contados} label={`Cobertura de hoy de ${site.nombre}`} percentage={site.cobertura_diaria.porcentaje} total={site.cobertura_diaria.grupos_totales} /></td>
                      <td>{site.sesion_activa ? <div className="admin-dashboard-state"><span className="admin-dashboard-badge admin-dashboard-badge--success">Activa</span><small>Desde {formatAdminDate(site.sesion_activa.iniciado_at)}</small></div> : <span className="admin-dashboard-badge admin-dashboard-badge--muted">Sin sesión</span>}</td>
                      <td>{site.tablet ? <div className="admin-dashboard-state"><span className="admin-dashboard-badge admin-dashboard-badge--success">Autorizada</span><small>Último acceso {formatAdminDate(site.tablet.ultimo_acceso_at)}</small></div> : pendingDevice ? <span className="admin-dashboard-badge admin-dashboard-badge--warning">Pendiente</span> : <span className="admin-dashboard-badge admin-dashboard-badge--muted">No autorizada</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}
