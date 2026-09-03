import { lazy, Suspense, useEffect } from 'react'
import { PanelLoader } from '../../../components/panel-loader'
import { isCashierRoute, replaceRoute, usePathname } from '../../../lib/router'
import { CashierProvider, useCashier } from './cajero.v2.context'
const Cajero = lazy(() => import('./cajero').then((module) => ({ default: module.Cajero })))

function Panel({ onLogout }: { onLogout: () => Promise<void> }) {
  const store = useCashier()
  const b = store.bootstrap!
  const pathname = usePathname()
  useEffect(() => {
    if (!b.device.autorizado) replaceRoute('/detalles')
    else if (!isCashierRoute(pathname)) replaceRoute('/cajero')
  }, [b.device.autorizado, pathname])
  if (!b.device.autorizado) return <PanelLoader />
  return <Suspense fallback={<PanelLoader />}><Cajero bootstrap={b} route={isCashierRoute(pathname) ? pathname : '/cajero'} onLogout={onLogout} /></Suspense>
}
export function CajeroApp({ userId, onLogout }: { userId: string; onLogout: () => Promise<void> }) {
  return <CashierProvider key={userId} userId={userId} onLogout={onLogout}><Panel onLogout={onLogout} /></CashierProvider>
}
