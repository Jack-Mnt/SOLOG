import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { PanelLoader } from '../../../components/panel-loader'
import { getOrCreateDeviceToken } from '../device'
import { getSologErrorMessageFromUnknown } from '../errors'
import { clearCajeroMemory, purgePersistedCajeroData } from './cajero.storage'
import { CashierV3Store } from './cajero.v3.store'

const Context = createContext<CashierV3Store | null>(null)
export function CashierV3Provider({ userId, children, onLogout }: { userId: string; children: ReactNode; onLogout: () => Promise<void> }) {
  const [store] = useState(() => new CashierV3Store(userId, getOrCreateDeviceToken(), clearCajeroMemory))
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
  if (error) return <PanelLoader
    state="error"
    title="No se pudo cargar Cajero"
    description={error}
    actions={
      <>
        <button
          className="button"
          type="button"
          onClick={() => { setError(null); setAttempt((n) => n + 1) }}
        >
          Reintentar
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void onLogout()}
        >
          Cerrar sesión
        </button>
      </>
    }
  />
  if (!store.bootstrap) return <PanelLoader />
  return <Context.Provider value={store}>{children}</Context.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useCashierV3() {
  const store = useContext(Context)
  if (!store) throw new Error('Falta CashierV3Provider.')
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  return store
}
