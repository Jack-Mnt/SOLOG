import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAdminQuery } from '../admin.v2.context'
import { QueryState } from '../admin.v2.presentation'
import { orderedAdminSites } from '../admin.site-ui'
import { DashboardSiteCard } from './admin.dashboard.metrics.cards'
import { useDashboardMetrics } from './admin.dashboard.metrics.hooks'
import { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type { SiteOverview } from './admin.dashboard.metrics.types'
import './admin.dashboard.metrics.css'
import './admin.dashboard.metrics.views.css'
import './admin.dashboard.metrics.activity-episodes.css'
import './admin.dashboard.metrics.day.css'

type AdminIdentity = {
  id: string
  rol: 'admin' | 'moderador'
}

const updatedAt = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Lima',
  hour12: true,
})

function DashboardContent({ identity }: { identity: AdminIdentity }) {
  const metrics = useMemo(
    () => new DashboardMetricsStore(identity.id, identity.rol),
    [identity.id, identity.rol],
  )
  // StrictMode ejecuta setup/cleanup/setup sin desmontar el componente.
  // Diferir dispose a una microtarea permite cancelar el cleanup simulado;
  // en un desmontaje real el store se libera y descarta respuestas pendientes.
  const lifecycle = useRef(0)
  useEffect(() => {
    const generation = ++lifecycle.current
    return () => {
      queueMicrotask(() => {
        if (lifecycle.current === generation) metrics.dispose()
      })
    }
  }, [metrics])

  const overview = useDashboardMetrics(metrics, 'overview', {})
  const [expandedSiteId, setExpandedSiteId] = useState<string | null | undefined>(undefined)

  const sites = useMemo(
    () => orderedAdminSites(
      (overview.data?.data.sites ?? []).map(site => ({ ...site, nombre: site.site_name })),
    ),
    [overview.data],
  )

  // undefined = primera sede del orden aprobado; null = usuario colapsó todas.
  const expandedId = expandedSiteId === undefined
    ? sites[0]?.site_id ?? null
    : expandedSiteId === null
      ? null
      : sites.some(site => site.site_id === expandedSiteId)
        ? expandedSiteId
        : sites[0]?.site_id ?? null

  const refresh = () => {
    metrics.refresh()
    overview.retry()
  }

  const toggle = (site: SiteOverview) => {
    setExpandedSiteId(current => {
      const selected = current === undefined ? sites[0]?.site_id ?? null : current
      return selected === site.site_id ? null : site.site_id
    })
  }

  return (
    <section className="solog-dash" aria-labelledby="solog-dashboard-sites-heading">
      <div className="solog-dash__heading">
        <div>
          <h2 id="solog-dashboard-sites-heading">Resumen operativo por sede</h2>
          <p>Cobertura de ronda, precisión, riesgo y diferencias valorizadas.</p>
        </div>
        <div className="solog-dash__toolbar">
          {overview.data && (
            <span className="solog-dash__site-count">
              {sites.length} {sites.length === 1 ? 'sede' : 'sedes'}
            </span>
          )}
          {overview.data && (
            <time className="solog-dash__updated" dateTime={overview.data.generated_at}>
              Actualizado: {updatedAt.format(new Date(overview.data.generated_at))}
            </time>
          )}
          <button type="button" className="button button--secondary solog-dash__refresh"
            onClick={refresh} disabled={overview.loading} aria-label="Actualizar Dashboard">
            <RefreshCw size={16} aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </div>

      {overview.error ? (
        <QueryState error={overview.error} retry={overview.retry} />
      ) : !overview.data ? (
        <QueryState retry={overview.retry} />
      ) : sites.length === 0 ? (
        <div className="solog-dash__empty" role="status">
          No hay sedes activas disponibles para mostrar.
        </div>
      ) : (
        <div className="solog-dash__list">
          {sites.map(site => (
            <DashboardSiteCard key={site.site_id} site={site} store={metrics}
              expanded={expandedId === site.site_id}
              onToggle={() => toggle(site)} />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Mantiene el export que utiliza el Shell Admin y sustituye por completo
 * las tarjetas, KPI, Grid y Drawer antiguos, sin alterar las rutas ni Control.
 */
export function AdminDashboardV2() {
  const bootstrap = useAdminQuery('bootstrap', {})
  const identity = bootstrap.data?.identity

  if (!identity) {
    return bootstrap.error
      ? <QueryState error={bootstrap.error} retry={bootstrap.retry} />
      : <QueryState retry={bootstrap.retry} />
  }
  return (
    <DashboardContent key={`${identity.id}:${identity.rol}`} identity={identity} />
  )
}
