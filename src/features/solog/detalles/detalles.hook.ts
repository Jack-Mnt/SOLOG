import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getOrCreateDeviceToken } from '../device'
import { getSologErrorMessageFromUnknown } from '../errors'
import { DetailsStore } from './detalles.store'

export function useSologDetailsSummary(userId: string) {
  const [store] = useState(() => {
    let token = ''
    try { token = getOrCreateDeviceToken() } catch { /* La lectura no requiere almacenamiento/dispositivo. */ }
    return new DetailsStore(userId, token)
  })
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const loadSummary = useCallback(async () => {
    const generation = store.generation
    setStatus('loading'); setError(null); setNotice(null)
    try {
      await store.loadSummary()
      if (generation !== store.generation) return false
      setStatus('ready')
      return true
    } catch (e) {
      if (generation === store.generation) {
        setError(getSologErrorMessageFromUnknown(e))
        setStatus('error')
      }
      return false
    }
  }, [store])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void loadSummary() })
    return () => { active = false; store.dispose() }
  }, [store, loadSummary])
  const checkAuthorization = useCallback(async () => {
    const generation = store.generation
    const refreshed = await loadSummary()
    if (!refreshed || generation !== store.generation) return
    const access = store.summary?.access
    if (access?.current_device_state === 'autorizado' && access.current_device_matches_site) {
      setNotice('Dispositivo autorizado. Ya puedes acceder a Cajero.')
    } else if (access?.current_device_state === 'pendiente') {
      setNotice('La solicitud continúa pendiente de autorización.')
    }
  }, [loadSummary, store])
  const requestAccess = useCallback(async () => {
    const generation = store.generation
    setError(null); setNotice(null)
    try {
      const r = await store.requestAccess()
      if (generation !== store.generation) return
      if (r.status === 'authorized') {
        await checkAuthorization()
        return
      }
      setNotice(r.status === 'pending' ? 'Solicitud enviada. El dispositivo queda pendiente de autorización.' :
        'La sede ya cuenta con un dispositivo autorizado.')
    } catch (e) { if (generation === store.generation) setError(getSologErrorMessageFromUnknown(e)) }
  }, [checkAuthorization, store])
  const visibleError = error ?? (status === 'ready' && !store.summary ? 'El contexto de acceso cambió. Vuelve a consultar el resumen.' : null)
  return { store, status, error: visibleError, notice, summary: store.summary, requesting: store.accessBusy, loadSummary, checkAuthorization, requestAccess }
}
