import { CashierV4Store } from '../../src/features/solog/cajero/cajero.v4.store'
import { CashierV4DraftStorage } from '../../src/features/solog/cajero/cajero.v4.storage'
import { CashierV4DraftCoordinator } from '../../src/features/solog/cajero/cajero.v4.flush'
import { getCashierV4SessionCapability } from '../../src/features/solog/cajero/cajero.v4.capability'
import type { CashierV4Rpc } from '../../src/features/solog/cajero/cajero.v4.api'
import type { CashierV4NextAction } from '../../src/features/solog/cajero/cajero.v4'
import { cashierV4Bootstrap, cashierV4DeviceToken, cashierV4Ids as ids, cashierV4Mutation, cashierV4Group } from './cashier-v4.mjs'

export const uuidFor = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0')
export function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) },
    removeItem: key => { data.delete(key) }, clear: () => { data.clear() } }
}

export function draftHarness(next: CashierV4NextAction = 'review', count?: number) {
  const initial = cashierV4Bootstrap('active', { next_action: next })
  if (count) {
    initial.panel_state!.groups = Array.from({ length: count }, (_, n) => cashierV4Group('coverage', { grupo_id: uuidFor(n + 1) }))
    initial.panel_state!.coverage_queue = initial.panel_state!.groups.map(group => group.grupo_id)
    initial.panel_state!.daily_queue = []
    initial.panel_state!.kpis = { ...initial.panel_state!.kpis, coverage_total: count, coverage_counted: 0,
      coverage_pending: count, coverage_percent: 0, coverage_queue_pending: count, daily_pending: 0 }
  }
  const now = Date.parse(initial.server_now)
  const store = new CashierV4Store(ids.user, cashierV4DeviceToken, undefined, () => now)
  store.acceptBootstrap(initial)
  const raw = memoryStorage()
  const storage = new CashierV4DraftStorage(raw)
  let serial = 10000
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = []
  let responder: CashierV4Rpc | undefined
  const call: CashierV4Rpc = async (name, args) => {
    requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload as Record<string, unknown>) })
    return responder ? responder(name, args) : responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
  }
  const coordinator = new CashierV4DraftCoordinator(store, storage, call, () => uuidFor(serial++), () => now)
  const scope = coordinator.activeScope()!
  const stamp = initial.panel_state!.session.iniciado_at
  function responseFor(action: string, payload: Record<string, unknown>, forcedNext?: CashierV4NextAction) {
    const cap = getCashierV4SessionCapability(store.getSnapshot(), payload.conteo_id as string)!
    const result = cashierV4Mutation(action)
    result.conteo_id = payload.conteo_id
    if (action === 'finish') {
      result.finalizado_at = new Date(now + store.serverOffsetMs + 1000).toISOString()
      result.session_capability = { ...cap, mode: 'none', estado: 'finalizado', capture_allowed: false,
        pending_delivery_allowed: false, finalizado_at: result.finalizado_at }
      return result
    }
    const record = storage.sessions(scope).find(record => record.scope.conteo_id === payload.conteo_id)!
    const delivery = record.delivery_state ?? store.getSnapshot().delivery_state_by_session[payload.conteo_id as string]!
    const sent = payload.items as Array<Record<string, unknown>>
    const sentGroups = new Set(sent.map(item => item.grupo_id))
    const sentDetails = new Set(sent.map(item => item.detalle_id))
    const review_queue = delivery?.review_queue.filter(item => !sentDetails.has(item.detalle_id)) ?? []
    const coverage_queue = delivery?.coverage_queue.filter(id => !sentGroups.has(id)) ?? []
    const daily_queue = delivery?.daily_queue.filter(id => !sentGroups.has(id)) ?? []
    const next_action = forcedNext ?? (coverage_queue.length ? 'coverage' : review_queue.length ? 'review' : daily_queue.length ? 'daily' : 'none')
    result.session_capability = cap
    result.saved = sent.length
    result.items = sent.map((item, n) => action === 'save_batch' ? {
      ...item, detalle_id: uuidFor(90000 + n), stock_teorico: 10, diferencia: Number(item.stock_fisico) - 10,
      estado_diferencia: Number(item.stock_fisico) === 10 ? 'Coincide' : 'Recontar',
    } : {
      detalle_id: item.detalle_id, grupo_id: delivery?.review_queue.find(queued => queued.detalle_id === item.detalle_id)?.grupo_id ?? ids.review,
      snapshot_reconteo_id: ids.snapshot, stock_teorico_reconteo: 10, stock_reconteo: item.stock_fisico,
      diferencia_reconteo: 0, diferencia: 0, estado_diferencia: 'Coincide', valor_diferencia: 0, recontado_at: item.contado_at,
    })
    result.panel_delta = { groups_patch: [], review_queue, coverage_queue, daily_queue,
      kpis: { ...(delivery?.kpis ?? initial.panel_state!.kpis), review_pending: review_queue.length,
        coverage_queue_pending: coverage_queue.length, daily_pending: daily_queue.length },
      next_action, session_capability: cap }
    return result
  }
  function moveToRecovery() {
    const b = cashierV4Bootstrap('active', { next_action: 'coverage' })
    b.panel_state!.session.id = uuidFor(80000)
    b.panel_state!.basis.groups_revision = 99
    const previous = initial.panel_state!
    b.recovery_sessions = [{ id: scope.conteo_id, iniciado_at: previous.session.iniciado_at,
      expira_at: previous.session.expira_at, recovery_until: previous.session.recovery_until,
      snapshot_referencia_id: previous.basis.snapshot_referencia_id, ronda: previous.basis.ronda, turno: previous.basis.turno,
      session_capability: { ...previous.session_capability, mode: 'recovery', estado: 'recovery', capture_allowed: false } }]
    const later = (timestamp: string) => new Date(Date.parse(timestamp) + 120 * 60000).toISOString()
    b.server_now = later(b.server_now)
    b.generated_at = b.server_now
    for (const key of ['iniciado_at', 'expira_at', 'recovery_until'] as const) {
      b.panel_state!.session[key] = later(b.panel_state!.session[key])
      b.panel_state!.session_capability[key] = b.panel_state!.session[key]
      b.session_capability[key] = b.panel_state!.session[key]
    }
    for (const key of ['capturado_at', 'confirmado_at', 'snapshot_expira_at'] as const) b.stock[key] = later(b.stock[key]!)
    store.acceptBootstrap(b)
    return b
  }
  return { store, raw, storage, coordinator, scope, stamp, requests, initial, now,
    responseFor, moveToRecovery, respond: (fn: CashierV4Rpc) => { responder = fn } }
}
