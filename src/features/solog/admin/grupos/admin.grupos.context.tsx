import { useEffect, useSyncExternalStore } from 'react'
import { useAdminStore } from '../admin.v2.context'
import type { GroupsReadAction, GroupsReadPayloads } from './admin.grupos.v1'

export function useGroupsStore() {
  const store = useAdminStore().groupsV1
  useSyncExternalStore(store.subscribe, store.snapshot)
  return store
}
export function useGroupsQuery<A extends GroupsReadAction>(action: A, payload: GroupsReadPayloads[A]) {
  const store = useGroupsStore(), key = JSON.stringify(payload), version = store.snapshot(), result = store.peek(action, payload)
  useEffect(() => {
    let active = true
    queueMicrotask(() => { const query = JSON.parse(key) as GroupsReadPayloads[A]; if (active && !store.peek(action, query).data && !store.peek(action, query).error) void store.load(action, query).catch(() => {}) })
    return () => { active = false }
  }, [action, key, store, version])
  return { ...result, retry: () => store.retry(action, payload) }
}
