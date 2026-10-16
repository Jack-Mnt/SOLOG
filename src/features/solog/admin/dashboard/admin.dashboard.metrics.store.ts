// Cache del Dashboard V1, sin acoplarse a AdminStore V2 ni a sus revisiones.
// Las claves siempre contienen identidad, rol, acción, sede y filtros/cursor.
import { validateMetricsPayload } from './admin.dashboard.metrics.contract'
import { dashboardMetricsRpc } from './admin.dashboard.metrics.rpc'
import type { MetricsAction, MetricsPayloads, MetricsResponses } from './admin.dashboard.metrics.types'

type MetricsEntry = {
  createdAt: number
  data?: MetricsResponses[MetricsAction]
  pending?: Promise<MetricsResponses[MetricsAction]>
}

export class DashboardMetricsStaleResponseError extends Error {
  constructor() {
    super('Consulta del Dashboard descartada: el contexto cambió.')
    this.name = 'DashboardMetricsStaleResponseError'
  }
}

const DEFAULT_CACHE_MS = 120_000
const CURSOR_CACHE_MS = 45_000

/** Este store debe pertenecer a una única instancia/página Admin y se descarta al salir. */
export class DashboardMetricsStore {
  private readonly entries = new Map<string, MetricsEntry>()
  private epoch = 0
  private active = true

  constructor(
    readonly userId: string,
    readonly role: 'admin' | 'moderador',
    private readonly rpc: typeof dashboardMetricsRpc = dashboardMetricsRpc,
  ) {}

  private key<A extends MetricsAction>(action: A, payload: MetricsPayloads[A]) {
    return JSON.stringify([
      this.userId, this.role, action,
      Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
    ])
  }

  peek<A extends MetricsAction>(action: A, payload: MetricsPayloads[A]): MetricsResponses[A] | undefined {
    const entry = this.entries.get(this.key(action, payload))
    if (!entry?.data) return undefined
    const duration = 'cursor' in payload && payload.cursor ? CURSOR_CACHE_MS : DEFAULT_CACHE_MS
    return Date.now() - entry.createdAt <= duration ? entry.data as MetricsResponses[A] : undefined
  }

  load<A extends MetricsAction>(action: A, payload: MetricsPayloads[A]): Promise<MetricsResponses[A]> {
    validateMetricsPayload(action, payload)
    if (!this.active) return Promise.reject(new DashboardMetricsStaleResponseError())
    const key = this.key(action, payload)
    const prior = this.entries.get(key)
    if (prior?.pending) return prior.pending as Promise<MetricsResponses[A]>
    const cached = this.peek(action, payload)
    if (cached) return Promise.resolve(cached)

    const epoch = this.epoch
    const entry: MetricsEntry = { createdAt: Date.now() }
    this.entries.set(key, entry)
    const pending = this.rpc(action, payload).then((response) => {
      if (!this.active || this.epoch !== epoch || this.entries.get(key) !== entry) {
        throw new DashboardMetricsStaleResponseError()
      }
      entry.data = response
      entry.pending = undefined
      entry.createdAt = Date.now()
      return response
    }).catch(error => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw error
    })
    entry.pending = pending
    return pending
  }

  /** Invalida una consulta o todas las consultas del mismo tipo; no afecta Control. */
  invalidate<A extends MetricsAction>(action?: A, payload?: MetricsPayloads[A]): void {
    this.epoch++
    if (!action) { this.entries.clear(); return }
    if (payload) { this.entries.delete(this.key(action, payload)); return }
    for (const key of this.entries.keys()) {
      const parsed: unknown = JSON.parse(key)
      if (Array.isArray(parsed) && parsed[2] === action) this.entries.delete(key)
    }
  }

  refresh(): void { this.invalidate() }

  dispose(): void {
    this.active = false
    this.epoch++
    this.entries.clear()
  }
}
