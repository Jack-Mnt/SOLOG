import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { PageShell } from './components/PageShell'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { AdminLayout } from './features/solog/admin/AdminLayout'
import { SologProvider, useSolog } from './features/solog/SologContext'
import {
  isAdminRoute,
  replaceRoute,
  resolveTrustedRoute,
  type AdminRoute,
  usePathname,
} from './lib/router'
import { AdminDevicesPage } from './pages/admin.dispositivos'
import { AdminDashboardPage } from './pages/admin'
import { CountPage } from './pages/CountPage'
import { DevicePendingPage } from './pages/DevicePendingPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

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

  const trustedRoute =
    auth.status === 'unauthenticated'
      ? '/login'
      : solog.status === 'ready' && solog.bootstrap
        ? resolveTrustedRoute(solog.bootstrap, pathname)
        : null

  useEffect(() => {
    if (trustedRoute && pathname !== trustedRoute) {
      replaceRoute(trustedRoute)
    }
  }, [pathname, trustedRoute])

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

  const handleLogout = () => {
    void auth.logout()
  }

  if (solog.status === 'error' || !solog.bootstrap) {
    return (
      <PageShell
        description={solog.error ?? 'No se pudo cargar el estado de SOLOG.'}
        eyebrow="SOLOG"
        onLogout={handleLogout}
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
      <AdminLayout bootstrap={bootstrap} onLogout={handleLogout}>
        <Suspense fallback={<div className="empty-state" role="status">Preparando módulo…</div>}>
          {getAdminPage(resolvedRoute)}
        </Suspense>
      </AdminLayout>
    )
  }

  switch (resolvedRoute) {
    case '/device-pending':
      return (
        <DevicePendingPage bootstrap={bootstrap} onLogout={handleLogout} />
      )
    case '/count':
      return <CountPage bootstrap={bootstrap} onLogout={handleLogout} />
    case '/':
      return <HomePage bootstrap={bootstrap} onLogout={handleLogout} />
    case '/login':
      return <LoginPage />
  }
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
