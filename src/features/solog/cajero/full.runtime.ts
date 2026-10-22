import { isUuid, parseFullEnvelope, type FullAction, type FullEnvelope, type FullGroup, type FullMutation, type FullSession, type FullState } from './full.contract'

export type FullRpc = (name: 'rpc_solog_cashier_bootstrap_v6' | 'rpc_solog_cashier_mutate_v7', args: Record<string, unknown>) => Promise<unknown>
export type FullLock = <T>(run: () => Promise<T>) => Promise<T>
interface Pending { operationId: string; action: FullAction; sessionId: string | null; exactPayload: string; status: 'pending' | 'rejected'; code: string | null }
interface Journal { version: 1; userId: string; deviceToken: string; pending: Pending[]; confirmed: Record<string, string[]>; panels: Record<string, FullGroup[]> }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface FullView { bootstrap: FullState | null; session: FullSession | null; groups: FullGroup[]; pending: number; rejected: number; busy: boolean; error: string | null; revision: number }

export class ServerClock {
  private server = Number.NaN; private tick = 0; private wall = 0; trusted = false
  constructor(private monotonic: () => number = () => performance.now(), private wallNow: () => number = () => Date.now()) {}
  synchronize(serverNow: string, requestElapsed: number) { this.server = Date.parse(serverNow) + Math.max(0, requestElapsed); this.tick = this.monotonic(); this.wall = this.wallNow(); this.trusted = Number.isFinite(this.server) && requestElapsed >= 0 && requestElapsed <= 10000 }
  now() { return this.server + Math.max(0, this.monotonic() - this.tick, this.wallNow() - this.wall) }
  canCapture(session: FullSession | null) { return this.trusted && !!session?.capture_allowed && session.status === 'active' && this.now() >= Date.parse(session.session_started_at) && this.now() < Date.parse(session.session_expires_at) }
}
export class FullRuntime {
  readonly key: string; readonly clock: ServerClock
  private journal: Journal; private listeners = new Set<() => void>(); private gate: FullLock
  private view: FullView = { bootstrap: null, session: null, groups: [], pending: 0, rejected: 0, busy: false, error: null, revision: 0 }
  constructor(readonly userId: string, readonly deviceToken: string, private storage: StoragePort, private rpc: FullRpc, options: { clock?: ServerClock; lock?: FullLock } = {}) {
    if (!isUuid(userId) || !/^[0-9a-f]{64}$/.test(deviceToken)) throw new Error('FULL_IDENTITY_INVALID')
    this.key = `solog.full2.${userId}.${deviceToken}`; this.clock = options.clock ?? new ServerClock()
    this.gate = options.lock ?? (async run => { if (!navigator.locks) throw new Error('FULL_BROWSER_LOCK_REQUIRED'); return navigator.locks.request(this.key, run) })
    this.journal = this.read(); this.publish({})
  }
  private read(): Journal {
    const raw = this.storage.getItem(this.key)
    if (!raw) return { version: 1, userId: this.userId, deviceToken: this.deviceToken, pending: [], confirmed: {}, panels: {} }
    if (raw.length > 8 * 1024 * 1024) throw new Error('FULL_OUTBOX_TOO_LARGE')
    const value = JSON.parse(raw) as Journal
    if (value.version !== 1 || value.userId !== this.userId || value.deviceToken !== this.deviceToken || !Array.isArray(value.pending) || !value.confirmed || !value.panels) throw new Error('FULL_OUTBOX_INVALID')
    for (const row of value.pending) { if (!isUuid(row.operationId) || !['start', 'save_batch', 'recount_save_batch', 'finish'].includes(row.action) || !['pending', 'rejected'].includes(row.status)) throw new Error('FULL_OUTBOX_INVALID'); const p = JSON.parse(row.exactPayload); if (p.operation_id !== row.operationId || p.device_token !== this.deviceToken || (row.action !== 'start' && p.session_id !== row.sessionId)) throw new Error('FULL_OUTBOX_INVALID') }
    return value
  }
  private persist(value: Journal) { const text = JSON.stringify(value); if (text.length > 8 * 1024 * 1024) throw new Error('FULL_OUTBOX_TOO_LARGE'); this.storage.setItem(this.key, text); this.journal = value }
  private publish(change: Partial<FullView>) { this.view = { ...this.view, ...change, pending: this.journal.pending.filter(x => x.status === 'pending').length, rejected: this.journal.pending.filter(x => x.status === 'rejected').length, revision: this.view.revision + 1 }; this.listeners.forEach(fn => fn()) }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getSnapshot = () => this.view
  private async request(name: Parameters<FullRpc>[0], args: Record<string, unknown>): Promise<FullEnvelope> {
    const started = performance.now(); const response = parseFullEnvelope(await this.rpc(name, args)); this.clock.synchronize(response.server_now, performance.now() - started); return response
  }
  private async refreshInside() {
    const response = await this.request('rpc_solog_cashier_bootstrap_v6', { p_payload: { device_token: this.deviceToken } })
    if (!response.ok || response.code !== 'CASHIER_STATE') throw new Error(response.code)
    const state = response.data as FullState; const next = structuredClone(this.journal)
    this.verifyReference(state.session)
    if (state.session) { next.confirmed[state.session.session_id] = [...new Set([...(next.confirmed[state.session.session_id] ?? []), ...state.confirmed_observation_ids])]; next.panels[state.session.session_id] = state.groups }
    for (const recovery of state.recovery_manifests) next.confirmed[recovery.session_id] = [...new Set([...(next.confirmed[recovery.session_id] ?? []), ...recovery.observation_ids])]
    this.persist(next); this.publish({ bootstrap: state, session: state.session, groups: state.groups, error: null })
  }
  private verifyReference(session: FullSession | null) {
    const previous = this.view.session
    if (session && previous?.session_id === session.session_id && (previous.reference_snapshot_id !== session.reference_snapshot_id || previous.groups_revision !== session.groups_revision || ['reference_snapshot_captured_at', 'session_expires_at', 'pending_delivery_until'].some(key => Date.parse(String(previous[key as keyof FullSession])) !== Date.parse(String(session[key as keyof FullSession]))))) throw new Error('FULL_SESSION_REFERENCE_CHANGED')
  }
  async refresh() { await this.gate(async () => { this.journal = this.read(); await this.refreshInside() }) }
  private enqueue(action: FullAction, session: FullSession | null, body: Record<string, unknown>) {
    const next = structuredClone(this.journal), operationId = crypto.randomUUID()
    const payload = { device_token: this.deviceToken, operation_id: operationId, ...body }
    next.pending.push({ operationId, action, sessionId: session?.session_id ?? null, exactPayload: JSON.stringify(payload), status: 'pending', code: null })
    this.persist(next); this.publish({}); return operationId
  }
  private async flushInside() {
    for (const pending of [...this.journal.pending].filter(x => x.status === 'pending')) {
      let response: FullEnvelope
      try { response = await this.request('rpc_solog_cashier_mutate_v7', { p_action: pending.action, p_payload: JSON.parse(pending.exactPayload) }) }
      catch { this.publish({ error: 'Sin confirmación del servidor. El envío permanece guardado para reintentar.' }); return }
      if (!response.ok) {
        if (!response.retryable) { const next = structuredClone(this.journal); const row = next.pending.find(x => x.operationId === pending.operationId)!; row.status = 'rejected'; row.code = response.code; this.persist(next) }
        this.publish({ error: response.code }); continue
      }
      const result = response.data as FullMutation
      if (result.action !== pending.action || pending.sessionId !== null && result.session.session_id !== pending.sessionId) throw new Error('FULL_CONFIRMATION_SCOPE_MISMATCH')
      this.verifyReference(result.session)
      const payload = JSON.parse(pending.exactPayload), expected: string[] = (payload.items ?? []).map((x: { client_observation_id: string }) => x.client_observation_id)
      const received = result.observation_results.map(x => x.client_observation_id)
      if (new Set(received).size !== received.length || expected.length !== received.length || expected.some(x => !received.includes(x))) throw new Error('FULL_CONFIRMATION_MANIFEST_MISMATCH')
      const next = structuredClone(this.journal), sid = result.session.session_id
      next.confirmed[sid] = [...new Set([...(next.confirmed[sid] ?? []), ...received])]
      next.pending = next.pending.filter(x => x.operationId !== pending.operationId)
      if (next.panels[sid]) next.panels[sid] = next.panels[sid].map(g => result.affected_groups.find(x => x.group_id === g.group_id) ?? g)
      if (result.session.status === 'finished' && !next.pending.some(x => x.sessionId === sid)) { delete next.panels[sid]; delete next.confirmed[sid] }
      this.persist(next)
      if (pending.action === 'start' || this.view.session?.session_id === sid) this.publish({ session: result.session, groups: next.panels[sid] ?? [], error: null })
      else this.publish({ error: null })
    }
  }
  async flush() { await this.gate(async () => { this.journal = this.read(); this.publish({ busy: true }); try { await this.flushInside(); await this.refreshInside() } finally { this.publish({ busy: false }) } }) }
  async retry() { await this.gate(async () => { this.journal = this.read(); const next = structuredClone(this.journal); next.pending.forEach(x => { x.status = 'pending' }); this.persist(next); this.publish({ busy: true }); try { await this.flushInside(); await this.refreshInside() } finally { this.publish({ busy: false }) } }) }
  async start() {
    await this.gate(async () => { this.journal = this.read(); this.publish({ busy: true }); try {
      await this.refreshInside()
      if (!this.journal.pending.some(x => x.action === 'start' && x.status === 'pending')) { if (!this.view.bootstrap?.capabilities.can_start_session) throw new Error(this.view.bootstrap?.capabilities.block_reason ?? 'FULL_START_BLOCKED'); this.enqueue('start', null, {}) }
      await this.flushInside(); await this.refreshInside()
    } finally { this.publish({ busy: false }) } })
  }
  async observe(groupId: string, physical: number, reason: string | null, note: string | null) {
    await this.gate(async () => { this.journal = this.read(); const session = this.view.session, group = (session ? this.journal.panels[session.session_id] ?? [] : []).find(x => x.group_id === groupId)
      if (!session || !group || !this.clock.canCapture(session) || group.action === 'none') throw new Error('SESSION_CAPTURE_CLOSED')
      if (!Number.isSafeInteger(physical) || physical < 0 || physical > 2147483647) throw new Error('FULL_PHYSICAL_INVALID')
      if ((reason === null) !== (note === null) || reason !== null && !['Transferencia', 'Venta por mayor', 'Dañado', 'Vencido', 'Otro motivo'].includes(reason) || note !== null && (note.trim().length < 3 || note.length > 1024) || Math.abs(physical - group.stock_theoretical) >= 12 && reason === null) throw new Error('FULL_REASON_REQUIRED')
      if (this.journal.pending.some(x => x.sessionId === session.session_id && (JSON.parse(x.exactPayload).items ?? []).some((i: { grupo_id?: string; detalle_id?: string }) => i.grupo_id === groupId || group.recount_detail_id !== null && i.detalle_id === group.recount_detail_id))) throw new Error('FULL_GROUP_ALREADY_PENDING')
      const item = { client_observation_id: crypto.randomUUID(), stock_fisico: physical, contado_at: new Date(this.clock.now()).toISOString(), motivo_diferencia: reason,
        ...(group.action === 'recount' ? { detalle_id: group.recount_detail_id, observacion_reconteo: note } : { grupo_id: groupId, observacion_diferencia: note }) }
      this.enqueue(group.action === 'recount' ? 'recount_save_batch' : 'save_batch', session, { session_id: session.session_id, expected_groups_revision: session.groups_revision, items: [item] })
      await this.flushInside()
    })
  }
  async finish(sessionId = this.view.session?.session_id) {
    if (!sessionId) return
    await this.gate(async () => { this.journal = this.read(); this.publish({ busy: true }); try {
      await this.flushInside(); await this.refreshInside()
      if (this.journal.pending.some(x => x.sessionId === sessionId)) throw new Error('FULL_PENDING_DELIVERY_REQUIRES_RECONCILIATION')
      const session = this.view.session?.session_id === sessionId ? this.view.session : this.view.bootstrap?.recovery_sessions.find(x => x.session_id === sessionId)
      if (!session) return
      this.enqueue('finish', session, { session_id: sessionId, expected_groups_revision: session.groups_revision, delivery_manifest: { observation_ids: [...new Set(this.journal.confirmed[sessionId] ?? [])].sort(), client_queue_empty: true } })
      await this.flushInside(); await this.refreshInside()
    } finally { this.publish({ busy: false }) } })
  }
  inspectPending() { return structuredClone(this.journal.pending) }
}
