import { useEffect, useSyncExternalStore } from 'react'
import { useAdminStore } from '../admin.v2.context'

export function useMasterDataStore() { const store = useAdminStore().masterData; useSyncExternalStore(store.subscribe, store.snapshot); return store }
export function useMasterData() { const store = useMasterDataStore(); const state = store.data(); useEffect(() => { if (!state.snapshot && !state.error) void store.ensureLoaded().catch(() => {}) }, [state.error, state.snapshot, store]); return { ...state, retry: () => store.refetchMasterData() } }
