import { lazy, Suspense, useState } from 'react'
import { PageShell } from '../components/PageShell'
import { AdminOverview } from '../features/solog/admin/AdminOverview'
import { AdminReports } from '../features/solog/admin/AdminReports'
import { AuthorizedDevices } from '../features/solog/admin/AuthorizedDevices'
import { PendingDevices } from '../features/solog/admin/PendingDevices'
import { useAdminSolog } from '../features/solog/admin/useAdminSolog'
import { useSolog } from '../features/solog/SologContext'
import type {
  SologAdminSite,
  SologAdminReportType,
  SologOperationalBootstrap,
  SologPendingDevice,
} from '../features/solog/types'

const CatalogPanel = lazy(() =>
  import('../features/solog/admin/catalog/CatalogPanel').then((module) => ({
    default: module.CatalogPanel,
  })),
)

const IncidentsPanel = lazy(() =>
  import('../features/solog/admin/incidents/IncidentsPanel').then((module) => ({
    default: module.IncidentsPanel,
  })),
)

type AdminSection =
  | 'overview'
  | 'devices'
  | 'incidents'
  | 'catalog'
  | Exclude<SologAdminReportType, 'summary'>

const ADMIN_NAVIGATION: Array<{
  section: AdminSection
  label: string
  icon: LucideIcon
}> = [
  { section: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { section: 'counts', label: 'Conteos', icon: ListChecks },
  { section: 'differences', label: 'Diferencias', icon: Scale },
  { section: 'history', label: 'Historial', icon: History },
  { section: 'pos_adjustments', label: 'Ajuste POS', icon: SlidersHorizontal },
  { section: 'incidents', label: 'Incidencias', icon: TriangleAlert },
  { section: 'catalog', label: 'Catálogo', icon: BookOpenCheck },
  { section: 'devices', label: 'Dispositivos', icon: TabletSmartphone },
]

export function AdminPage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const solog = useSolog()
  const hasAdminRole =
    bootstrap.usuario.rol === 'admin' || bootstrap.usuario.rol === 'moderador'
  const admin = useAdminSolog({
    enabled: hasAdminRole,
    refreshOperationalState: solog.refresh,
  })

  const handleAuthorize = (device: SologPendingDevice) => {
    const site = admin.bootstrap?.sedes.find(
      (candidate) => candidate.id === device.sede_id,
    )

    if (
      site?.tablet &&
      !window.confirm(
        `${site.nombre} ya tiene una tablet autorizada.\n\nAl autorizar este nuevo dispositivo, la tablet anterior será revocada.\n\n¿Continuar?`,
      )
    ) {
      return
    }

    void admin.authorize(device.id)
  }

  const handleRevoke = (site: SologAdminSite) => {
    if (!site.tablet) return
    if (
      !window.confirm(
        `¿Revocar la tablet autorizada de ${site.nombre}?\n\nLa sede no podrá iniciar nuevos conteos desde ese dispositivo.`,
      )
    ) {
      return
    }

    void admin.revoke(site.tablet.id)
  }

  const handleReject = (device: SologPendingDevice) => {
    if (
      !window.confirm(
        `¿Rechazar la solicitud de tablet para ${device.sede}?`,
      )
    ) {
      return
    }

    void admin.reject(device.id)
  }

  return (
    <PageShell
      description="Operación, incidencias, catálogo, reportes y dispositivos por sede."
      eyebrow={bootstrap.usuario.rol}
      onLogout={onLogout}
      title="Administración SOLOG"
      variant="admin"
      wide
    >
      <div className="admin-toolbar">
        <div>
          <strong>{admin.bootstrap?.usuario.nombre ?? bootstrap.usuario.nombre}</strong>
          <p>Permisos validados por el backend.</p>
        </div>
        <button
          className="button button--secondary"
          disabled={admin.status === 'loading' || admin.mutation !== null}
          onClick={() => void admin.refresh()}
        >
          <RefreshCw className={admin.status === 'loading' ? 'icon-spin' : undefined} size={18} />
          {admin.status === 'loading' ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      {admin.error ? (
        <div className="notice notice--error admin-message" role="alert">
          <strong>No se pudo completar la operación</strong>
          <p>{admin.error}</p>
        </div>
      ) : null}

      {admin.notice ? (
        <div className="notice notice--success" role="status">
          <strong>{admin.notice}</strong>
          <button className="text-button" onClick={admin.dismissNotice}>
            Cerrar
          </button>
        </div>
      ) : null}

      {admin.status === 'loading' && !admin.bootstrap ? (
        <div className="notice" role="status">
          <strong>Cargando administración…</strong>
          <p>Consultando sedes, cobertura y dispositivos.</p>
        </div>
      ) : null}

      {admin.status === 'error' && !admin.bootstrap ? (
        <button className="button" onClick={() => void admin.refresh()}>
          Reintentar
        </button>
      ) : null}

      {admin.bootstrap ? (
        <div className="admin-layout">
          <nav className="admin-main-tabs" aria-label="Secciones administrativas">
            {ADMIN_NAVIGATION.map((item) => {
              const ItemIcon = item.icon
              return (
                <button
                  aria-current={activeSection === item.section ? 'page' : undefined}
                  className={`admin-tab${activeSection === item.section ? ' admin-tab--active' : ''}`}
                  key={item.section}
                  onClick={() => setActiveSection(item.section)}
                >
                  <ItemIcon size={19} /> <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
          <div className="admin-content">
            {activeSection === 'overview' ? (
              <>
                <AdminOverview bootstrap={admin.bootstrap} />
                <AdminReports
                  key="summary"
                  refreshOperationalState={solog.refresh}
                  reportType="summary"
                  sites={admin.bootstrap.sedes}
                />
              </>
            ) : null}

            {activeSection === 'devices' ? (
              <>
                <AuthorizedDevices
                  mutation={admin.mutation}
                  onRevoke={handleRevoke}
                  sites={admin.bootstrap.sedes}
                />
                <PendingDevices
                  devices={admin.bootstrap.dispositivos_pendientes}
                  mutation={admin.mutation}
                  onAuthorize={handleAuthorize}
                  onReject={handleReject}
                />
              </>
            ) : null}

            {activeSection === 'counts' || activeSection === 'differences' || activeSection === 'history' || activeSection === 'pos_adjustments' ? (
              <AdminReports
                key={activeSection}
                refreshOperationalState={solog.refresh}
                reportType={activeSection}
                sites={admin.bootstrap.sedes}
              />
            ) : null}

            {activeSection === 'incidents' ? (
              <Suspense fallback={<div className="empty-state" role="status">Preparando Incidencias…</div>}>
                <IncidentsPanel
                  refreshOperationalState={solog.refresh}
                  sites={admin.bootstrap.sedes}
                />
              </Suspense>
            ) : null}

            {activeSection === 'catalog' ? (
              <Suspense fallback={<div className="empty-state" role="status">Preparando Catálogo…</div>}>
                <CatalogPanel
                  refreshOperationalState={solog.refresh}
                  role={admin.bootstrap.usuario.rol}
                />
              </Suspense>
            ) : null}
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
import {
  BookOpenCheck,
  History,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  TabletSmartphone,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
