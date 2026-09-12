import { useSyncExternalStore } from 'react'
import { useAdminStore } from '../admin.v2.context'

export function useGroupsStore() {
  const store = useAdminStore().groupsV1
  useSyncExternalStore(store.subscribe, store.snapshot)
  return store
}
