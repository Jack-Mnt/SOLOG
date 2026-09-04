import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { PageShell } from './components/page-shell'
import { PanelLoader } from './components/panel-loader'
import { AuthProvider, useAuth } from './features/auth/context'
import { getSologRoute } from './features/solog/api'
import { getSologErrorMessageFromUnknown } from './features/solog/errors'
import {
  isAdminRoute,
  isCashierRoute,
  replaceRoute,
  usePathname,
} from './lib/router'
import { LoginPage } from './pages/login'

const CajeroApp = lazy(() =>
  import('./features/solog/cajero/cajero.app').then((module) => ({
    default: module.CajeroApp,
  })),
)

const AdminV2App = lazy(() => import('./features/solog/admin/admin.v2.app').then(module => ({ default: module.AdminV2App })))

const DetailsPage = lazy(() =>
  import('./pages/detalles').then((module) => ({
    default: module.DetailsPage,
  })),
)

function LoginRouteResolver({ userId }: { userId: string }) {
  const auth = useAuth()
  const [attempt, setAttempt] = useState(0)
  const pending = useRef<{ userId: string; attempt: number; request: ReturnType<typeof getSologRoute> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    if (!pending.current || pending.current.userId !== userId || pending.current.attempt !== attempt) {
      pending.current = { userId, attempt, request: getSologRoute(userId) }
    }
    void pending.current.request
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

  if (pathname === '/detalles') {
    return <Suspense fallback={<PanelLoader />}><DetailsPage userId={auth.user?.id ?? ''} onLogout={() => void auth.logout()} /></Suspense>
  }
  if (isCashierRoute(pathname) || pathname === '/count' || pathname === '/cajero/seguimiento') {
    return <Suspense fallback={<PanelLoader />}><CajeroApp userId={auth.user?.id ?? ''} onLogout={auth.logout} /></Suspense>
  }
  if (isAdminRoute(pathname)) {
    return <Suspense fallback={<PanelLoader />}><AdminV2App key={auth.user?.id ?? ''} userId={auth.user?.id ?? ''} route={pathname} onLogout={() => void auth.logout()} /></Suspense>
  }
  return <LoginRouteResolver key={auth.user?.id ?? ''} userId={auth.user?.id ?? ''} />
}

export default function ProtectedApp() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
