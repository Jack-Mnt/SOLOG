import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import { CashierV4Store } from '../src/features/solog/cajero/cajero.v4.store'
import { CashierV4DraftCoordinator } from '../src/features/solog/cajero/cajero.v4.flush'
import { draftHarness, uuidFor } from './fixtures/cashier-v4-drafts'
import { cashierV4Bootstrap, cashierV4Ids as ids, cashierV4DeviceToken } from './fixtures/cashier-v4.mjs'

const normal = (h: ReturnType<typeof draftHarness>, group = ids.coverage) => h.coordinator.captureNormal(h.scope, {
  grupo_id: group, stock_fisico: 10, contado_at: h.stamp,
})

describe('Cajero 13.3: flush y prioridad backend', () => {
  test('review bloquea normales aunque haya coverage/daily locales', async () => {
    const h = draftHarness()
    normal(h); normal(h, ids.daily)
    expect((await h.coordinator.flush(h.scope)).reason).toBe('no_eligible_drafts')
    expect(h.requests).toEqual([])
    expect(h.storage.read(h.scope).normal).toHaveLength(2)
  })
  test('coverage → review_for_coverage → review_regular → daily reevalúa autoridad tras cada delta', async () => {
    const h = draftHarness('coverage')
    const regularGroupId = uuidFor(51001), regularDetailId = uuidFor(51002)
    const b = cashierV4Bootstrap('active', { next_action: 'coverage' })
    b.panel_state!.groups.push({
      ...structuredClone(b.panel_state!.groups[0]),
      grupo_id: regularGroupId,
      detalle_reconteo_id: regularDetailId,
    })
    b.panel_state!.review_queue.push({
      ...b.panel_state!.review_queue[0],
      grupo_id: regularGroupId,
      detalle_id: regularDetailId,
      priority_class: 'review_regular',
    })
    b.panel_state!.kpis.review_pending = 2
    h.store.acceptBootstrap(b)
    normal(h); normal(h, ids.daily)
    // Capture regular first on purpose: local order must not bypass backend subpriority.
    h.coordinator.captureRecount(h.scope, {
      detalle_id: regularDetailId, grupo_id: regularGroupId, stock_fisico: 10, contado_at: h.stamp,
    })
    h.coordinator.captureRecount(h.scope, {
      detalle_id: ids.detail, grupo_id: ids.review, stock_fisico: 10, contado_at: h.stamp,
    })
    const result = await h.coordinator.flush(h.scope)
    expect(result).toEqual({ confirmedBatches: 4, reason: 'none' })
    expect(h.requests.map(request => request.action))
      .toEqual(['save_batch', 'recount_save_batch', 'recount_save_batch', 'save_batch'])
    expect((h.requests[0].payload.items as Array<{ grupo_id: string }>)[0].grupo_id).toBe(ids.coverage)
    expect((h.requests[1].payload.items as Array<{ detalle_id: string }>)[0].detalle_id).toBe(ids.detail)
    expect((h.requests[2].payload.items as Array<{ detalle_id: string }>)[0].detalle_id).toBe(regularDetailId)
    expect((h.requests[3].payload.items as Array<{ grupo_id: string }>)[0].grupo_id).toBe(ids.daily)
    expect(new Set(h.requests.map(request => request.payload.operation_id)).size).toBe(4)
    expect(h.storage.read(h.scope).normal).toEqual([])
    expect(h.storage.read(h.scope).recount).toEqual([])
    expect(h.storage.read(h.scope).prepared).toBeNull()
  })
  test('coverage filtra daily y drafts fuera de queue; los excluidos se conservan', async () => {
    const h = draftHarness('coverage')
    normal(h); normal(h, ids.daily); normal(h, ids.none)
    h.respond(async (_, args) => h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>, 'none'))
    await h.coordinator.flush(h.scope)
    expect(h.requests).toHaveLength(1)
    expect((h.requests[0].payload.items as Array<{ grupo_id: string }>).map(item => item.grupo_id)).toEqual([ids.coverage])
    expect(h.storage.read(h.scope).normal.map(item => item.grupo_id)).toEqual([ids.daily, ids.none])
  })
  test('daily filtra coverage; none nunca finaliza automáticamente', async () => {
    const h = draftHarness('daily')
    normal(h); normal(h, ids.daily)
    expect((await h.coordinator.flush(h.scope)).reason).toBe('none')
    expect((h.requests[0].payload.items as Array<{ grupo_id: string }>).map(item => item.grupo_id)).toEqual([ids.daily])
    expect(h.requests.map(request => request.action)).not.toContain('finish')
    expect(h.storage.read(h.scope).normal[0].grupo_id).toBe(ids.coverage)
  })
  test('recount requiere coincidencia de detalle y grupo en review_queue', async () => {
    const h = draftHarness()
    h.coordinator.captureRecount(h.scope, { detalle_id: ids.detail, grupo_id: ids.none, stock_fisico: 10, contado_at: h.stamp })
    expect((await h.coordinator.flush(h.scope)).reason).toBe('no_eligible_drafts')
    expect(h.requests).toEqual([])
    expect(h.storage.read(h.scope).recount).toHaveLength(1)
  })
  test('retry normal reproduce UUID, client ID, timestamp, items y revisión tras timeout', async () => {
    const h = draftHarness('coverage')
    const draft = normal(h)
    h.respond(async () => { throw new Error('timeout') })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    const prepared = h.storage.read(h.scope).prepared!
    h.respond(async (_, args) => ({ ...h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>), replay: true }))
    await h.coordinator.flush(h.scope)
    expect(h.requests[1]).toEqual(h.requests[0])
    expect(prepared.operation_id).toBe(h.requests[0].payload.operation_id)
    expect((h.requests[0].payload.items as Array<{ client_observation_id: string; contado_at: string }>)[0]).toMatchObject({
      client_observation_id: draft.client_observation_id, contado_at: draft.contado_at,
    })
    expect(h.storage.read(h.scope).normal).toEqual([])
  })
  test.each(['SOLOG_OPERATION_IN_PROGRESS', 'SOLOG_IDEMPOTENCY_CONFLICT'] as const)('%s conserva evidencia y jamás reemplaza operación', async code => {
    const h = draftHarness('coverage')
    normal(h)
    h.respond(async () => { throw new SologApiError(code) })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    const prepared = h.storage.read(h.scope).prepared!
    expect(prepared.status).toBe(code === 'SOLOG_OPERATION_IN_PROGRESS' ? 'in_progress' : 'conflict')
    h.respond(async (_, args) => h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>))
    const result = await h.coordinator.flush(h.scope)
    if (code === 'SOLOG_IDEMPOTENCY_CONFLICT') {
      expect(result.reason).toBe('idempotency_conflict')
      expect(h.requests).toHaveLength(1)
      expect(h.storage.read(h.scope).prepared!.operation_id).toBe(prepared.operation_id)
    } else expect(h.requests[1]).toEqual(h.requests[0])
  })
  test('flush recovery A usa scope original y deja panel B intacto; B tiene operation_id propio', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const b = h.moveToRecovery()
    const scopeB = h.coordinator.activeScope()!
    h.coordinator.captureNormal(scopeB, { grupo_id: ids.coverage, stock_fisico: 10, contado_at: b.panel_state!.session.iniciado_at })
    const panelB = h.store.getSnapshot().panel_state
    await h.coordinator.flush(h.scope)
    expect(h.requests[0].payload.conteo_id).toBe(h.scope.conteo_id)
    expect(h.requests[0].payload.expected_groups_revision).toBe(7)
    expect(h.store.getSnapshot().panel_state).toBe(panelB)
    expect(h.storage.read(scopeB).normal).toHaveLength(1)
    await h.coordinator.flush(scopeB)
    expect(h.requests[1].payload.conteo_id).toBe(scopeB.conteo_id)
    expect(h.requests[1].payload.expected_groups_revision).toBe(99)
    expect(h.requests[1].payload.operation_id).not.toBe(h.requests[0].payload.operation_id)
  })
  test('recovery sin capability o ausente conserva drafts y no envía', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const b = h.moveToRecovery()
    b.recovery_sessions[0].session_capability.pending_delivery_allowed = false
    h.store.acceptBootstrap(b)
    expect((await h.coordinator.flush(h.scope)).reason).toBe('delivery_not_allowed')
    b.recovery_sessions = []
    h.store.acceptBootstrap(b)
    expect((await h.coordinator.flush(h.scope)).reason).toBe('session_unavailable')
    expect(h.requests).toEqual([])
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
  })
  test('recovery expirada no relocaliza ni elimina drafts', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const b = h.moveToRecovery()
    b.server_now = b.recovery_sessions[0].recovery_until
    h.store.acceptBootstrap(b)
    expect((await h.coordinator.flush(h.scope)).reason).toBe('delivery_not_allowed')
    expect(h.storage.read(h.scope).normal[0].scope).toEqual(h.scope)
    expect(h.requests).toEqual([])
  })
  test('recovery tras reload sin snapshot ni prepared bloquea conservando drafts', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const b = h.moveToRecovery()
    const record = h.storage.read(h.scope)
    record.delivery_state = null
    h.storage.write(record)
    const reloaded = new CashierV4Store(ids.user, cashierV4DeviceToken, undefined, () => h.now)
    reloaded.acceptBootstrap(b)
    const coordinator = new CashierV4DraftCoordinator(reloaded, h.storage, async () => { throw new Error('No debe enviar') }, undefined, () => h.now)
    expect((await coordinator.flush(h.scope)).reason).toBe('missing_delivery_state')
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
  })
  test('recovery tras reload puede retry preparado sin delivery state y con capability vigente', async () => {
    const h = draftHarness('coverage')
    normal(h)
    h.respond(async () => { throw new Error('timeout') })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    const b = h.moveToRecovery()
    const record = h.storage.read(h.scope)
    record.delivery_state = null
    h.storage.write(record)
    const reloaded = new CashierV4Store(ids.user, cashierV4DeviceToken, undefined, () => h.now)
    reloaded.acceptBootstrap(b)
    const coordinator = new CashierV4DraftCoordinator(reloaded, h.storage, async (_, args) => {
      h.requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload as Record<string, unknown>) })
      return { ...h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>), replay: true }
    }, () => { throw new Error('No debe generar UUID') }, () => h.now)
    await coordinator.flush(h.scope)
    expect(h.requests[1]).toEqual(h.requests[0])
    expect(h.storage.read(h.scope).prepared).toBeNull()
    expect(h.storage.read(h.scope).normal).toEqual([])
    expect(h.storage.read(h.scope).delivery_state!.groups_revision).toBe(7)
  })
  test('recovery tras reload usa snapshot persistido para planificar sin snapshot en memoria', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const b = h.moveToRecovery()
    const reloaded = new CashierV4Store(ids.user, cashierV4DeviceToken, undefined, () => h.now)
    reloaded.acceptBootstrap(b)
    const coordinator = new CashierV4DraftCoordinator(reloaded, h.storage, async (_, args) => h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>), undefined, () => h.now)
    expect(reloaded.getSnapshot().delivery_state_by_session[h.scope.conteo_id]).toBeUndefined()
    await coordinator.flush(h.scope)
    expect(h.storage.read(h.scope).normal).toEqual([])
  })
  test('replay de una operación activa no convierte recovery en active con su capability histórica', async () => {
    const h = draftHarness('coverage')
    normal(h)
    let replay!: ReturnType<typeof h.responseFor>
    h.respond(async (_, args) => {
      replay = structuredClone(h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>))
      throw new Error('respuesta perdida')
    })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    h.moveToRecovery()
    h.respond(async () => ({ ...replay, replay: true }))
    await h.coordinator.flush(h.scope)
    expect(h.store.getSnapshot().recovery_sessions[0].session_capability.mode).toBe('recovery')
    expect(h.store.getSnapshot().recovery_sessions[0].session_capability.capture_allowed).toBe(false)
    expect(h.requests[1]).toEqual(h.requests[0])
  })
  test.each([500, 501])('%s drafts respetan máximo 500 y replanifican el siguiente batch', async count => {
    const h = draftHarness('coverage', count)
    const record = h.coordinator.synchronize(h.scope)
    record.normal = record.delivery_state!.coverage_queue.map((grupo_id, n) => ({
      kind: 'normal', scope: h.scope, grupo_id, stock_fisico: 10, contado_at: h.stamp, client_observation_id: uuidFor(20000 + n),
    }))
    h.storage.write(record)
    await h.coordinator.flush(h.scope)
    expect(h.requests.map(request => (request.payload.items as unknown[]).length)).toEqual(count === 500 ? [500] : [500, 1])
    expect(h.storage.read(h.scope).normal).toEqual([])
  })
  test('501 review_for_coverage se agotan antes de preparar review_regular', async () => {
    const h = draftHarness('coverage')
    const b = h.moveToRecovery()
    const record = h.storage.read(h.scope)
    const priorityQueue = Array.from({ length: 501 }, (_, n) => ({
      grupo_id: uuidFor(30000 + n),
      detalle_id: uuidFor(40000 + n),
      ultima_diferencia: -1,
      contado_at: h.stamp,
      priority_class: 'review_for_coverage' as const,
    }))
    const regular = {
      grupo_id: uuidFor(50001),
      detalle_id: uuidFor(50002),
      ultima_diferencia: 1,
      contado_at: h.stamp,
      priority_class: 'review_regular' as const,
    }
    record.delivery_state = {
      ...record.delivery_state!,
      next_action: 'review',
      coverage_queue: [],
      daily_queue: [],
      review_queue: [...priorityQueue, regular],
      kpis: { ...record.delivery_state!.kpis, coverage_queue_pending: 0, daily_pending: 0, review_pending: 502 },
    }
    record.normal = []
    record.recount = [...priorityQueue, regular].map(item => ({
      kind: 'recount' as const,
      scope: h.scope,
      detalle_id: item.detalle_id,
      grupo_id: item.grupo_id,
      stock_fisico: 10,
      contado_at: h.stamp,
    }))
    h.storage.write(record)

    const reloaded = new CashierV4Store(ids.user, cashierV4DeviceToken, undefined, () => h.now)
    reloaded.acceptBootstrap(b)
    let serial = 60000
    const coordinator = new CashierV4DraftCoordinator(reloaded, h.storage, async (_name, args) => {
      h.requests.push({ action: args.p_action as string, payload: structuredClone(args.p_payload as Record<string, unknown>) })
      return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
    }, () => uuidFor(serial++), () => h.now)

    expect(await coordinator.flush(h.scope)).toEqual({ confirmedBatches: 3, reason: 'none' })
    expect(h.requests.map(request => (request.payload.items as unknown[]).length)).toEqual([500, 1, 1])
    expect((h.requests[0].payload.items as Array<{ detalle_id: string }>).some(item => item.detalle_id === regular.detalle_id)).toBe(false)
    expect((h.requests[1].payload.items as Array<{ detalle_id: string }>)[0].detalle_id).toBe(priorityQueue[500].detalle_id)
    expect((h.requests[2].payload.items as Array<{ detalle_id: string }>)[0].detalle_id).toBe(regular.detalle_id)
    expect(h.storage.read(h.scope).recount).toEqual([])
  })

  test('batch 1 confirmado + batch 2 falla conserva progreso y retry exacto de batch 2', async () => {
    const h = draftHarness('coverage', 501)
    const record = h.coordinator.synchronize(h.scope)
    record.normal = record.delivery_state!.coverage_queue.map((grupo_id, n) => ({
      kind: 'normal', scope: h.scope, grupo_id, stock_fisico: 10, contado_at: h.stamp, client_observation_id: uuidFor(20000 + n),
    }))
    h.storage.write(record)
    h.respond(async (_, args) => {
      if (h.requests.length === 2) throw new Error('batch 2 timeout')
      return h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
    })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow('batch 2 timeout')
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
    const pending = h.storage.read(h.scope).prepared!
    h.respond(async (_, args) => h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>))
    await h.coordinator.flush(h.scope)
    expect(h.requests[2]).toEqual(h.requests[1])
    expect(pending.operation_id).not.toBe(h.requests[0].payload.operation_id)
    expect(h.storage.read(h.scope).normal).toEqual([])
  })
  test('confirmación inconsistente conserva operación y drafts sin planificar otro batch', async () => {
    const h = draftHarness('coverage')
    normal(h)
    h.respond(async (_, args) => {
      const response = h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
      response.items[0].client_observation_id = uuidFor(777)
      return response
    })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
    expect(h.storage.read(h.scope).prepared).not.toBeNull()
    expect(h.requests).toHaveLength(1)
  })
  test('delta sin progreso esperado detiene, sin restaurar un draft confirmado', async () => {
    const h = draftHarness('coverage')
    normal(h)
    h.respond(async (_, args) => {
      const response = h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>)
      response.panel_delta.coverage_queue = [ids.coverage]
      response.panel_delta.next_action = 'coverage'
      return response
    })
    expect((await h.coordinator.flush(h.scope)).reason).toBe('no_progress')
    expect(h.requests).toHaveLength(1)
    expect(h.storage.read(h.scope).normal).toEqual([])
  })
  test('finish solo explícito, retry conserva UUID y cleanup solo afecta su sesión', async () => {
    const h = draftHarness('none')
    const b = h.moveToRecovery()
    const scopeB = h.coordinator.activeScope()!
    h.coordinator.captureNormal(scopeB, { grupo_id: ids.coverage, stock_fisico: 10, contado_at: b.panel_state!.session.iniciado_at })
    await h.coordinator.flush(h.scope)
    expect(h.requests).toEqual([])
    h.respond(async () => { throw new Error('finish timeout') })
    await expect(h.coordinator.finish(h.scope)).rejects.toThrow()
    const prepared = h.storage.read(h.scope).prepared!
    expect(prepared.action).toBe('finish')
    h.respond(async (_, args) => h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>))
    await h.coordinator.finish(h.scope)
    expect(h.requests[1]).toEqual(h.requests[0])
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.storage.read(h.scope).delivery_state).toBeNull()
    expect(h.storage.read(scopeB).normal).toHaveLength(1)
    await h.coordinator.finish(h.scope)
    expect(h.requests).toHaveLength(2)
  })
  test('finish bloquea drafts y operaciones pendientes; flush no reintenta finish', async () => {
    const h = draftHarness('coverage')
    normal(h)
    await expect(h.coordinator.finish(h.scope)).rejects.toThrow('drafts')
    h.respond(async () => { throw new Error('timeout') })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    await expect(h.coordinator.finish(h.scope)).rejects.toThrow('preparada')
    const clean = draftHarness('none')
    clean.respond(async () => { throw new Error('timeout') })
    await expect(clean.coordinator.finish(clean.scope)).rejects.toThrow()
    await expect(clean.coordinator.flush(clean.scope)).rejects.toThrow('explícitamente')
    expect(clean.requests).toHaveLength(1)
  })
  test('finish explícito conserva drafts fuera de queues para resolución posterior', async () => {
    const h = draftHarness('none')
    normal(h, ids.none)
    await h.coordinator.finish(h.scope)
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
    expect(h.storage.read(h.scope).finished).toBe(true)
    expect(h.requests[0].action).toBe('finish')
  })
  test('serializa requests entre coordinadores/sesiones y bloquea captura mientras se envía', async () => {
    const h = draftHarness('coverage')
    normal(h)
    let resolve!: (value: unknown) => void
    h.respond(() => new Promise(done => { resolve = done }))
    const first = h.coordinator.flush(h.scope)
    const other = new CashierV4DraftCoordinator(h.store, h.storage)
    await expect(other.flush(h.scope)).rejects.toThrow('curso')
    await expect(other.finish(h.scope)).rejects.toThrow('curso')
    expect(() => normal(h, ids.daily)).toThrow('curso')
    resolve(h.responseFor(h.requests[0].action, h.requests[0].payload))
    await first
  })
  test('fallo de persistencia antes de preparar impide request', async () => {
    const h = draftHarness('coverage')
    normal(h)
    h.raw.setItem = () => { throw new Error('quota') }
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow('quota')
    expect(h.requests).toEqual([])
  })
  test('receipt duradero permite completar cleanup sin reenviar tras fallo local', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const original = h.raw.setItem.bind(h.raw)
    let failed = false
    h.raw.setItem = (key, value) => {
      const record = JSON.parse(value)
      if (!failed && record.normal.length === 0 && record.prepared === null) { failed = true; throw new Error('write interrupted') }
      original(key, value)
    }
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow('write interrupted')
    expect(h.storage.read(h.scope).prepared!.response).not.toBeNull()
    await h.coordinator.flush(h.scope)
    expect(h.requests).toHaveLength(1)
    expect(h.storage.read(h.scope).normal).toEqual([])
    expect(h.storage.read(h.scope).prepared).toBeNull()
  })
  test('receipt histórico no restaura delivery negado en un bootstrap posterior', async () => {
    const h = draftHarness('coverage')
    normal(h)
    const original = h.raw.setItem.bind(h.raw)
    let failed = false
    h.raw.setItem = (key, value) => {
      const record = JSON.parse(value)
      if (!failed && record.normal.length === 0 && record.prepared === null) { failed = true; throw new Error('local failure') }
      original(key, value)
    }
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    const b = h.moveToRecovery()
    b.recovery_sessions[0].session_capability.pending_delivery_allowed = false
    h.store.acceptBootstrap(b)
    expect((await h.coordinator.flush(h.scope)).reason).toBe('delivery_not_allowed')
    expect(h.requests).toHaveLength(1)
    expect(h.store.getSnapshot().recovery_sessions[0].session_capability.pending_delivery_allowed).toBe(false)
    expect(h.storage.read(h.scope).normal).toEqual([])
  })
})
