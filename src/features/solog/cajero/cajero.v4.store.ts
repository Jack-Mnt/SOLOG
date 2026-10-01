import { SologApiError } from '../errors'
import { fetchCashierV4Bootstrap, parseCashierV4Bootstrap, parseCashierV4Mutation, type CashierV4Rpc } from './cajero.v4.api'
import type {
  CashierV4Bootstrap, CashierV4MutationResult, CashierV4Panel, CashierV4PanelDelta,
  CashierV4PreSessionSummary, CashierV4RecoverySession, CashierV4Revisions,
  CashierV4SessionCapability, CashierV4Stock,
} from './cajero.v4'

export interface CashierV4State {
  // Last bootstrap envelope; selectors consume the current normalized fields below.
  bootstrap: CashierV4Bootstrap | null
  panel_state: CashierV4Panel | null
  panel_deltas: Readonly<Record<string, CashierV4PanelDelta>>
  session_capability: CashierV4SessionCapability | null
  recovery_sessions: CashierV4RecoverySession[]
  pre_session_summary: CashierV4PreSessionSummary | null
  revisions: CashierV4Revisions | null
  stock: CashierV4Stock | null
  loading: boolean
  error: unknown
  lastSynchronizedAt: string | null
}

export function createCashierV4State(): CashierV4State {
  return {
    bootstrap: null, panel_state: null, panel_deltas: {}, session_capability: null,
    recovery_sessions: [], pre_session_summary: null, revisions: null, stock: null,
    loading: false, error: null, lastSynchronizedAt: null,
  }
}

export type CashierV4Event =
  | { type: 'loading' }
  | { type: 'error'; error: unknown }
  | { type: 'bootstrap'; bootstrap: CashierV4Bootstrap }
  | { type: 'mutation'; response: CashierV4MutationResult }

function invalid(): never { throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE') }

function assertSessionWindow(
  session: { iniciado_at: string; expira_at: string; recovery_until: string },
  capability: { iniciado_at?: string | null; expira_at: string | null; recovery_until: string | null },
) {
  for (const key of ['iniciado_at', 'expira_at', 'recovery_until'] as const) {
    if (key === 'iniciado_at' && capability[key] == null) continue // Finish can omit it.
    if (Date.parse(session[key]) !== Date.parse(capability[key] ?? '')) invalid()
  }
}

function applyPanelDelta(panel: CashierV4Panel, delta: CashierV4PanelDelta): CashierV4Panel {
  const knownIds = new Set(panel.groups.map(group => group.grupo_id))
  const affected = new Map(delta.groups_patch.map(patch => [patch.grupo_id, patch]))
  const queueIds = [...delta.review_queue.map(item => item.grupo_id), ...delta.coverage_queue, ...delta.daily_queue]
  if ([...affected.keys(), ...queueIds].some(id => !knownIds.has(id))) invalid()
  const capability = delta.session_capability
  return {
    ...panel,
    session: {
      ...panel.session,
      estado: capability.estado ?? panel.session.estado,
      finalizado_at: capability.finalizado_at,
    },
    groups: panel.groups.map(group => affected.has(group.grupo_id) ? { ...group, ...affected.get(group.grupo_id)! } : group),
    review_queue: delta.review_queue, coverage_queue: delta.coverage_queue, daily_queue: delta.daily_queue,
    kpis: delta.kpis, next_action: delta.next_action, session_capability: capability,
  }
}

function mergeRevisions(previous: CashierV4Revisions | null, next: CashierV4Revisions): CashierV4Revisions {
  // A replay/delivery for an older recovery must not rewind the current revisions.
  return {
    groups: Math.max(previous?.groups ?? 0, next.groups),
    devices: Math.max(previous?.devices ?? 0, next.devices),
    operational: Math.max(previous?.operational ?? 0, next.operational),
  }
}

export function cashierV4Reducer(state: CashierV4State, event: CashierV4Event): CashierV4State {
  // A refresh attempt alone cannot clear a terminal denial from the backend.
  if (event.type === 'loading') return { ...state, loading: true }
  if (event.type === 'error') return { ...state, loading: false, error: event.error }
  if (event.type === 'bootstrap') {
    const b = event.bootstrap
    // A bootstrap is authoritative, including removal/revocation of recoveries.
    return {
      ...state, bootstrap: b, panel_state: b.panel_state, panel_deltas: {},
      session_capability: b.session_capability, recovery_sessions: b.recovery_sessions,
      pre_session_summary: b.pre_session_summary, revisions: b.revisions, stock: b.stock,
      loading: false, error: null, lastSynchronizedAt: b.generated_at,
    }
  }
  const response = event.response
  if (!state.bootstrap) invalid()
  const common = {
    revisions: mergeRevisions(state.revisions, response.revisions),
    loading: false, error: null, lastSynchronizedAt: response.generated_at,
  }
  if (response.action === 'start') {
    if (response.panel_state.session.usuario_id !== state.bootstrap.identity.id ||
        response.panel_state.session.sede_id !== state.bootstrap.site.id) invalid()
    // If the previously visible panel was a recovery, retain its backend capability.
    const previous = state.panel_state
    let recoveries = state.recovery_sessions.filter(session => session.id !== response.conteo_id)
    if (previous?.session.estado === 'recovery' && previous.session.id !== response.conteo_id &&
        !recoveries.some(session => session.id === previous.session.id)) {
      recoveries = [...recoveries, {
        id: previous.session.id, iniciado_at: previous.session.iniciado_at,
        expira_at: previous.session.expira_at, recovery_until: previous.session.recovery_until,
        snapshot_referencia_id: previous.basis.snapshot_referencia_id,
        ronda: previous.basis.ronda, turno: previous.basis.turno,
        session_capability: previous.session_capability,
      }]
    }
    return {
      ...state, ...common, panel_state: response.panel_state, stock: response.stock,
      session_capability: response.session_capability, pre_session_summary: null,
      recovery_sessions: recoveries,
    }
  }
  const matchesPanel = state.panel_state?.session.id === response.conteo_id
  const recovery = state.recovery_sessions.find(session => session.id === response.conteo_id)
  if (!matchesPanel && !recovery) invalid()
  assertSessionWindow(matchesPanel ? state.panel_state!.session : recovery!, response.session_capability)
  if (recovery && response.session_capability.mode === 'active') invalid()
  if (response.action === 'finish') {
    const deltas = { ...state.panel_deltas }
    delete deltas[response.conteo_id]
    return {
      ...state, ...common, panel_deltas: deltas,
      panel_state: matchesPanel ? null : state.panel_state,
      session_capability: matchesPanel ? {
        ...response.session_capability,
        iniciado_at: response.session_capability.iniciado_at ?? state.panel_state!.session.iniciado_at,
      } : state.session_capability,
      recovery_sessions: state.recovery_sessions.filter(session => session.id !== response.conteo_id),
      // Finish has no operational summary. Only a subsequent bootstrap can provide one.
      pre_session_summary: matchesPanel ? null : state.pre_session_summary,
    }
  }
  const delta = response.panel_delta
  return {
    ...state, ...common,
    panel_deltas: { ...state.panel_deltas, [response.conteo_id]: delta },
    panel_state: matchesPanel ? applyPanelDelta(state.panel_state!, delta) : state.panel_state,
    session_capability: matchesPanel ? delta.session_capability : state.session_capability,
    recovery_sessions: state.recovery_sessions.map(session => session.id === response.conteo_id
      ? { ...session, session_capability: delta.session_capability } : session),
  }
}

// Transport mutations, draft scopes and retry orchestration belong to the next phase.
// This store accepts parsed mutation results and scopes each delta by conteo_id.
export class CashierV4Store {
  private state = createCashierV4State()
  private listeners = new Set<() => void>()
  private refreshPromise: Promise<void> | null = null
  private generation = 0
  private disposed = false

  constructor(readonly userId: string, readonly deviceToken: string, private readonly call?: CashierV4Rpc,
    private readonly now: () => number = Date.now) {}

  serverOffsetMs = 0
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private dispatch(event: CashierV4Event) {
    if (this.disposed) throw new Error('CashierV4Store está cerrado.')
    const next = cashierV4Reducer(this.state, event)
    // Invalidate only after successful adoption, before notifying subscribers.
    if (event.type === 'bootstrap' || event.type === 'mutation') this.generation++
    this.state = next
    this.listeners.forEach(listener => listener())
  }

  acceptBootstrap(value: unknown) {
    const b = parseCashierV4Bootstrap(value)
    if (b.identity.id !== this.userId) invalid()
    this.serverOffsetMs = Date.parse(b.server_now) - this.now()
    this.dispatch({ type: 'bootstrap', bootstrap: b })
  }

  acceptMutation(response: CashierV4MutationResult) {
    const parsed = parseCashierV4Mutation(response, response.action)
    this.dispatch({ type: 'mutation', response: parsed })
  }

  refresh(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('CashierV4Store está cerrado.'))
    if (this.refreshPromise) return this.refreshPromise
    const generation = ++this.generation
    this.dispatch({ type: 'loading' })
    const promise = (async () => {
      try {
        const b = await fetchCashierV4Bootstrap({ device_token: this.deviceToken }, this.call)
        if (!this.disposed && generation === this.generation) this.acceptBootstrap(b)
      } catch (error) {
        if (!this.disposed && generation === this.generation) this.dispatch({ type: 'error', error })
        throw error
      }
    })()
    this.refreshPromise = promise
    void promise.finally(() => { if (this.refreshPromise === promise) this.refreshPromise = null }).catch(() => {})
    return promise
  }

  dispose() {
    this.disposed = true
    this.generation++
    this.listeners.clear()
  }
}
