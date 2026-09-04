import { useEffect, useSyncExternalStore } from 'react'
import { useAdminStore } from './admin.v2.context'
import type { ReadAction, ReadPayloads } from './admin.management.v2'

export function useManagement() {
  const store = useAdminStore().management
  useSyncExternalStore(store.subscribe, store.snapshot)
  return store
}
export function useManagementQuery<A extends ReadAction>(action: A, payload: ReadPayloads[A]) {
  const store = useManagement(), key = JSON.stringify(payload), version = store.snapshot()
  const result = store.peek(action, payload)
  const expiry = result.expiresAt
  useEffect(() => {
    if (expiry === undefined) return
    const expire = () => { if (Date.now() >= expiry) store.retry(action, JSON.parse(key)) }
    const timer = window.setTimeout(expire, Math.max(0, expiry - Date.now()))
    window.addEventListener('pageshow', expire)
    document.addEventListener('visibilitychange', expire)
    return () => { window.clearTimeout(timer); window.removeEventListener('pageshow', expire); document.removeEventListener('visibilitychange', expire) }
  }, [action, key, store, expiry])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active && !store.peek(action, JSON.parse(key)).data && !store.peek(action, JSON.parse(key)).error) void store.load(action, JSON.parse(key)).catch(() => {}) })
    return () => { active = false }
  }, [action, key, store, version])
  return { ...result, retry: () => store.retry(action, payload) }
}
