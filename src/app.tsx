import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { PageShell } from './components/page-shell'
import { AuthProvider, useAuth } from './features/auth/context'
import { PublicHomePage } from './pages/home'
import { AdminLayout } from './features/solog/admin/admin.layout'
import { SologProvider, useSolog } from './features/solog/context'
import {
  isAdminRoute,
  isCashierRoute,
  replaceRoute,
  resolveTrustedRoute,
  type AdminRoute,
  usePathname,
} from './lib/router'
import { AdminDevicesPage } from './pages/admin.dispositivos'
import { AdminDashboardPage } from './pages/admin.dashboard'
import { DevicePendingPage } from './pages/dispositivo-pendiente'
import { LoginPage } from './pages/login'

const Cajero = lazy(() =>
  import('./features/solog/cajero/cajero').then((module) => ({
    default: module.Cajero,
  })),
)

const AdminIncidentsPage = lazy(() =>
  import('./pages/admin.incidencias').then((module) => ({
    default: module.AdminIncidentsPage,
  })),
)

const AdminCatalogPage = lazy(() =>
  import('./pages/admin.catalogo').then((module) => ({
    default: module.AdminCatalogPage,
  })),
)

const AdminGroupsPage = lazy(() =>
  import('./pages/admin.grupos').then((module) => ({
    default: module.AdminGroupsPage,
  })),
)

const AdminControlPage = lazy(() =>
  import('./pages/admin.control').then((module) => ({
    default: module.AdminControlPage,
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

function AppContent() {
  const auth = useAuth()
  const solog = useSolog()
  const pathname = usePathname()

  const publicPanelRoute =
    auth.status === 'authenticated' &&
    solog.status === 'ready' &&
    solog.bootstrap
      ? solog.bootstrap.usuario.rol === 'admin' ||
        solog.bootstrap.usuario.rol === 'moderador'
        ? '/admin'
        : '/cajero'
      : undefined

  const trustedRoute =
    pathname === '/'
      ? null
      : auth.status === 'unauthenticated'
        ? '/login'
        : solog.status === 'ready' && solog.bootstrap
          ? resolveTrustedRoute(solog.bootstrap, pathname)
          : null

  useEffect(() => {
    if (trustedRoute && pathname !== trustedRoute) {
      replaceRoute(trustedRoute)
    }
  }, [pathname, trustedRoute])

  if (pathname === '/') {
    return <PublicHomePage panelRoute={publicPanelRoute} />
  }

  if (auth.status === 'loading') {
    return (
      <PageShell
        description="Recuperando la sesión existente de Supabase Auth."
        eyebrow="SOLOG"
        title="Cargando…"
        variant="auth"
      />
    )
  }

  if (auth.initializationError) {
    return (
      <PageShell
        description={auth.initializationError}
        eyebrow="Configuración"
        title="SOLOG no está disponible"
        variant="auth"
      />
    )
  }

  if (auth.status === 'unauthenticated') return <LoginPage />

  if (solog.status === 'loading' || solog.status === 'idle') {
    return (
      <PageShell
        description="Validando perfil, rol, sede y dispositivo con el backend."
        eyebrow="SOLOG"
        title="Preparando sesión…"
        variant="auth"
      />
    )
  }

  const handleLogout = async () => {
    await auth.logout()
  }

  if (solog.status === 'error' || !solog.bootstrap) {
    return (
      <PageShell
        description={solog.error ?? 'No se pudo cargar el estado de SOLOG.'}
        eyebrow="SOLOG"
        onLogout={() => void handleLogout()}
        title="No se pudo continuar"
      >
        <button className="button" onClick={() => void solog.refresh()}>
          Reintentar
        </button>
      </PageShell>
    )
  }

  const bootstrap = solog.bootstrap
  const resolvedRoute = resolveTrustedRoute(bootstrap, pathname)

  if (isAdminRoute(resolvedRoute)) {
    return (
      <AdminLayout bootstrap={bootstrap} onLogout={() => void handleLogout()}>
        <Suspense fallback={<div className="empty-state" role="status">Preparando módulo…</div>}>
          {getAdminPage(resolvedRoute)}
        </Suspense>
      </AdminLayout>
    )
  }

  if (resolvedRoute === '/device-pending') {
    return (
      <DevicePendingPage
        bootstrap={bootstrap}
        onLogout={() => void handleLogout()}
      />
    )
  }

  if (isCashierRoute(resolvedRoute)) {
    return (
      <Suspense
        fallback={
          <PageShell
            description="Preparando el espacio operativo."
            eyebrow="SOLOG"
            title="Cargando panel…"
          />
        }
      >
        <Cajero
          bootstrap={bootstrap}
          onLogout={handleLogout}
          route={resolvedRoute}
        />
      </Suspense>
    )
  }

  return <LoginPage />
}

function App() {
  return (
    <AuthProvider>
      <SologProvider>
        <AppContent />
      </SologProvider>
    </AuthProvider>
  )
}

export default App