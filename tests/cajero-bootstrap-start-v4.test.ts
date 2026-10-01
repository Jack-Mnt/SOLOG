import { describe, expect, test } from 'bun:test'
import { SologApiError } from '../src/features/solog/errors'
import { parseCashierV4Bootstrap, parseCashierV4Mutation } from '../src/features/solog/cajero/cajero.v4.api'
import { cashierV4Bootstrap, cashierV4Ids as ids, cashierV4Mutation } from './fixtures/cashier-v4.mjs'

describe('Cajero V4: bootstrap y start', () => {
  test('summary sin sesión contiene basis temporal, KPI y next_action', () => {
    const b = parseCashierV4Bootstrap(cashierV4Bootstrap())
    expect(b.contract_version).toBe(4)
    expect(b.panel_state).toBeNull()
    expect(b.pre_session_summary?.basis.ronda).toBe(1)
    expect(b.pre_session_summary?.kpis.coverage_total).toBe(4)
    expect(b.pre_session_summary?.next_action).toBe('review')
    expect(b.pre_session_summary?.basis).not.toHaveProperty('groups_revision')
  })
  test('bootstrap rechaza contract_version 3', () => {
    expect(() => parseCashierV4Bootstrap({ ...cashierV4Bootstrap(), contract_version: 3 })).toThrow(SologApiError)
  })
  test('sesión activa conserva panel completo y summary nulo', () => {
    const b = parseCashierV4Bootstrap(cashierV4Bootstrap('active'))
    expect(b.panel_state?.session.id).toBe(ids.session)
    expect(b.pre_session_summary).toBeNull()
    expect(b.session_capability.mode).toBe('active')
  })
  test.each(['recovery', 'active_recovery'])('bootstrap %s conserva recovery_sessions', (kind) => {
    const b = parseCashierV4Bootstrap(cashierV4Bootstrap(kind))
    expect(b.recovery_sessions).toHaveLength(1)
    expect(b.recovery_sessions[0].id).toBe(ids.recovery)
    expect(b.recovery_sessions[0].session_capability).toMatchObject({ mode: 'recovery', estado: 'recovery', capture_allowed: false, pending_delivery_allowed: true })
    expect(b.panel_state === null).toBe(kind === 'recovery')
  })
  test('summary nulo no implica ausencia de recovery', () => {
    const value = cashierV4Bootstrap('recovery')
    value.pre_session_summary = null
    expect(parseCashierV4Bootstrap(value).recovery_sessions).toHaveLength(1)
  })
  test('sin dispositivo autorizado permite bootstrap sin datos operativos', () => {
    const b = parseCashierV4Bootstrap(cashierV4Bootstrap('unauthorized'))
    expect(b.panel_state).toBeNull()
    expect(b.stock.snapshot_id).toBeNull()
    expect(b.start_capability.allowed).toBe(false)
  })
  test.each(['recovery_sessions', 'panel_state', 'pre_session_summary', 'session_capability', 'server_now', 'revisions'])('bootstrap exige %s incluso si su valor puede ser nulo', (field) => {
    const input = cashierV4Bootstrap() as Record<string, unknown>
    delete input[field]
    expect(() => parseCashierV4Bootstrap(input)).toThrow(SologApiError)
  })
  test.each(['id', 'iniciado_at', 'expira_at', 'recovery_until', 'snapshot_referencia_id', 'ronda', 'turno', 'session_capability'])('recovery exige %s', (field) => {
    const input = cashierV4Bootstrap('recovery')
    delete (input.recovery_sessions[0] as Record<string, unknown>)[field]
    expect(() => parseCashierV4Bootstrap(input)).toThrow(SologApiError)
  })
  test('rechaza recovery duplicado, captura en recovery e identidad de panel ajena', () => {
    const input = cashierV4Bootstrap('recovery')
    input.recovery_sessions.push(structuredClone(input.recovery_sessions[0]))
    expect(() => parseCashierV4Bootstrap(input)).toThrow(SologApiError)
    const capture = cashierV4Bootstrap('recovery')
    capture.recovery_sessions[0].session_capability.capture_allowed = true
    expect(() => parseCashierV4Bootstrap(capture)).toThrow(SologApiError)
    const foreign = cashierV4Bootstrap('active')
    foreign.panel_state.session.usuario_id = ids.site
    expect(() => parseCashierV4Bootstrap(foreign)).toThrow(SologApiError)
  })
  test('start exige conteo_id y su igualdad con session.id', () => {
    const input = cashierV4Mutation('start')
    const parsed = parseCashierV4Mutation(input, 'start')
    expect(parsed.conteo_id).toBe(parsed.panel_state.session.id)
    expect(() => parseCashierV4Mutation({ ...input, conteo_id: ids.recovery }, 'start')).toThrow(SologApiError)
    const missing = { ...input } as Record<string, unknown>
    delete missing.conteo_id
    expect(() => parseCashierV4Mutation(missing, 'start')).toThrow(SologApiError)
  })
  test('start exige panel y stock congelados completos', () => {
    const input = cashierV4Mutation('start')
    expect(() => parseCashierV4Mutation({ ...input, panel_state: null }, 'start')).toThrow(SologApiError)
    expect(() => parseCashierV4Mutation({ ...input, stock: { ...input.stock, snapshot_id: null } }, 'start')).toThrow(SologApiError)
    expect(() => parseCashierV4Mutation({ ...input, stock: { ...input.stock, snapshot_id: ids.recovery } }, 'start')).toThrow(SologApiError)
  })
  test('start devuelve su next_action y conserva replay sin modificar entrada', () => {
    const input = { ...cashierV4Mutation('start', { ronda: 2, turno: 'night', next_action: 'daily' }), replay: true }
    const before = structuredClone(input)
    const result = parseCashierV4Mutation(input, 'start')
    expect(result.panel_state.next_action).toBe('daily')
    expect(result.panel_state.basis.ronda).toBe(2)
    expect(result.replay).toBe(true)
    expect(input).toEqual(before)
  })
})
