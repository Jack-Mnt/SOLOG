import { useState } from 'react'
import { PageShell } from '../components/PageShell'
import { AdminOverview } from '../features/solog/admin/AdminOverview'
import { AdminReports } from '../features/solog/admin/AdminReports'
import { AuthorizedDevices } from '../features/solog/admin/AuthorizedDevices'
import { PendingDevices } from '../features/solog/admin/PendingDevices'
import { useAdminSolog } from '../features/solog/admin/useAdminSolog'
import { useSolog } from '../features/solog/SologContext'
import type {
  SologAdminSite,
  SologOperationalBootstrap,
  SologPendingDevice,
} from '../features/solog/types'

export function AdminPage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  const [activeSection, setActiveSection] = useState<
    'summary' | 'devices' | 'reports'
  >('summary')
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
      description="Resumen operativo y administración de tablets por sede."
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
            <button
              aria-current={activeSection === 'summary' ? 'page' : undefined}
              className={`admin-tab${activeSection === 'summary' ? ' admin-tab--active' : ''}`}
              onClick={() => setActiveSection('summary')}
            >
              <LayoutDashboard size={19} /> <span>Resumen</span>
            </button>
            <button
              aria-current={activeSection === 'devices' ? 'page' : undefined}
              className={`admin-tab${activeSection === 'devices' ? ' admin-tab--active' : ''}`}
              onClick={() => setActiveSection('devices')}
            >
              <TabletSmartphone size={19} /> <span>Dispositivos</span>
            </button>
            <button
              aria-current={activeSection === 'reports' ? 'page' : undefined}
              className={`admin-tab${activeSection === 'reports' ? ' admin-tab--active' : ''}`}
              onClick={() => setActiveSection('reports')}
            >
              <TableProperties size={19} /> <span>Reportes</span>
            </button>
          </nav>
          <div className="admin-content">
            {activeSection === 'summary' ? (
              <AdminOverview bootstrap={admin.bootstrap} />
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

            {activeSection === 'reports' ? (
              <AdminReports
                refreshOperationalState={solog.refresh}
                sites={admin.bootstrap.sedes}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
import {
  LayoutDashboard,
  RefreshCw,
  TabletSmartphone,
  TableProperties,
} from 'lucide-react'
