import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { CashierV4Store } from './cajero.v4.store'

const Context = createContext<CashierV4Store | null>(null)

// The owner supplies/disposes the store. No storage purge, draft scope or productive mount.
export function CashierV4Provider({ store, children, bootstrapOnMount = false }: {
  store: CashierV4Store
  children: ReactNode
  bootstrapOnMount?: boolean
}) {
  useEffect(() => {
    let mounted = true
    if (bootstrapOnMount) queueMicrotask(() => {
      if (mounted) void store.refresh().catch(() => {}) // The store exposes loading/error to consumers.
    })
    return () => { mounted = false }
  }, [store, bootstrapOnMount])
  return <Context.Provider value={store}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCashierV4() {
  const store = useContext(Context)
  if (!store) throw new Error('Falta CashierV4Provider.')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { store, state }
}
