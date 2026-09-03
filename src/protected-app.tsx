import { lazy, Suspense, useEffect, useState } from 'react'
import { PageShell } from './components/page-shell'
import { PanelLoader } from './components/panel-loader'
import { AuthProvider, useAuth } from './features/auth/context'
import { getSologRoute } from './features/solog/api'
import { SologProvider, useSolog } from './features/solog/context'
import { getSologErrorMessageFromUnknown } from './features/solog/errors'
import {
  isAdminRoute,
  isCashierRoute,
  replaceRoute,
  resolveTrustedRoute,
  usePathname,
} from './lib/router'
import { LoginPage } from './pages/login'

const AdminApp = lazy(() =>
  import('./features/solog/admin/admin-app').then((module) => ({
    default: module.AdminApp,
  })),
)

const CajeroApp = lazy(() =>
  import('./features/solog/cajero/cajero.app').then((module) => ({
    default: module.CajeroApp,
  })),
)

const DetailsPage = lazy(() =>
  import('./pages/detalles').then((module) => ({
    default: module.DetailsPage,
  })),
)

function LoginRouteResolver({ userId }: { userId: string }) {
  const auth = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void getSologRoute()
      .then((response) => {
        if (active) replaceRoute(response.route)
      })
      .catch((routeError: unknown) => {
        if (active) setError(getSologErrorMessageFromUnknown(routeError))
      })

    return () => {
      active = false
    }
  }, [attempt, userId])

  if (!error) return <PanelLoader />

  return (
    <PageShell
      description={error}
      eyebrow="SOLOG"
      onLogout={() => void auth.logout()}
      title="No se pudo resolver tu acceso"
      variant="auth"
    >
      <button
        className="button"
        onClick={() => {
          setError(null)
          setAttempt((value) => value + 1)
        }}
      >
        Reintentar
      </button>
    </PageShell>
  )
}

function OperationalApp() {
  const auth = useAuth()
  const solog = useSolog()
  const pathname = usePathname()

  const trustedRoute =
    solog.status === 'ready' && solog.bootstrap
      ? resolveTrustedRoute(solog.bootstrap, pathname)
      : null

  useEffect(() => {
    if (trustedRoute && pathname !== trustedRoute) {
      replaceRoute(trustedRoute)
    }
  }, [pathname, trustedRoute])

  if (solog.status === 'loading' || solog.status === 'idle') {
    return <PanelLoader />
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
      <Suspense fallback={<PanelLoader />}>
        <AdminApp
          bootstrap={bootstrap}
          onLogout={() => void handleLogout()}
          route={resolvedRoute}
        />
      </Suspense>
    )
  }

  if (resolvedRoute === '/detalles') {
    return (
      <Suspense fallback={<PanelLoader />}>
        <DetailsPage
          bootstrap={bootstrap}
          onLogout={() => void handleLogout()}
        />
      </Suspense>
    )
  }

  if (isCashierRoute(resolvedRoute)) {
    return (
      <Suspense
        fallback={<PanelLoader />}
      >
        <CajeroApp
          userId={auth.user?.id ?? ''}
          onLogout={handleLogout}
        />
      </Suspense>
    )
  }

  return <LoginPage />
}

function AuthenticatedApp() {
  const auth = useAuth()
  const pathname = usePathname()

  useEffect(() => {
    if (auth.status === 'unauthenticated' && pathname !== '/login') {
      replaceRoute('/login')
    }
  }, [auth.status, pathname])

  if (auth.status === 'loading') return <PanelLoader />

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

  if (pathname === '/login') {
    return (
      <LoginRouteResolver
        key={auth.user?.id ?? ''}
        userId={auth.user?.id ?? ''}
      />
    )
  }

  if (isCashierRoute(pathname) || pathname === '/count' || pathname === '/cajero/seguimiento') {
    return <Suspense fallback={<PanelLoader />}><CajeroApp userId={auth.user?.id ?? ''} onLogout={auth.logout} /></Suspense>
  }
  return (
    <SologProvider>
      <OperationalApp />
    </SologProvider>
  )
}

export default function ProtectedApp() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
