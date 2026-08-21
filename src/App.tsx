import { useEffect } from 'react'
import { PageShell } from './components/PageShell'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { SologProvider, useSolog } from './features/solog/SologContext'
import { replaceRoute, resolveTrustedRoute, usePathname } from './lib/router'
import { AdminPage } from './pages/AdminPage'
import { CountPage } from './pages/CountPage'
import { DevicePendingPage } from './pages/DevicePendingPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

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

  switch (resolveTrustedRoute(bootstrap, pathname)) {
    case '/admin':
      return <AdminPage bootstrap={bootstrap} onLogout={handleLogout} />
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
