import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import type { AdminStore } from './admin.v2.store'
import type { AdminAction, AdminPayloads } from './admin.v2'
export const AdminV2Context = createContext<AdminStore | null>(null)
export function useAdminStore() {
  const store = useContext(AdminV2Context)
  if (!store) throw new Error('Falta el contexto Admin v2.')
  return store
}
export function useAdminQuery<A extends AdminAction>(action: A, payload: AdminPayloads[A]) {
  const store = useAdminStore()
  const version = useSyncExternalStore(store.subscribe, store.snapshot)
  const key = JSON.stringify(payload)
  const result = store.peek(action, payload)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      const p = JSON.parse(key) as AdminPayloads[A]
      const cached = store.peek(action, p)
      if (active && !cached.data && !cached.error) void store.load(action, p).catch(() => {})
    })
    return () => { active = false }
  }, [action, key, store, version])
  return { ...result, retry: () => store.retry(action, payload) }
}
