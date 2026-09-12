import { useEffect, useSyncExternalStore } from 'react'
import { useAdminStore } from '../admin.v2.context'
import type { CatalogQueryAction, CatalogQueryPayloads } from './admin.catalogo.store'

export function useCatalogStore() {
  const store = useAdminStore().catalog
  useSyncExternalStore(store.subscribe, store.snapshot)
  return store
}
export function useCatalogQuery<A extends CatalogQueryAction>(action: A, payload: CatalogQueryPayloads[A]) {
  const store = useCatalogStore()
  const key = JSON.stringify(payload)
  const version = store.snapshot()
  const result = store.peek(action, payload)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      const request = JSON.parse(key) as CatalogQueryPayloads[A]
      const cached = store.peek(action, request)
      if (active && !cached.data && !cached.error) void store.load(action, request).catch(() => {})
    })
    return () => { active = false }
  }, [action, key, store, version])
  return { ...result, retry: () => store.retry(action, payload) }
}
