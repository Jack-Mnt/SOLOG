import { describe, expect, test } from 'bun:test'
import { FullRuntime, ServerClock, type FullRpc } from '../src/features/solog/cajero/full.runtime'
import type { FullGroup, FullSession } from '../src/features/solog/cajero/full.contract'

const uuid = (suffix: string) => `12345678-1234-4123-8123-${suffix}`
const userId = uuid('1234567890ab'), sid = uuid('1234567890ac')
const snapshotId = uuid('1234567890ad'), categoryId = uuid('1234567890ae')
const groupA = uuid('1234567890af'), groupB = uuid('1234567890b0')
const requestId = uuid('1234567890b1')
const from = (s: string) => new Date(s).toISOString()
const started = Date.parse('2026-10-23T09:05:00-05:00')
const captured = Date.parse('2026-10-23T08:59:00-05:00')
const expiration = Date.parse('2026-10-23T09:59:00-05:00')
const iso = (n: number) => new Date(n).toISOString()

const makeGroup = (id: string, priority: string): FullGroup => ({
  group_id: id, group_name: 'Grupo ' + id.slice(-3), category_id: categoryId,
  category_name: 'Pruebas', reference_snapshot_id: snapshotId, groups_revision: 1,
  stock_theoretical: 10, member_codes: [1], members: [{ c_interno: 1, product: 'Test', barcode: null, price: 10 }],
  price: 10, units_per_package: null, package_price: null, action: 'coverage',
  priority_class: priority, recount_detail_id: null,
})

function harness(options: { failOnce?: boolean; reject?: boolean; twoPriorities?: boolean } = {}) {
  let now = started, monotonic = 0, requests: { action: string; payload: Record<string, unknown> }[] = []
  const confirmed = new Set<string>(), accepted = new Map<string, unknown>(), memory = new Map<string, string>()
  let startedSession = false, finished = false, failed = false
  const groups = [makeGroup(groupA, 'round_coverage'),
    makeGroup(groupB, options.twoPriorities ? 'shift_coverage' : 'round_coverage')]
  const session = (): FullSession => ({
    session_id: sid, status: finished ? 'finished' : now >= expiration ? 'recovery' : 'active',
    session_started_at: iso(started), reference_snapshot_id: snapshotId,
    reference_snapshot_captured_at: iso(captured), reference_stock_expires_at: iso(captured + 7200000),
    capture_interval_number: 1, capture_interval_starts_at: iso(captured),
    capture_interval_ends_at: iso(expiration), session_expires_at: iso(expiration),
    pending_delivery_until: iso(expiration + 7200000), groups_revision: 1,
    capture_allowed: !finished && now < expiration, pending_delivery_allowed: !finished && now < expiration + 7200000,
  })
  const response = (code: string, data: unknown, replay = false) => ({
    contract_version: 2, ok: true, code, server_now: iso(now), request_id: requestId,
    retryable: false, data: replay && data && typeof data === 'object' ? { ...data, replay: true } : data,
  })
  const rpc: FullRpc = async (name, args) => {
    if (name === 'rpc_solog_cashier_bootstrap_v6') {
      const recovery = startedSession && !finished && now >= expiration
      return response('CASHIER_STATE', {
        timezone: 'America/Lima', stock: {
          snapshot_id: snapshotId, snapshot_captured_at: iso(captured),
          snapshot_confirmed_at: iso(captured + 22000),
          stock_expires_at: iso(captured + 7200000), is_fresh: true, is_fallback: false,
          catalog_version: 1, groups_revision: 1,
        },
        session: startedSession && !finished && !recovery ? session() : null,
        recovery_sessions: recovery ? [session()] : [],
        recovery_delivery_states: recovery ? [{
          session_id: sid, groups_revision: 1,
          current_priority_class: groups.find(g => g.action !== 'none')?.priority_class ?? 'none',
          eligible_groups: groups.filter(g => g.action !== 'none').map(g => ({
            group_id: g.group_id, action: g.action, priority_class: g.priority_class,
            recount_detail_id: null, reference_snapshot_id: snapshotId,
          })),
        }] : [],
        groups: startedSession && !finished && !recovery ? groups : [],
        confirmed_observation_ids: startedSession && !finished && !recovery ? [...confirmed] : [],
        recovery_manifests: recovery ? [{ session_id: sid, observation_ids: [...confirmed] }] : [],
        capabilities: { can_start_session: !startedSession, can_capture_in_current_session: startedSession && !recovery,
          block_reason: startedSession ? 'SESSION_ALREADY_ACTIVE' : null },
      })
    }
    const action = String(args.p_action), payload = args.p_payload as Record<string, unknown>
    requests.push({ action, payload })
    const op = String(payload.operation_id)
    if (accepted.has(op)) return response(action === 'finish' ? 'SESSION_FINISHED' : action === 'start' ? 'SESSION_STARTED' : 'OBSERVATIONS_CONFIRMED', accepted.get(op), true)
    if (action === 'save_batch' && options.reject) return {
      ok: false, code: 'PRIORITY_CONFLICT', retryable: false, request_id: requestId,
      contract_version: 2, server_now: iso(now), data: null, errors: [],
    }
    if (action === 'save_batch' && options.failOnce && !failed) { failed = true; throw new Error('timeout') }
    if (action === 'start') startedSession = true
    const items = (payload.items ?? []) as { client_observation_id: string; grupo_id?: string }[]
    for (const i of items) {
      confirmed.add(i.client_observation_id)
      const g = groups.find(g => g.group_id === i.grupo_id)
      if (g) { g.action = 'none'; g.priority_class = 'none' }
    }
    if (action === 'finish') {
      expect(payload.delivery_manifest).toEqual({ observation_ids: [...confirmed].sort(), client_queue_empty: true })
      finished = true
    }
    const mutation = {
      action, replay: false, session: session(),
      affected_groups: action === 'save_batch' ? groups.filter(g => items.some(i => i.grupo_id === g.group_id)) : [],
      observation_results: items.map(i => ({
        client_observation_id: i.client_observation_id, detail_id: uuid('1234567890b2'),
        state: 'Coincide', difference: 0, replay: false,
      })),
    }
    accepted.set(op, mutation)
    return response(action === 'start' ? 'SESSION_STARTED' : action === 'finish' ? 'SESSION_FINISHED' : 'OBSERVATIONS_CONFIRMED', mutation)
  }
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
  }
  const runtime = new FullRuntime(userId, 'a'.repeat(64), storage, rpc, {
    clock: new ServerClock(() => monotonic, () => monotonic), lock: async fn => fn(),
  })
  const advance = (ms: number) => { now += ms; monotonic += ms }
  return { runtime, storage, requests: () => requests, advance, memory }
}

describe('Cajero Full — borradores y registro agrupado V7', () => {
  test('Continuar persiste y permite editar un borrador sin llamar mutate_v7', async () => {
    const h = harness()
    await h.runtime.start()
    const before = h.requests().length
    await h.runtime.observe(groupA, 0, null, null, '0')
    const draft = h.runtime.getDraft(groupA)!
    expect(draft.physical).toBe(0)
    expect(h.requests()).toHaveLength(before)
    await h.runtime.observe(groupA, 9, null, null, '4+5')
    expect(h.runtime.getDraft(groupA)!.countedAt).toBe(draft.countedAt)
    expect(h.runtime.getDraft(groupA)!.clientObservationId).toBe(draft.clientObservationId)
    expect(h.runtime.getDrafts()).toHaveLength(1)
    await h.runtime.sendPending()
    expect(h.requests().filter(r => r.action === 'save_batch')).toHaveLength(1)
    expect((h.requests().find(r => r.action === 'save_batch')?.payload.items as unknown[])).toHaveLength(1)
    expect(h.runtime.getDrafts()).toHaveLength(0)
  })

  test('registra dos borradores elegibles en un solo batch, luego cierra con manifiesto', async () => {
    const h = harness()
    await h.runtime.start()
    await h.runtime.observe(groupA, 10, null, null, '10')
    await h.runtime.observe(groupB, 11, null, null, '11')
    await h.runtime.finish()
    expect(h.requests().filter(x => x.action === 'save_batch')).toHaveLength(1)
    expect((h.requests().find(x => x.action === 'save_batch')?.payload.items as unknown[])).toHaveLength(2)
    expect(h.requests().at(-1)?.action).toBe('finish')
    expect(h.runtime.getSnapshot().drafts).toBe(0)
  })

  test('timeout conserva UUID/payload y retry no duplica la observación', async () => {
    const h = harness({ failOnce: true })
    await h.runtime.start()
    await h.runtime.observe(groupA, 10, null, null)
    await expect(h.runtime.sendPending()).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(h.runtime.inspectPending()).toHaveLength(1)
    const first = structuredClone(h.requests().at(-1))
    await h.runtime.sendPending()
    expect(h.requests().at(-1)).toEqual(first)
    expect(h.runtime.getDrafts()).toHaveLength(0)
    expect(h.runtime.inspectPending()).toHaveLength(0)
  })

  test('rechazo definitivo queda retenido, nunca reintenta ni permite finish', async () => {
    const h = harness({ reject: true })
    await h.runtime.start()
    await h.runtime.observe(groupA, 10, null, null)
    await expect(h.runtime.sendPending()).rejects.toThrow('PRIORITY_CONFLICT')
    expect(h.runtime.getSnapshot().rejected).toBe(1)
    const count = h.requests().length
    await expect(h.runtime.retry()).rejects.toThrow('FULL_REJECTED_REQUIRES_REVIEW')
    await expect(h.runtime.finish()).rejects.toThrow('FULL_REJECTED_REQUIRES_REVIEW')
    expect(h.requests()).toHaveLength(count)
  })

  test('al expirar bloquea capturas, registra conteos previos en recovery y finaliza', async () => {
    const h = harness()
    await h.runtime.start()
    await h.runtime.observe(groupA, 10, null, null)
    h.advance(55 * 60_000)
    await expect(h.runtime.observe(groupB, 10, null, null)).rejects.toThrow('SESSION_CAPTURE_CLOSED')
    await h.runtime.finish(sid)
    expect(h.requests().filter(x => x.action === 'save_batch')).toHaveLength(1)
    expect(h.requests().at(-1)?.action).toBe('finish')
  })

  test('migra journal V1 sin borrar operaciones existentes', () => {
    const h = harness()
    const key = h.runtime.key
    const v1 = {
      version: 1, userId, deviceToken: 'a'.repeat(64),
      pending: [], confirmed: {}, panels: {},
    }
    h.storage.setItem(key, JSON.stringify(v1))
    const again = new FullRuntime(userId, 'a'.repeat(64), h.storage, async () => { throw Error('RPC not expected') }, {
      lock: async fn => fn(),
    })
    expect(again.getSnapshot().drafts).toBe(0)
    expect(again.inspectPending()).toEqual([])
  })
})
