import { useCallback, useEffect, useState } from 'react'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type { MetricsAction, MetricsPayloads, MetricsResponses } from './admin.dashboard.metrics.types'
import { DashboardMetricsStaleResponseError } from './admin.dashboard.metrics.store'

interface QueryState<A extends MetricsAction> {
  key: string
  data?: MetricsResponses[A]
  error?: string
  loading: boolean
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'No se pudo consultar el Dashboard. Vuelve a intentarlo.'
}

/** Hook específico de Dashboard: resultados viejos no se publican tras cambiar sede/filtro. */
export function useDashboardMetrics<A extends MetricsAction>(
  store: DashboardMetricsStore,
  action: A,
  payload: MetricsPayloads[A],
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true
  // JSON representa únicamente el payload permitido y es estable frente a nuevas referencias React.
  const payloadKey = JSON.stringify(payload)
  const key = JSON.stringify([store.userId, store.role, action, payloadKey, enabled])
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<QueryState<A>>({ key, loading: enabled })

  useEffect(() => {
    let current = true
    const publish = (next: QueryState<A>) => queueMicrotask(() => { if (current) setState(next) })
    if (!enabled) {
      publish({ key, loading: false })
      return () => { current = false }
    }
    const parsed = JSON.parse(payloadKey) as MetricsPayloads[A]
    const cached = store.peek(action, parsed)
    if (cached) {
      publish({ key, data: cached, loading: false })
      return () => { current = false }
    }
    publish({ key, loading: true })
    try {
      void store.load(action, parsed).then((data) => {
        if (current) setState({ key, data, loading: false })
      }).catch((error: unknown) => {
        if (current && !(error instanceof DashboardMetricsStaleResponseError)) {
          setState({ key, error: errorMessage(error), loading: false })
        }
      })
    } catch (error) {
      if (current) setState({ key, error: errorMessage(error), loading: false })
    }
    return () => { current = false }
  }, [store, action, payloadKey, key, enabled, revision])

  const retry = useCallback(() => {
    store.invalidate(action, JSON.parse(payloadKey) as MetricsPayloads[A])
    setState({ key, loading: true })
    setRevision(n => n + 1)
  }, [store, action, payloadKey])

  // Evita fugas de datos de la sede anterior en el render que precede al effect.
  const visible: QueryState<A> = state.key === key ? state : { key, loading: enabled }
  return { data: visible.data, error: visible.error, loading: visible.loading, retry }
}
