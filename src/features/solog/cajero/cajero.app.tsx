import '../../../operational.css'
import './cajero.css'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { PanelLoader } from '../../../components/panel-loader'
import { isCashierRoute, replaceRoute, usePathname } from '../../../lib/router'
import { getOrCreateDeviceToken } from '../device'
import { CashierV4Provider, useCashierV4 } from './cajero.v4.context'
import { CashierV4Store } from './cajero.v4.store'
import { CashierV4DraftStorage } from './cajero.v4.storage'
import { CashierV4Runtime } from './cajero.v4.runtime'
import { getCashierV4ErrorPolicy } from './cajero.v4.errors'
const Cajero = lazy(() => import('./cajero.v4.ui').then((module) => ({ default: module.CajeroV4 })))

function Panel({ runtime, onLogout }: { runtime: CashierV4Runtime; onLogout: () => Promise<void> }) {
  const { store, state } = useCashierV4()
  const b = state.bootstrap
  const pathname = usePathname()
  useEffect(() => {
    if (!b) return
    if (!b.device.autorizado) replaceRoute('/detalles')
    else if (!isCashierRoute(pathname)) replaceRoute('/cajero')
  }, [b, pathname])
  if (!b && state.error) return <PanelLoader state="error" title="No se pudo cargar Cajero" description={getCashierV4ErrorPolicy(state.error).message}
    actions={<><button className="button" type="button" onClick={() => void store.refresh().catch(() => {})}>Reintentar</button><button className="button button--secondary" type="button" onClick={() => void onLogout()}>Cerrar sesión</button></>} />
  if (!b || !b.device.autorizado) return <PanelLoader />
  return <Suspense fallback={<PanelLoader />}><Cajero runtime={runtime} route={isCashierRoute(pathname) ? pathname : '/cajero'} onLogout={onLogout} /></Suspense>
}
export function CajeroApp({ userId, onLogout }: { userId: string; onLogout: () => Promise<void> }) {
  return <CajeroV4Owner key={userId} userId={userId} onLogout={onLogout} />
}

function CajeroV4Owner({ userId, onLogout }: { userId: string; onLogout: () => Promise<void> }) {
  const [{ runtime, error }] = useState(() => {
    try {
      return { runtime: new CashierV4Runtime(new CashierV4Store(userId, getOrCreateDeviceToken()), new CashierV4DraftStorage(window.localStorage)), error: null }
    } catch (error) { return { runtime: null, error } }
  })
  const lifetime = useRef(0)
  useEffect(() => {
    if (!runtime) return
    // Deferred cleanup accommodates StrictMode's effect replay without disposing the live store.
    const generation = ++lifetime.current
    const dispose = () => { if (lifetime.current === generation) { runtime.dispose(); runtime.store.dispose() } }
    runtime.hydrate()
    return () => { queueMicrotask(dispose) }
  }, [runtime])
  if (!runtime) return <PanelLoader state="error" title="No se pudo abrir el almacenamiento de Cajero"
    description={getCashierV4ErrorPolicy(error).message} actions={<button className="button" type="button" onClick={() => void onLogout()}>Cerrar sesión</button>} />
  return <CashierV4Provider store={runtime.store} bootstrapOnMount><Panel runtime={runtime} onLogout={onLogout} /></CashierV4Provider>
}
