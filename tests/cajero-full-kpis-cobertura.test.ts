import { describe, expect, test } from 'bun:test'
import { parseFullEnvelope, type FullCashierGroup, type FullState, type FullSession } from '../src/features/solog/cajero/full.contract'
import { projectFullCoverage } from '../src/features/solog/cajero/full.coverage'
import type { FullDraft } from '../src/features/solog/cajero/full.runtime'

const uuid = (tail: string) => `12345678-1234-4123-8123-${tail}`
const uid = uuid('1234567890ab')
const groupA = uuid('1234567890af'), groupB = uuid('1234567890b0')
const snapshotId = uuid('1234567890ad')
const now = '2026-10-27T14:05:00.000Z'
const roundFrom = '2026-10-24T05:00:00.000Z', roundUntil = '2026-11-01T05:00:00.000Z'

const session: FullSession = {
  session_id: uid, status: 'active',
  session_started_at: '2026-10-27T14:00:00.000Z',
  reference_snapshot_id: snapshotId,
  reference_snapshot_captured_at: '2026-10-27T13:59:00.000Z',
  reference_stock_expires_at: '2026-10-27T15:59:00.000Z',
  capture_interval_number: 1,
  capture_interval_starts_at: '2026-10-27T13:00:00.000Z',
  capture_interval_ends_at: '2026-10-27T15:00:00.000Z',
  session_expires_at: '2026-10-27T14:55:00.000Z',
  pending_delivery_until: '2026-10-27T16:55:00.000Z',
  capture_allowed: true, pending_delivery_allowed: true, groups_revision: 1,
}

function group(id: string, pending: boolean): FullCashierGroup {
  return {
    group_id: id, group_name: id, category_id: uuid('1234567890ae'),
    category_name: 'Prueba', reference_snapshot_id: snapshotId, groups_revision: 1,
    stock_theoretical: 5, member_codes: [1],
    members: [{ c_interno: 1, product: 'Prueba', barcode: null, price: 2 }],
    price: 2, units_per_package: null, package_price: null,
    action: 'coverage', priority_class: 'round_coverage', recount_detail_id: null,
    coverage_pending_round: pending,
  }
}
function state(active = true): FullState {
  return {
    timezone: 'America/Lima', stock: null,
    session: active ? session : null, recovery_sessions: [],
    groups: active ? [group(groupA, true), group(groupB, false)] : [],
    confirmed_observation_ids: [], recovery_manifests: [],
    capabilities: { can_start_session: !active, can_capture_in_current_session: active, block_reason: null },
    operational_summary: {
      basis: { coverage_round: 2, round_starts_at: roundFrom, round_ends_at: roundUntil },
      coverage_total: 2, coverage_counted: 1, coverage_pending: 1, coverage_percent: 50,
      review_pending: 1, daily_pending: 0, next_action: 'coverage',
    },
  }
}
function response(data: FullState) {
  return {
    ok: true, code: 'CASHIER_STATE', contract_version: 2, server_now: now, retryable: false,
    request_id: uuid('1234567890b1'), data,
  }
}
function draft(groupId = groupA, id = uuid('1234567890b2'), countedAt = now): FullDraft {
  return {
    clientObservationId: id, sessionId: session.session_id,
    referenceSnapshotId: snapshotId, groupsRevision: 1, groupId, action: 'coverage',
    recountDetailId: null, physical: 5, reason: null, note: null, countedAt, expression: '5',
  }
}
const present = (s: FullState, d: FullDraft[] = [], rejected = new Set<string>(), at = Date.parse(now), fresh = true) =>
  projectFullCoverage(s, s.session, d, rejected, at, true, fresh)

describe('Cajero Full — contrato V6 KPI separado de V7', () => {
  test('acepta resumen autoritativo y banderas en CASHIER_STATE', () => {
    expect(parseFullEnvelope(response(state())).code).toBe('CASHIER_STATE')
  })
  test('rechaza resumen ausente, grupos sin bandera, aritmética y porcentaje contradictorios', () => {
    const missing = state()
    expect(() => parseFullEnvelope(response({ ...missing, operational_summary: undefined }))).toThrow('FULL_INVALID_RESPONSE')
    expect(() => parseFullEnvelope(response({ ...missing, groups: [{ ...group(groupA, true), coverage_pending_round: undefined }] }))).toThrow('FULL_INVALID_RESPONSE')
    expect(() => parseFullEnvelope(response({ ...missing, operational_summary: { ...missing.operational_summary, coverage_pending: 2 } }))).toThrow('FULL_INVALID_RESPONSE')
    expect(() => parseFullEnvelope(response({ ...missing, operational_summary: { ...missing.operational_summary, coverage_percent: 51 } }))).toThrow('FULL_INVALID_RESPONSE')
  })
  test('rechaza respuesta temporalmente vencida; intervalo hasta exclusivo', () => {
    const s = state()
    const invalid = { ...s, operational_summary: { ...s.operational_summary, basis: {
      coverage_round: 2 as const, round_starts_at: roundFrom, round_ends_at: now,
    } } }
    expect(() => parseFullEnvelope(response(invalid))).toThrow('FULL_INVALID_RESPONSE')
  })
  test('V7 no necesita bandera ni resumen de V6', () => {
    const g = group(groupA, true)
    const { coverage_pending_round: _flag, ...baseGroup } = g
    const mutation = {
      ...response(state()), code: 'SESSION_STARTED',
      data: { action: 'start', replay: false, session, affected_groups: [baseGroup], observation_results: [] },
    }
    expect(parseFullEnvelope(mutation).code).toBe('SESSION_STARTED')
    expect(_flag).toBe(true)
  })
})

describe('Cajero Full — estado y avance provisional', () => {
  test('A1 sin sesión y B con sesión usan cobertura confirmada', () => {
    expect(present(state(false))?.homeState).toBe('A1')
    expect(present(state())?.homeState).toBe('B')
  })
  test('A2/C solo se alcanzan con cobertura oficial y no con borradores', () => {
    const a = present(state(), [draft()])
    expect(a?.displayed).toBe(2)
    expect(a?.provisional).toBe(1)
    expect(a?.complete).toBe(false)
    expect(a?.homeState).toBe('B')
    const s = state()
    s.operational_summary = { ...s.operational_summary, coverage_counted: 2, coverage_pending: 0, coverage_percent: 100 }
    expect(present(s)?.homeState).toBe('C')
    expect(present({ ...s, session: null, groups: [] })?.homeState).toBe('A2')
  })
  test('deduplica grupo, descarta rechazados, confirmados y fuera de ventana', () => {
    const d1 = draft(), d2 = draft(groupA, uuid('1234567890b3'))
    expect(present(state(), [d1,d2])?.provisional).toBe(1)
    expect(present(state(), [d1], new Set([d1.clientObservationId]))?.provisional).toBe(0)
    const confirmed = state()
    confirmed.confirmed_observation_ids = [d1.clientObservationId]
    expect(present(confirmed, [d1])?.provisional).toBe(0)
    expect(present(state(), [draft(groupB)])?.provisional).toBe(0)
    expect(present(state(), [draft(groupA, uuid('1234567890b4'), roundFrom.slice(0, 10) + 'T04:59:59.000Z')])?.provisional).toBe(0)
  })
  test('el cero absoluto no equivale a cobertura completa', () => {
    const s = state(false)
    s.operational_summary = { ...s.operational_summary, coverage_total: 0, coverage_counted: 0,
      coverage_pending: 0, coverage_percent: 0 }
    const a = present(s)
    expect(a?.empty).toBe(true)
    expect(a?.complete).toBe(false)
    expect(a?.homeState).toBe('A1')
    expect(parseFullEnvelope(response(s)).ok).toBe(true)
  })
  test('fail closed sin reloj confiable, tras V7 o al terminar la ronda', () => {
    expect(present(state(), [], new Set(), Date.parse(roundUntil))).toBeNull()
    expect(present(state(), [], new Set(), Date.parse(now), false)).toBeNull()
    expect(projectFullCoverage(state(), session, [], new Set(), Date.parse(now), false, true)).toBeNull()
  })
})
