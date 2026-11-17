import { describe, expect, test } from 'bun:test'
import { FullRuntime, type FullDraft, type FullRpc } from '../src/features/solog/cajero/full.runtime'

const uuid = (suffix: string) => `12345678-1234-4123-8123-${suffix}`
const userId = uuid('1234567890a1')
const sessionId = uuid('1234567890a2')
const observationA = uuid('1234567890a3')
const observationB = uuid('1234567890a4')
const operationId = uuid('1234567890a5')
const snapshotId = uuid('1234567890a6')
const groupA = uuid('1234567890a7')
const groupB = uuid('1234567890a8')
const requestId = uuid('1234567890a9')
const token = 'a'.repeat(64)

const draft = (id: string, groupId: string, time: string): FullDraft => ({
  clientObservationId: id, sessionId, referenceSnapshotId: snapshotId, groupsRevision: 2,
  groupId, action: 'coverage', recountDetailId: null,
  physical: 12, reason: null, note: null, countedAt: time, expression: '12',
})
const originalDrafts = [
  draft(observationA, groupA, '2026-11-11T16:05:11.000Z'),
  draft(observationB, groupB, '2026-11-11T16:05:12.000Z'),
]
const payload = {
  device_token: token, operation_id: operationId,
  session_id: sessionId, expected_groups_revision: 2,
  items: originalDrafts.map(d => ({
    client_observation_id: d.clientObservationId,
    grupo_id: d.groupId, stock_fisico: d.physical, contado_at: d.countedAt,
    motivo_diferencia: d.reason, observacion_diferencia: d.note,
  })),
}

type Config = {
  code?: string; itemIndex?: number | null
  actionRequired?: string; errorsTotal?: number; truncated?: boolean
  retryable?: boolean; networkError?: boolean; extraErrors?: boolean
}
function setup(config: Config = {}) {
  const memory = new Map<string, string>()
  const code = config.code ?? 'NORMAL_COUNT_ALREADY_IN_SHIFT'
  const itemIndex = config.itemIndex === undefined ? 1 : config.itemIndex
  const fieldPath = itemIndex === null ? '' : `p_payload.items[${itemIndex}]`
  let calls = 0
  const rpc: FullRpc = async (name, args) => {
    if (name !== 'rpc_solog_cashier_mutate_v7') throw new Error('UNEXPECTED_V6')
    calls++
    expect(args.p_action).toBe('save_batch')
    expect(args.p_payload).toEqual(payload)
    if (config.networkError) throw new Error('network failure')
    const errors = [{
      code, message: 'Solicitud no confirmada.', field_path: fieldPath,
    }, ...(config.extraErrors ? [{ code, message: 'Otra causa', field_path: '' }] : [])]
    return {
      ok: false, code, data: null, retryable: config.retryable ?? false,
      contract_version: 2, server_now: '2026-11-11T16:05:22.000Z', request_id: requestId,
      action_required: config.actionRequired ?? 'manual_review',
      errors, errors_total: config.errorsTotal ?? errors.length,
      errors_truncated: config.truncated ?? false,
    }
  }
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
  }
  const makeRuntime = () => new FullRuntime(userId, token, storage, rpc, { lock: async run => run() })
  const runtime = makeRuntime()
  const initial = {
    version: 2, userId, deviceToken: token,
    pending: [{ operationId, action: 'save_batch', sessionId, exactPayload: JSON.stringify(payload), status: 'pending', code: null }],
    confirmed: {}, panels: {}, drafts: { [sessionId]: structuredClone(originalDrafts) },
  }
  storage.setItem(runtime.key, JSON.stringify(initial))
  return { runtime: makeRuntime(), makeRuntime, storage, initial, calls: () => calls }
}

describe('SOLOG Cajero Full — B5 diagnóstico y aislamiento seguro', () => {
  test('V7 confirma rechazo atómico: conserva índice y permite separar solo el ítem indicado', async () => {
    const h = setup()
    await expect(h.runtime.resumePrepared()).rejects.toThrow('NORMAL_COUNT_ALREADY_IN_SHIFT')
    const pending = h.runtime.inspectPending()[0]
    expect(pending.status).toBe('rejected')
    expect(pending.code).toBe('NORMAL_COUNT_ALREADY_IN_SHIFT')
    expect(pending.failure).toEqual({
      serverNow: '2026-11-11T16:05:22.000Z', requestId,
      actionRequired: 'manual_review', errorsTotal: 1, errorsTruncated: false,
      errors: [{ code: 'NORMAL_COUNT_ALREADY_IN_SHIFT',
        message: 'Solicitud no confirmada.', field_path: 'p_payload.items[1]' }],
    })
    const incident = h.runtime.getIncidents().find(i => i.kind === 'operation')!
    expect(incident.fieldPath).toBe('p_payload.items[1]')
    expect(h.runtime.canDiscardIncident(incident)).toBe(false)

    const candidate = h.runtime.getBatchConflict(operationId)
    expect(candidate?.itemIndex).toBe(1)
    expect(candidate?.conflictingDraft.clientObservationId).toBe(observationB)
    expect(candidate?.retainedDraftCount).toBe(1)
    await h.runtime.resolveRejectedBatch(operationId)
    expect(h.runtime.inspectPending()).toEqual([])
    expect(h.runtime.getSnapshot().archivedConflicts).toBe(1)
    expect(h.runtime.getDrafts(sessionId)).toEqual([originalDrafts[0]])
    expect(h.calls()).toBe(1) // no hay nuevos V7 automáticos.

    const archived = h.runtime.getArchivedConflicts()[0]
    expect(archived.conflictingDraft).toEqual(originalDrafts[1])
    expect(archived.fieldPath).toBe('p_payload.items[1]')
    expect(archived.payloadWithoutToken.items).toEqual(payload.items)
    expect(archived.payloadWithoutToken).not.toHaveProperty('device_token')
    const diagnostics = h.runtime.exportDiagnostics()
    expect(JSON.stringify(diagnostics)).not.toContain(token)
    expect(diagnostics.archivedConflicts).toHaveLength(1)
    expect(diagnostics.confirmed).toEqual({})
    expect(h.makeRuntime().getArchivedConflicts()).toHaveLength(1)
    expect(h.makeRuntime().getDrafts(sessionId)).toEqual([originalDrafts[0]])
  })

  test('bloqueo por inconsistencia no se interpreta como duplicado simple', async () => {
    const h = setup({ code: 'NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT', itemIndex: 0 })
    await expect(h.runtime.resumePrepared()).rejects.toThrow('NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT')
    const candidate = h.runtime.getBatchConflict(operationId)
    expect(candidate?.code).toBe('NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT')
    expect(candidate?.conflictingDraft.clientObservationId).toBe(observationA)
    await h.runtime.resolveRejectedBatch(operationId)
    expect(h.runtime.getDrafts(sessionId)).toEqual([originalDrafts[1]])
  })

  test('sin field_path inequívoco no hay autorización local para separar ni descartar', async () => {
    for (const config of [
      { itemIndex: null }, { itemIndex: 9 }, { itemIndex: -1 },
      { extraErrors: true }, { errorsTotal: 2 }, { truncated: true },
      { actionRequired: 'wait' }, { code: 'PRIORITY_CONFLICT', itemIndex: 0 },
    ] satisfies Config[]) {
      const h = setup(config)
      await expect(h.runtime.resumePrepared()).rejects.toThrow(config.code ?? 'NORMAL_COUNT_ALREADY_IN_SHIFT')
      expect(h.runtime.getBatchConflict(operationId)).toBeNull()
      await expect(h.runtime.resolveRejectedBatch(operationId)).rejects.toThrow('FULL_BATCH_RESOLUTION_BLOCKED')
      expect(h.runtime.getArchivedConflicts()).toEqual([])
      expect(h.runtime.getDrafts(sessionId)).toEqual(originalDrafts)
      expect(h.runtime.inspectPending()).toHaveLength(1)
    }
  })

  test('una respuesta incierta mantiene UUID y payload original; nunca separa', async () => {
    const h = setup({ networkError: true })
    await expect(h.runtime.resumePrepared()).rejects.toThrow('FULL_DELIVERY_UNCERTAIN')
    expect(h.runtime.getBatchConflict(operationId)).toBeNull()
    expect(h.runtime.inspectPending()[0].status).toBe('pending')
    expect(h.runtime.inspectPending()[0].exactPayload).toBe(JSON.stringify(payload))
    await expect(h.runtime.resolveRejectedBatch(operationId)).rejects.toThrow('FULL_BATCH_RESOLUTION_BLOCKED')
    expect(h.runtime.getArchivedConflicts()).toEqual([])
    expect(h.calls()).toBe(1)
  })

  test('un retryable server error no aporta prueba de no aplicación', async () => {
    const h = setup({ retryable: true })
    await expect(h.runtime.resumePrepared()).rejects.toThrow('FULL_DELIVERY_RETRYABLE')
    expect(h.runtime.inspectPending()[0].status).toBe('pending')
    expect(h.runtime.getBatchConflict(operationId)).toBeNull()
    expect(h.runtime.getArchivedConflicts()).toEqual([])
  })

  test('no separar si otra operación de la sesión sigue preparada', async () => {
    const h = setup()
    await expect(h.runtime.resumePrepared()).rejects.toThrow('NORMAL_COUNT_ALREADY_IN_SHIFT')
    const journal = JSON.parse(h.storage.getItem(h.runtime.key)!)
    const second = uuid('1234567890aa')
    journal.pending.push({
      operationId: second, action: 'finish', sessionId,
      exactPayload: JSON.stringify({
        operation_id: second, device_token: token, session_id: sessionId,
      }),
      status: 'pending', code: null,
    })
    h.storage.setItem(h.runtime.key, JSON.stringify(journal))
    const reloaded = h.makeRuntime()
    expect(reloaded.getBatchConflict(operationId)).toBeNull()
    await expect(reloaded.resolveRejectedBatch(operationId))
      .rejects.toThrow('FULL_BATCH_RESOLUTION_BLOCKED')
  })

  test('no separar si V6 ya reconoció remotamente una observación del lote', async () => {
    const h = setup()
    await expect(h.runtime.resumePrepared()).rejects.toThrow('NORMAL_COUNT_ALREADY_IN_SHIFT')
    const journal = JSON.parse(h.storage.getItem(h.runtime.key)!)
    journal.confirmed[sessionId] = [observationA]
    h.storage.setItem(h.runtime.key, JSON.stringify(journal))
    const reloaded = h.makeRuntime()
    expect(reloaded.getBatchConflict(operationId)).toBeNull()
    await expect(reloaded.resolveRejectedBatch(operationId))
      .rejects.toThrow('FULL_BATCH_RESOLUTION_BLOCKED')
  })

  test('el journal V2 histórico sin receipt mantiene su rechazo sin permitir reconstrucción', async () => {
    const h = setup()
    const journal = JSON.parse(h.storage.getItem(h.runtime.key)!)
    journal.pending[0].status = 'rejected'
    journal.pending[0].code = 'NORMAL_COUNT_ALREADY_IN_SHIFT'
    h.storage.setItem(h.runtime.key, JSON.stringify(journal))
    const reloaded = h.makeRuntime()
    expect(reloaded.getBatchConflict(operationId)).toBeNull()
    expect(reloaded.inspectPending()[0].code).toBe('NORMAL_COUNT_ALREADY_IN_SHIFT')
    expect(reloaded.getArchivedConflicts()).toEqual([])
  })

  test('no permite resolver una segunda vez el mismo UUID ni borrar el archivo', async () => {
    const h = setup()
    await expect(h.runtime.resumePrepared()).rejects.toThrow('NORMAL_COUNT_ALREADY_IN_SHIFT')
    await h.runtime.resolveRejectedBatch(operationId)
    await expect(h.runtime.resolveRejectedBatch(operationId))
      .rejects.toThrow('FULL_BATCH_RESOLUTION_BLOCKED')
    expect(h.runtime.getArchivedConflicts()).toHaveLength(1)
  })
})
