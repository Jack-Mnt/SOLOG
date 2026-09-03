import { lazy, Suspense } from 'react'
import { PanelLoader } from './components/panel-loader'
import { PublicHomePage } from './pages/home'
import { usePathname } from './lib/router'

const ProtectedApp = lazy(() => import('./protected-app'))

function App() {
  const pathname = usePathname()

  if (pathname === '/') return <PublicHomePage />

  return (
    <Suspense fallback={<PanelLoader />}>
      <ProtectedApp />
    </Suspense>
  )
}

export default App
