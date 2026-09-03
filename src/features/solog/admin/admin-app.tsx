import { lazy, Suspense, type ReactNode } from 'react'
import { PanelLoader } from '../../../components/panel-loader'
import type { AdminRoute } from '../../../lib/router'
import type { SologOperationalBootstrap } from '../types'
import { AdminLayout } from './admin.layout'

const AdminDashboardPage = lazy(() =>
  import('../../../pages/admin.dashboard').then((module) => ({
    default: module.AdminDashboardPage,
  })),
)

const AdminControlPage = lazy(() =>
  import('../../../pages/admin.control').then((module) => ({
    default: module.AdminControlPage,
  })),
)

const AdminIncidentsPage = lazy(() =>
  import('../../../pages/admin.incidencias').then((module) => ({
    default: module.AdminIncidentsPage,
  })),
)

const AdminCatalogPage = lazy(() =>
  import('../../../pages/admin.catalogo').then((module) => ({
    default: module.AdminCatalogPage,
  })),
)

const AdminGroupsPage = lazy(() =>
  import('../../../pages/admin.grupos').then((module) => ({
    default: module.AdminGroupsPage,
  })),
)

const AdminDevicesPage = lazy(() =>
  import('../../../pages/admin.dispositivos').then((module) => ({
    default: module.AdminDevicesPage,
  })),
)

function getAdminPage(route: AdminRoute): ReactNode {
  switch (route) {
    case '/admin':
      return <AdminDashboardPage />
    case '/admin/control':
      return <AdminControlPage />
    case '/admin/incidencias':
      return <AdminIncidentsPage />
    case '/admin/catalogo':
      return <AdminCatalogPage />
    case '/admin/grupos':
      return <AdminGroupsPage />
    case '/admin/dispositivos':
      return <AdminDevicesPage />
  }
}

export function AdminApp({
  bootstrap,
  onLogout,
  route,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
  route: AdminRoute
}) {
  return (
    <AdminLayout bootstrap={bootstrap} onLogout={onLogout}>
      <Suspense fallback={<PanelLoader contained />}>
        {getAdminPage(route)}
      </Suspense>
    </AdminLayout>
  )
}
