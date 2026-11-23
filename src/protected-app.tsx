import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { PanelLoader } from './components/panel-loader'
import { AuthProvider, useAuth } from './features/auth/context'
import { getSologRoute } from './features/solog/api'
import { getSologErrorMessageFromUnknown } from './features/solog/errors'
import { getStoredDeviceToken } from './features/solog/device'
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
    <PanelLoader
      state="error"
      title="No se pudo resolver tu acceso"
      description={error}
      actions={
        <>
          <button
            className="button"
            type="button"
            onClick={() => {
              setError(null)
              setAttempt((value) => value + 1)
            }}
          >
            Reintentar
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void auth.logout()}
          >
            Cerrar sesión
          </button>
        </>
      }
    />
  )
}

type CashierDestination = '/cajero' | '/detalles'

/** La comprobación previa solo lee el token existente: no monta FullRuntime ni toca su journal. */
function checkCashierEntry(): Promise<CashierDestination> {
  let token: string | null = null
  try { token = getStoredDeviceToken() } catch { /* Detalles admite lectura aun sin storage. */ }
  if (!token) return Promise.resolve('/detalles')
  return import('./features/solog/cashier-access')
    .then(({ resolveCashierDestination }) => resolveCashierDestination(token))
}

function CashierDeviceGuard({ userId, onLogout }: { userId: string; onLogout: () => Promise<void> }) {
  const [attempt, setAttempt] = useState(0)
  const pending = useRef<{ userId: string; attempt: number; request: Promise<CashierDestination> } | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!pending.current || pending.current.userId !== userId || pending.current.attempt !== attempt) {
      pending.current = { userId, attempt, request: checkCashierEntry() }
    }
    void pending.current.request
      .then((destination) => {
        if (!active) return
        if (destination === '/detalles') {
          replaceRoute('/detalles')
        } else {
          setAuthorized(true)
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(getSologErrorMessageFromUnknown(cause))
      })
    return () => { active = false }
  }, [attempt, userId])

  if (error) {
    return <PanelLoader state="error" title="No se pudo comprobar el dispositivo"
      description={error} actions={<>
        <button className="button" type="button" onClick={() => {
          setError(null)
          setAuthorized(false)
          setAttempt(value => value + 1)
        }}>Reintentar</button>
        <button className="button button--secondary" type="button"
          onClick={() => void onLogout()}>Cerrar sesión</button>
      </>}/>
  }

  if (!authorized) return <PanelLoader label="Comprobando autorización del dispositivo…" />
  return <Suspense fallback={<PanelLoader />}>
    <CajeroApp userId={userId} onLogout={onLogout} />
  </Suspense>
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
      <PanelLoader
        state="error"
        title="SOLOG no está disponible"
        description={auth.initializationError}
        actions={
          <button
            className="button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        }
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
    return <CashierDeviceGuard key={auth.user?.id ?? ''} userId={auth.user?.id ?? ''} onLogout={auth.logout} />
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
