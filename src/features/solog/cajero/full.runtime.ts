import { isUuid, parseFullEnvelope, type FullAction, type FullEnvelope, type FullGroup, type FullMutation, type FullSession, type FullState } from './full.contract'
import { cashierStartGate } from './full.start-gate'

export type FullRpc = (name: 'rpc_solog_cashier_bootstrap_v6' | 'rpc_solog_cashier_mutate_v7', args: Record<string, unknown>) => Promise<unknown>
export type FullLock = <T>(run: () => Promise<T>) => Promise<T>
export interface FullDraft {
  clientObservationId: string; sessionId: string; referenceSnapshotId: string; groupsRevision: number
  groupId: string; action: 'coverage' | 'daily' | 'recount'; recountDetailId: string | null
  physical: number; reason: string | null; note: string | null; countedAt: string; expression: string
}
interface Pending { operationId: string; action: FullAction; sessionId: string | null; exactPayload: string; status: 'pending' | 'rejected'; code: string | null }
export interface FullIncident {
  kind: 'draft' | 'operation'; sessionId: string | null; id: string
  groupId?: string; action?: FullAction; status?: 'pending' | 'rejected'; code?: string | null
}
// Solo rechazos confirmados por V7 antes de efectuar escrituras; nunca conflictos de identidad o idempotencia.
const discardableRejections = new Set(['PRIORITY_CONFLICT', 'SESSION_CAPTURE_CLOSED', 'SESSION_DELIVERY_CLOSED', 'MANIFEST_NOT_CONFIRMED'])
interface Journal {
  version: 2; userId: string; deviceToken: string
  pending: Pending[]; confirmed: Record<string, string[]>; panels: Record<string, FullGroup[]>
  drafts: Record<string, FullDraft[]>
}
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface FullView {
  bootstrap: FullState | null; session: FullSession | null; groups: FullGroup[]
  drafts: number; pending: number; rejected: number; busy: boolean; error: string | null; revision: number
}

const rank: Record<string, number> = { round_coverage: 0, review_for_coverage: 1, review_regular: 2, shift_coverage: 3, none: 4 }
const reasons = ['Transferencia', 'Venta por mayor', 'Dañado', 'Vencido', 'Otro motivo']
const emptyJournal = (userId: string, deviceToken: string): Journal =>
  ({ version: 2, userId, deviceToken, pending: [], confirmed: {}, panels: {}, drafts: {} })

export class ServerClock {
  private server = Number.NaN; private tick = 0; private wall = 0; trusted = false
  constructor(private monotonic: () => number = () => performance.now(), private wallNow: () => number = () => Date.now()) {}
  synchronize(serverNow: string, requestElapsed: number) {
    this.server = Date.parse(serverNow) + Math.max(0, requestElapsed)
    this.tick = this.monotonic(); this.wall = this.wallNow()
    this.trusted = Number.isFinite(this.server) && requestElapsed >= 0 && requestElapsed <= 10000
  }
  now() { return this.server + Math.max(0, this.monotonic() - this.tick, this.wallNow() - this.wall) }
  canCapture(session: FullSession | null) {
    return this.trusted && !!session?.capture_allowed && session.status === 'active'
      && this.now() >= Date.parse(session.session_started_at) && this.now() < Date.parse(session.session_expires_at)
  }
}

export class FullRuntime {
  readonly key: string; readonly clock: ServerClock
  private journal: Journal; private listeners = new Set<() => void>(); private gate: FullLock
  private view: FullView = {
    bootstrap: null, session: null, groups: [], drafts: 0, pending: 0,
    rejected: 0, busy: false, error: null, revision: 0,
  }
  constructor(readonly userId: string, readonly deviceToken: string, private storage: StoragePort,
    private rpc: FullRpc, options: { clock?: ServerClock; lock?: FullLock } = {}) {
    if (!isUuid(userId) || !/^[0-9a-f]{64}$/.test(deviceToken)) throw new Error('FULL_IDENTITY_INVALID')
    this.key = `solog.full2.${userId}.${deviceToken}`
    this.clock = options.clock ?? new ServerClock()
    this.gate = options.lock ?? (async run => {
      if (!navigator.locks) throw new Error('FULL_BROWSER_LOCK_REQUIRED')
      return navigator.locks.request(this.key, run)
    })
    this.journal = this.read(); this.publish({})
  }
  private read(): Journal {
    const raw = this.storage.getItem(this.key)
    if (!raw) return emptyJournal(this.userId, this.deviceToken)
    if (raw.length > 8 * 1024 * 1024) throw new Error('FULL_OUTBOX_TOO_LARGE')
    const value = JSON.parse(raw) as Omit<Journal, 'version' | 'drafts'> & {
      version: number; drafts?: Record<string, FullDraft[]>
    }
    if (![1, 2].includes(value.version) || value.userId !== this.userId || value.deviceToken !== this.deviceToken ||
      !Array.isArray(value.pending) || !value.confirmed || !value.panels ||
      (value.version === 2 && (!value.drafts || typeof value.drafts !== 'object'))) throw new Error('FULL_OUTBOX_INVALID')
    for (const row of value.pending) {
      if (!isUuid(row.operationId) || !['start', 'save_batch', 'recount_save_batch', 'finish'].includes(row.action) ||
        !['pending', 'rejected'].includes(row.status)) throw new Error('FULL_OUTBOX_INVALID')
      const payload = JSON.parse(row.exactPayload)
      if (payload.operation_id !== row.operationId || payload.device_token !== this.deviceToken ||
        (row.action !== 'start' && payload.session_id !== row.sessionId)) throw new Error('FULL_OUTBOX_INVALID')
    }
    const drafts = value.version === 1 ? {} : value.drafts ?? {}
    for (const [sid, rows] of Object.entries(drafts)) {
      if (!isUuid(sid) || !Array.isArray(rows)) throw new Error('FULL_OUTBOX_INVALID')
      const keys = new Set<string>()
      for (const row of rows) {
        if (!isUuid(row.clientObservationId) || row.sessionId !== sid || !isUuid(row.referenceSnapshotId) ||
          !isUuid(row.groupId) || !Number.isSafeInteger(row.groupsRevision) || row.groupsRevision < 1 ||
          !Number.isSafeInteger(row.physical) || row.physical < 0 || row.physical > 2147483647 ||
          !Number.isFinite(Date.parse(row.countedAt)) || !['coverage', 'daily', 'recount'].includes(row.action) ||
          (row.action === 'recount' && !isUuid(row.recountDetailId)) ||
          (row.action !== 'recount' && row.recountDetailId !== null) ||
          typeof row.expression !== 'string' || (row.reason !== null && typeof row.reason !== 'string') ||
          (row.note !== null && typeof row.note !== 'string') || keys.has(row.groupId)) throw new Error('FULL_OUTBOX_INVALID')
        keys.add(row.groupId)
      }
    }
    // Migración aditiva. Nunca se elimina una operación preexistente del outbox Full.
    return { ...value, version: 2, drafts } as Journal
  }
  private persist(value: Journal) {
    const serialized = JSON.stringify(value)
    if (serialized.length > 8 * 1024 * 1024) throw new Error('FULL_OUTBOX_TOO_LARGE')
    this.storage.setItem(this.key, serialized)
    this.journal = value; this.publish({})
  }
  private publish(change: Partial<FullView>) {
    this.view = { ...this.view, ...change,
      drafts: Object.values(this.journal.drafts).reduce((n, d) => n + d.length, 0),
      pending: this.journal.pending.filter(x => x.status === 'pending').length,
      rejected: this.journal.pending.filter(x => x.status === 'rejected').length,
      revision: this.view.revision + 1 }
    this.listeners.forEach(fn => fn())
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getSnapshot = () => this.view
  getDraft = (groupId: string, sessionId = this.view.session?.session_id) =>
    sessionId ? structuredClone(this.journal.drafts[sessionId]?.find(d => d.groupId === groupId) ?? null) : null
  getDrafts = (sessionId = this.view.session?.session_id) =>
    structuredClone(sessionId ? this.journal.drafts[sessionId] ?? [] : [])
  inspectPending() { return structuredClone(this.journal.pending) }
  getIncidents(): FullIncident[] {
    return [
      ...Object.entries(this.journal.drafts).flatMap(([sessionId, drafts]) =>
        drafts.map(d => ({ kind: 'draft' as const, sessionId, id: d.clientObservationId, groupId: d.groupId }))),
      ...this.journal.pending.map(p => ({
        kind: 'operation' as const, sessionId: p.sessionId, id: p.operationId,
        action: p.action, status: p.status, code: p.code,
      })),
    ]
  }
  exportDiagnostics() {
    // Los payloads originales se mantienen inmutables en storage; la exportación nunca incluye device_token.
    return structuredClone({
      schema: 'solog.full.diagnostics.v1',
      userId: this.userId,
      drafts: this.journal.drafts,
      operations: this.journal.pending.map(p => {
        const payload = JSON.parse(p.exactPayload) as Record<string, unknown>
        delete payload.device_token
        return {
          operationId: p.operationId, sessionId: p.sessionId, action: p.action,
          status: p.status, code: p.code, payload,
        }
      }),
      confirmed: this.journal.confirmed,
    })
  }
  async discardDraft(sessionId: string, observationId: string) {
    await this.gate(async () => {
      this.journal = this.read()
      const current = this.journal.drafts[sessionId]?.find(d => d.clientObservationId === observationId)
      if (!current) throw new Error('FULL_INCIDENT_NOT_FOUND')
      const hasPrepared = this.journal.pending.some(p => p.sessionId === sessionId && (() => {
        const payload = JSON.parse(p.exactPayload) as { items?: { client_observation_id?: string; grupo_id?: string; detalle_id?: string }[] }
        return (payload.items ?? []).some(i => i.client_observation_id === observationId ||
          i.grupo_id === current.groupId || (current.recountDetailId !== null && i.detalle_id === current.recountDetailId))
      })())
      if (hasPrepared || (this.journal.confirmed[sessionId] ?? []).includes(observationId)) {
        throw new Error('FULL_INCIDENT_DISCARD_BLOCKED')
      }
      const next = structuredClone(this.journal)
      next.drafts[sessionId] = next.drafts[sessionId].filter(d => d.clientObservationId !== observationId)
      if (!next.drafts[sessionId].length) delete next.drafts[sessionId]
      this.persist(next)
    })
  }
  async discardRejectedOperation(operationId: string) {
    await this.gate(async () => {
      this.journal = this.read()
      const row = this.journal.pending.find(p => p.operationId === operationId)
      if (!row) throw new Error('FULL_INCIDENT_NOT_FOUND')
      if (row.status !== 'rejected' || !row.code || !discardableRejections.has(row.code)) {
        throw new Error('FULL_INCIDENT_DISCARD_BLOCKED')
      }
      const ids: string[] = (JSON.parse(row.exactPayload).items ?? [])
        .map((i: { client_observation_id?: string }) => i.client_observation_id)
        .filter((id: string | undefined): id is string => typeof id === 'string')
      if (ids.some(id => (this.journal.confirmed[row.sessionId ?? ''] ?? []).includes(id))) {
        throw new Error('FULL_INCIDENT_DISCARD_BLOCKED')
      }
      const next = structuredClone(this.journal)
      next.pending = next.pending.filter(p => p.operationId !== operationId)
      this.persist(next)
    })
  }
  canDiscardIncident(incident: FullIncident) {
    if (incident.kind === 'draft') {
      const current = this.journal.drafts[incident.sessionId ?? '']?.find(d => d.clientObservationId === incident.id)
      if (!current || (this.journal.confirmed[incident.sessionId ?? ''] ?? []).includes(incident.id)) return false
      return !this.journal.pending.some(p => {
        if (p.sessionId !== incident.sessionId) return false
        const items = (JSON.parse(p.exactPayload).items ?? []) as {
          client_observation_id?: string; grupo_id?: string; detalle_id?: string
        }[]
        return items.some(i => i.client_observation_id === incident.id ||
          i.grupo_id === current.groupId || (current.recountDetailId !== null && i.detalle_id === current.recountDetailId))
      })
    }
    return incident.status === 'rejected' &&
      incident.code !== null && incident.code !== undefined && discardableRejections.has(incident.code)
  }

  private async request(name: Parameters<FullRpc>[0], args: Record<string, unknown>): Promise<FullEnvelope> {
    const started = performance.now()
    const response = parseFullEnvelope(await this.rpc(name, args))
    this.clock.synchronize(response.server_now, performance.now() - started)
    return response
  }
  private verifyReference(session: FullSession | null) {
    const previous = this.view.session
    if (session && previous?.session_id === session.session_id &&
      (previous.reference_snapshot_id !== session.reference_snapshot_id ||
        previous.groups_revision !== session.groups_revision ||
        ['reference_snapshot_captured_at', 'session_expires_at', 'pending_delivery_until']
          .some(key => Date.parse(String(previous[key as keyof FullSession])) !==
            Date.parse(String(session[key as keyof FullSession]))))) throw new Error('FULL_SESSION_REFERENCE_CHANGED')
  }
  private async refreshInside() {
    const response = await this.request('rpc_solog_cashier_bootstrap_v6', { p_payload: { device_token: this.deviceToken } })
    if (!response.ok || response.code !== 'CASHIER_STATE') throw new Error(response.code)
    const state = response.data as FullState
    const next = structuredClone(this.journal)
    this.verifyReference(state.session)
    if (state.session) {
      next.confirmed[state.session.session_id] = [...new Set([
        ...(next.confirmed[state.session.session_id] ?? []), ...state.confirmed_observation_ids,
      ])]
      next.panels[state.session.session_id] = state.groups
    }
    for (const recovery of state.recovery_manifests) {
      next.confirmed[recovery.session_id] = [...new Set([
        ...(next.confirmed[recovery.session_id] ?? []), ...recovery.observation_ids,
      ])]
    }
    // Conciliación de confirmaciones servidoras cuando se perdió el receipt local.
    for (const [sid, drafts] of Object.entries(next.drafts)) {
      const confirmed = new Set(next.confirmed[sid] ?? [])
      next.drafts[sid] = drafts.filter(d => !confirmed.has(d.clientObservationId))
      if (!next.drafts[sid].length) delete next.drafts[sid]
    }
    this.persist(next)
    this.publish({ bootstrap: state, session: state.session, groups: state.groups, error: null })
  }
  async refresh() { await this.gate(async () => { this.journal = this.read(); await this.refreshInside() }) }

  private enqueue(action: FullAction, session: FullSession | null, body: Record<string, unknown>) {
    const next = structuredClone(this.journal), operationId = crypto.randomUUID()
    const payload = { device_token: this.deviceToken, operation_id: operationId, ...body }
    next.pending.push({
      operationId, action, sessionId: session?.session_id ?? null,
      exactPayload: JSON.stringify(payload), status: 'pending', code: null,
    })
    this.persist(next)
    return operationId
  }
  private pendingFor(sessionId: string) { return this.journal.pending.filter(x => x.sessionId === sessionId) }
  private anyUnresolved(sessionId: string) {
    return (this.journal.drafts[sessionId]?.length ?? 0) > 0 || this.pendingFor(sessionId).length > 0
  }
  private assertNoRejected(sessionId?: string | null) {
    if (this.journal.pending.some(p => p.status === 'rejected' && (sessionId === undefined || p.sessionId === sessionId))) {
      throw new Error('FULL_REJECTED_REQUIRES_REVIEW')
    }
  }
  private async flushInside(sessionId?: string | null) {
    this.assertNoRejected(sessionId)
    const operations = [...this.journal.pending].filter(p =>
      p.status === 'pending' && (sessionId === undefined || p.sessionId === sessionId))
    for (const pending of operations) {
      let response: FullEnvelope
      try {
        response = await this.request('rpc_solog_cashier_mutate_v7', {
          p_action: pending.action, p_payload: JSON.parse(pending.exactPayload),
        })
      } catch {
        this.publish({ error: 'Sin confirmación del servidor. El envío permanece guardado para reintentar.' })
        throw new Error('FULL_DELIVERY_UNCERTAIN')
      }
      if (!response.ok) {
        if (!response.retryable) {
          const next = structuredClone(this.journal)
          const row = next.pending.find(x => x.operationId === pending.operationId)
          if (row) { row.status = 'rejected'; row.code = response.code; this.persist(next) }
        }
        this.publish({ error: response.code })
        throw new Error(response.retryable ? 'FULL_DELIVERY_RETRYABLE' : response.code)
      }
      const result = response.data as FullMutation
      if (result.action !== pending.action ||
        (pending.sessionId !== null && result.session.session_id !== pending.sessionId))
        throw new Error('FULL_CONFIRMATION_SCOPE_MISMATCH')
      this.verifyReference(result.session)
      const payload = JSON.parse(pending.exactPayload)
      const expected: string[] = (payload.items ?? []).map((x: { client_observation_id: string }) => x.client_observation_id)
      const received = result.observation_results.map(x => x.client_observation_id)
      if (new Set(received).size !== received.length || expected.length !== received.length ||
        expected.some(x => !received.includes(x))) throw new Error('FULL_CONFIRMATION_MANIFEST_MISMATCH')
      const next = structuredClone(this.journal), sid = result.session.session_id
      next.confirmed[sid] = [...new Set([...(next.confirmed[sid] ?? []), ...received])]
      next.pending = next.pending.filter(x => x.operationId !== pending.operationId)
      if (next.drafts[sid]) {
        next.drafts[sid] = next.drafts[sid].filter(d => !received.includes(d.clientObservationId))
        if (!next.drafts[sid].length) delete next.drafts[sid]
      }
      if (next.panels[sid]) next.panels[sid] = next.panels[sid].map(g =>
        result.affected_groups.find(x => x.group_id === g.group_id) ?? g)
      if (result.session.status === 'finished' && !next.pending.some(x => x.sessionId === sid) &&
        !next.drafts[sid]?.length) {
        delete next.panels[sid]; delete next.confirmed[sid]
      }
      this.persist(next)
      if (pending.action === 'start' || this.view.session?.session_id === sid) {
        this.publish({ session: result.session, groups: next.panels[sid] ?? [], error: null })
      } else this.publish({ error: null })
    }
  }
  async flush() {
    await this.gate(async () => {
      this.journal = this.read(); this.publish({ busy: true })
      try { await this.flushInside(); await this.refreshInside() }
      finally { this.publish({ busy: false }) }
    })
  }
  async resumePrepared() {
    await this.gate(async () => {
      this.journal = this.read()
      // Incluye start sin sessionId y finish cuya sesión ya no figura en bootstrap.
      const scopes = [...new Set(this.journal.pending.filter(p => p.status === 'pending').map(p => p.sessionId))]
      if (!scopes.length) return
      this.publish({ busy: true })
      try {
        for (const sessionId of scopes) {
          await this.flushInside(sessionId)
          await this.refreshInside()
        }
      } finally { this.publish({ busy: false }) }
    })
  }
  async retry() { await this.resumePrepared() }

  async start() {
    await this.gate(async () => {
      this.journal = this.read(); this.publish({ busy: true })
      try {
        await this.refreshInside()
        const preparedStart = this.journal.pending.find(p => p.action === 'start' && p.status === 'pending')
        if (!preparedStart) {
          if (Object.values(this.journal.drafts).some(d => d.length) || this.journal.pending.length ||
            this.view.bootstrap?.recovery_sessions.length) throw new Error('FULL_OLD_SESSION_REQUIRES_RECONCILIATION')
          const gate = cashierStartGate(this.clock.now(), this.clock.trusted, this.view.bootstrap?.stock?.snapshot_confirmed_at, this.view.bootstrap?.stock?.snapshot_captured_at)
          if (gate.blocked) throw new Error('FULL_HOURLY_START_GATE')
          if (!this.view.bootstrap?.capabilities.can_start_session)
            throw new Error(this.view.bootstrap?.capabilities.block_reason ?? 'FULL_START_BLOCKED')
          this.enqueue('start', null, {})
        }
        await this.flushInside()
        await this.refreshInside()
      } finally { this.publish({ busy: false }) }
    })
  }
  async observe(groupId: string, physical: number, reason: string | null, note: string | null, expression = '') {
    await this.gate(async () => {
      this.journal = this.read()
      const session = this.view.session
      const group = (session ? this.journal.panels[session.session_id] ?? [] : []).find(g => g.group_id === groupId)
      if (!session || !group || !this.clock.canCapture(session) || group.action === 'none')
        throw new Error('SESSION_CAPTURE_CLOSED')
      if (!Number.isSafeInteger(physical) || physical < 0 || physical > 2147483647) throw new Error('FULL_PHYSICAL_INVALID')
      if ((reason === null) !== (note === null) ||
        (reason !== null && !reasons.includes(reason)) ||
        (note !== null && (note.trim().length < 3 || note.length > 1024)) ||
        (Math.abs(physical - group.stock_theoretical) >= 12 && reason === null))
        throw new Error('FULL_REASON_REQUIRED')
      const existing = this.journal.drafts[session.session_id]?.find(d => d.groupId === groupId)
      if (this.pendingFor(session.session_id).some(p => {
        const items = JSON.parse(p.exactPayload).items ?? []
        return items.some((x: { client_observation_id: string; grupo_id?: string; detalle_id?: string }) =>
          x.client_observation_id === existing?.clientObservationId ||
          x.grupo_id === groupId || (group.action === 'recount' && x.detalle_id === group.recount_detail_id))
      })) throw new Error('FULL_GROUP_ALREADY_PENDING')
      if (group.action === 'recount' && !isUuid(group.recount_detail_id)) throw new Error('FULL_RECOUNT_DETAIL_MISSING')
      const now = this.clock.now()
      if (!Number.isFinite(now) || now >= Date.parse(session.session_expires_at))
        throw new Error('SESSION_CAPTURE_CLOSED')
      const draft: FullDraft = {
        clientObservationId: existing?.clientObservationId ?? crypto.randomUUID(),
        sessionId: session.session_id, referenceSnapshotId: session.reference_snapshot_id,
        groupsRevision: session.groups_revision, groupId, action: group.action,
        recountDetailId: group.recount_detail_id, physical, reason, note: note?.trim() ?? null,
        countedAt: existing?.countedAt ?? new Date(now).toISOString(), expression,
      }
      const next = structuredClone(this.journal)
      next.drafts[session.session_id] = [
        ...(next.drafts[session.session_id] ?? []).filter(d => d.groupId !== groupId), draft,
      ]
      this.persist(next)
    })
  }

  private sessionFor(id: string) {
    return this.view.session?.session_id === id
      ? this.view.session : this.view.bootstrap?.recovery_sessions.find(s => s.session_id === id) ?? null
  }
  private eligible(session: FullSession, draft: FullDraft) {
    if (draft.referenceSnapshotId !== session.reference_snapshot_id ||
      draft.groupsRevision !== session.groups_revision || draft.sessionId !== session.session_id) return false
    const state = this.view.bootstrap
    if (this.view.session?.session_id === session.session_id) {
      const active = this.view.groups.filter(g => g.action !== 'none')
      const priority = Math.min(...active.map(g => rank[g.priority_class] ?? 4))
      const group = active.find(g => g.group_id === draft.groupId)
      return group?.action === draft.action && (rank[group.priority_class] ?? 4) === priority &&
        (draft.action !== 'recount' || group.recount_detail_id === draft.recountDetailId)
    }
    const delivery = state?.recovery_delivery_states?.find(x => x.session_id === session.session_id)
    if (!delivery || delivery.groups_revision !== draft.groupsRevision) return false
    const group = delivery.eligible_groups.find(g => g.group_id === draft.groupId)
    return group?.action === draft.action &&
      group.priority_class === delivery.current_priority_class &&
      group.reference_snapshot_id === draft.referenceSnapshotId &&
      (draft.action !== 'recount' || group.recount_detail_id === draft.recountDetailId)
  }
  private async registerInside(sessionId: string) {
    // Primero conciliar operaciones preparadas con sus UUID inmutables.
    await this.flushInside(sessionId)
    await this.refreshInside()
    let iterations = 0
    while (this.journal.drafts[sessionId]?.length) {
      if (++iterations > 10000) throw new Error('FULL_DELIVERY_ITERATION_LIMIT')
      const session = this.sessionFor(sessionId)
      if (!session || !session.pending_delivery_allowed ||
        this.clock.now() >= Date.parse(session.pending_delivery_until))
        throw new Error('SESSION_DELIVERY_CLOSED')
      const drafts = this.journal.drafts[sessionId]
      const eligible = drafts.filter(d => this.eligible(session, d))
      if (!eligible.length) throw new Error('FULL_DRAFTS_NOT_ELIGIBLE')
      const kind = eligible.some(d => d.action !== 'recount') ? 'save_batch' : 'recount_save_batch'
      const batch = eligible.filter(d => kind === 'save_batch' ? d.action !== 'recount' : d.action === 'recount').slice(0, 500)
      const items = batch.map(d => ({
        client_observation_id: d.clientObservationId, stock_fisico: d.physical,
        contado_at: d.countedAt, motivo_diferencia: d.reason,
        ...(kind === 'save_batch'
          ? { grupo_id: d.groupId, observacion_diferencia: d.note }
          : { detalle_id: d.recountDetailId, observacion_reconteo: d.note }),
      }))
      this.enqueue(kind, session, {
        session_id: sessionId, expected_groups_revision: session.groups_revision, items,
      })
      await this.flushInside(sessionId)
      // La prioridad puede cambiar después de cualquier lote confirmado.
      await this.refreshInside()
    }
  }
  async sendPending(sessionId = this.view.session?.session_id) {
    if (!sessionId) return
    await this.gate(async () => {
      this.journal = this.read(); this.publish({ busy: true })
      try { await this.registerInside(sessionId) }
      finally { this.publish({ busy: false }) }
    })
  }
  async finish(sessionId = this.view.session?.session_id) {
    if (!sessionId) return
    await this.gate(async () => {
      this.journal = this.read(); this.publish({ busy: true })
      try {
        // Una operación finish previamente preparada siempre se reintenta como replay exacto.
        const preparedFinish = this.pendingFor(sessionId).find(p => p.action === 'finish')
        if (preparedFinish) {
          await this.flushInside(sessionId)
          await this.refreshInside()
          return
        }
        await this.registerInside(sessionId)
        this.assertNoRejected(sessionId)
        if (this.anyUnresolved(sessionId)) throw new Error('FULL_PENDING_DELIVERY_REQUIRES_RECONCILIATION')
        const session = this.sessionFor(sessionId)
        if (!session) throw new Error('SESSION_NOT_FOUND')
        if (!session.pending_delivery_allowed ||
          this.clock.now() >= Date.parse(session.pending_delivery_until)) throw new Error('SESSION_DELIVERY_CLOSED')
        this.enqueue('finish', session, {
          session_id: sessionId, expected_groups_revision: session.groups_revision,
          delivery_manifest: { observation_ids: [...new Set(this.journal.confirmed[sessionId] ?? [])].sort(), client_queue_empty: true },
        })
        await this.flushInside(sessionId)
        await this.refreshInside()
      } finally { this.publish({ busy: false }) }
    })
  }
}
