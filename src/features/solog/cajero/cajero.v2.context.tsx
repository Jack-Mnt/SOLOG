import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { PanelLoader } from '../../../components/panel-loader'
import { PageShell } from '../../../components/page-shell'
import { getOrCreateDeviceToken } from '../device'
import { getSologErrorMessageFromUnknown } from '../errors'
import { clearCajeroMemory, purgePersistedCajeroData } from './cajero.storage'
import { CashierStore } from './cajero.v2.store'

const Context = createContext<CashierStore | null>(null)
export function CashierProvider({ userId, children, onLogout }: { userId: string; children: ReactNode; onLogout: () => Promise<void> }) {
  const [store] = useState(() => new CashierStore(userId, getOrCreateDeviceToken(), clearCajeroMemory))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      purgePersistedCajeroData()
      void store.refresh().catch((e: unknown) => { if (active) setError(getSologErrorMessageFromUnknown(e)) })
    })
    return () => { active = false; store.dispose() }
  }, [store, attempt])
  if (error) return <PageShell title="No se pudo cargar Cajero" description={error} eyebrow="SOLOG" onLogout={() => void onLogout()}>
    <button className="button" onClick={() => { setError(null); setAttempt((n) => n + 1) }}>Reintentar</button>
  </PageShell>
  if (!store.bootstrap) return <PanelLoader />
  return <Context.Provider value={store}>{children}</Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useCashier() {
  const store = useContext(Context)
  if (!store) throw new Error('Falta CashierProvider.')
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  return store
}
