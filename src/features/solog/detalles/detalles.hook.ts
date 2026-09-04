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
    setStatus('loading'); setError(null)
    try { await store.loadSummary(); if (generation === store.generation) setStatus('ready') }
    catch (e) { if (generation === store.generation) { setError(getSologErrorMessageFromUnknown(e)); setStatus('error') } }
  }, [store])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void loadSummary() })
    return () => { active = false; store.dispose() }
  }, [store, loadSummary])
  const requestAccess = useCallback(async () => {
    const generation = store.generation
    setError(null); setNotice(null)
    try {
      const r = await store.requestAccess()
      if (generation !== store.generation) return
      setNotice(r.status === 'pending' ? 'Solicitud enviada. El dispositivo queda pendiente de autorización.' :
        r.status === 'site_already_authorized' ? 'La sede ya cuenta con un dispositivo autorizado.' :
        'Este dispositivo ya está autorizado. Esta pantalla continúa en modo informativo.')
    } catch (e) { if (generation === store.generation) setError(getSologErrorMessageFromUnknown(e)) }
  }, [store])
  const visibleError = error ?? (status === 'ready' && !store.summary ? 'El contexto de acceso cambió. Vuelve a consultar el resumen.' : null)
  return { store, status, error: visibleError, notice, summary: store.summary, requesting: store.accessBusy, loadSummary, requestAccess }
}
