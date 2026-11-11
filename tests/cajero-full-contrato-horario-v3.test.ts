import { describe, expect, test } from 'bun:test'
import {
  parseFullEnvelope, type CashierStartOfferV3, type FullEnvelope, type FullState,
} from '../src/features/solog/cajero/full.contract'

const uuid = (suffix: string) => `12345678-1234-4123-8123-${suffix}`
const requestId = uuid('1234567890ab')
const snapshotId = uuid('1234567890ac')
const serverNow = '2026-11-11T16:05:00.000Z'
const cycleStartedAt = '2026-11-11T15:59:00.000Z'
const newCapture = '2026-11-11T15:59:30.000Z'
const oldCapture = '2026-11-11T14:59:30.000Z'

const offer = (overrides: Partial<CashierStartOfferV3> = {}): CashierStartOfferV3 => ({
  policy_version: 3,
  cycle_started_at: cycleStartedAt,
  status: 'new',
  snapshot_id: snapshotId,
  requires_confirmation: false,
  can_start: true,
  capture_ends_at: '2026-11-11T17:00:00.000Z',
  block_reason: null,
  ...overrides,
})
function makeBootstrap(startOffer: CashierStartOfferV3 | undefined = offer()): FullEnvelope {
  const data: FullState = {
    timezone: 'America/Lima',
    site: { id: uuid('1234567890ad'), nombre: 'Cutervo' },
    stock: {
      snapshot_id: snapshotId,
      snapshot_captured_at: newCapture,
      snapshot_confirmed_at: '2026-11-11T16:00:00.000Z',
      stock_expires_at: '2026-11-11T17:59:30.000Z',
      is_fresh: true, is_fallback: false, catalog_version: 1, groups_revision: 1,
    },
    session: null, recovery_sessions: [], groups: [],
    operational_summary: {
      basis: {
        coverage_round: 2,
        round_starts_at: '2026-11-11T00:00:00.000Z',
        round_ends_at: '2026-11-12T00:00:00.000Z',
      },
      coverage_total: 0, coverage_counted: 0, coverage_pending: 0, coverage_percent: 0,
      review_pending: 0, daily_pending: 0, next_action: 'none',
    },
    confirmed_observation_ids: [], recovery_manifests: [],
    capabilities: { can_start_session: true, can_capture_in_current_session: false, block_reason: null },
    ...(startOffer === undefined ? {} : { start_offer: startOffer }),
  }
  return {
    ok: true, code: 'CASHIER_STATE', contract_version: 2, request_id: requestId,
    retryable: false, server_now: serverNow, data,
  }
}
function successState(response: FullEnvelope): FullState {
  const parsed = parseFullEnvelope(response)
  expect(parsed.ok).toBe(true)
  return parsed.data as FullState
}
function corrupted(modify: (response: FullEnvelope) => void) {
  const response = structuredClone(makeBootstrap())
  modify(response)
  expect(() => parseFullEnvelope(response)).toThrow('FULL_INVALID_RESPONSE')
}

describe('SOLOG Full Fase 1 — contrato horario V6/V7 requerido', () => {
  test('valida una oferta new para la generación HH:59 y conserva contract_version 2', () => {
    const state = successState(makeBootstrap())
    expect(state.start_offer).toEqual(offer())
    expect(state.start_offer?.status).toBe('new')
  })

  test('valida fallback explícito, sin confundirlo con stock.is_fallback legacy', () => {
    const response = makeBootstrap(offer({
      status: 'fallback', requires_confirmation: true,
      capture_ends_at: '2026-11-11T16:59:30.000Z',
    }))
    const state = response.data as FullState
    state.stock!.snapshot_captured_at = oldCapture
    state.stock!.stock_expires_at = '2026-11-11T16:59:30.000Z'
    state.stock!.is_fallback = false // No se infiere el modo V3 de esta bandera legacy.
    expect(successState(response).start_offer?.status).toBe('fallback')
  })

  test('valida indisponibilidad autoritativa sin snapshot seleccionado', () => {
    const state = successState(makeBootstrap(offer({
      status: 'unavailable', snapshot_id: null, capture_ends_at: null,
      requires_confirmation: false, can_start: false, block_reason: 'STOCK_EXPIRED',
    })))
    expect(state.start_offer?.can_start).toBe(false)
    expect(state.start_offer?.block_reason).toBe('STOCK_EXPIRED')
  })

  test('rechaza status, booleanos y datos incompletos en la oferta V3', () => {
    corrupted(r => { (r.data as FullState).start_offer!.status = 'waiting' as 'new' })
    corrupted(r => { (r.data as FullState).start_offer!.can_start = 'true' as unknown as boolean })
    corrupted(r => { (r.data as FullState).start_offer!.cycle_started_at = '2026-11-11T15:58:00.000Z' })
    corrupted(r => { (r.data as FullState).start_offer!.cycle_started_at = 'no-date' })
    corrupted(r => { (r.data as FullState).start_offer!.policy_version = 2 as 3 })
    corrupted(r => { (r.data as FullState).start_offer!.can_start = undefined as unknown as boolean })
  })

  test('rechaza referencias o modalidades inconsistentes sin autorizarlas localmente', () => {
    corrupted(r => { (r.data as FullState).start_offer!.snapshot_id = uuid('1234567890ee') })
    corrupted(r => { (r.data as FullState).start_offer!.snapshot_id = null })
    corrupted(r => { (r.data as FullState).start_offer!.requires_confirmation = true })
    corrupted(r => { (r.data as FullState).start_offer!.capture_ends_at = serverNow })
    corrupted(r => { (r.data as FullState).start_offer!.capture_ends_at = '2026-11-11T18:00:00.000Z' })
    corrupted(r => { (r.data as FullState).start_offer!.block_reason = 'STOCK_EXPIRED' })
    corrupted(r => { (r.data as FullState).stock!.snapshot_captured_at = oldCapture })
    corrupted(r => { (r.data as FullState).stock!.is_fresh = false })
  })

  test('no permite unavailable con snapshot, confirmación o causa nula', () => {
    const base = offer({
      status: 'unavailable', snapshot_id: null, capture_ends_at: null,
      requires_confirmation: false, can_start: false, block_reason: 'START_WINDOW_CLOSED',
    })
    const a = makeBootstrap(base)
    expect(successState(a).start_offer?.status).toBe('unavailable')
    corrupted(r => { (r.data as FullState).start_offer = { ...base, snapshot_id: snapshotId } })
    corrupted(r => { (r.data as FullState).start_offer = { ...base, requires_confirmation: true } })
    corrupted(r => { (r.data as FullState).start_offer = { ...base, block_reason: null } })
  })

  test('valida errores de V7 y conserva diagnóstico del ítem conflictivo', () => {
    const error: FullEnvelope = {
      ok: false, code: 'NORMAL_COUNT_ALREADY_IN_SHIFT', contract_version: 2,
      request_id: requestId, retryable: false, server_now: serverNow,
      action_required: 'manual_review', data: null,
      errors: [{
        code: 'NORMAL_COUNT_ALREADY_IN_SHIFT',
        message: 'Solicitud no confirmada.',
        field_path: 'p_payload.items[3]',
      }],
      errors_total: 1, errors_truncated: false,
    }
    const parsed = parseFullEnvelope(error)
    expect(parsed.action_required).toBe('manual_review')
    expect(parsed.errors?.[0].field_path).toBe('p_payload.items[3]')
    expect(parsed.retryable).toBe(false)
    expect(parseFullEnvelope({ ...error, code: 'START_CAPTURE_TOO_SHORT', action_required: 'wait' })
      .action_required).toBe('wait')
  })

  test('rechaza diagnósticos y acciones inválidos, sin inventar un índice de batch', () => {
    const failure: FullEnvelope = {
      ok: false, code: 'START_WINDOW_CLOSED', contract_version: 2,
      request_id: requestId, retryable: false, server_now: serverNow,
      action_required: 'wait', data: null,
      errors: [{ code: 'START_WINDOW_CLOSED', message: 'Ventana cerrada', field_path: '' }],
    }
    expect(parseFullEnvelope(failure).errors?.[0].field_path).toBe('')
    expect(() => parseFullEnvelope({ ...failure, action_required: 'ignore' })).toThrow('FULL_INVALID_RESPONSE')
    expect(() => parseFullEnvelope({ ...failure, errors: [{ code: 10, message: '', field_path: null }] }))
      .toThrow('FULL_INVALID_RESPONSE')
  })

  test('conserva fixtures históricas sin start_offer durante la transición hacia Fase 2', () => {
    const state = successState(makeBootstrap(undefined))
    expect(state.start_offer).toBeUndefined()
    // Phase 2 rechazará este estado al PREPARAR un start, no al leer journal V2 histórico.
  })
})
