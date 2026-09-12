import { describe, expect, test } from 'bun:test'
import { cashierV3Bootstrap, cashierV3Mutation } from './fixtures/cashier-v3.mjs'
import {
  fetchCashierV3Bootstrap, mutateCashierV3, parseCashierV3Bootstrap, parseCashierV3Mutation,
} from '../src/features/solog/cajero/cajero.v3.api'

describe('Cajero V3 contrato frontend', () => {
  test('acepta bootstrap compacto autorizado sin panel ni session_state', () => {
    const input = cashierV3Bootstrap('pre_session')
    const result = parseCashierV3Bootstrap(input)
    expect(result.contract_version).toBe(3)
    expect(result.panel_state).toBeNull()
    expect(result.pre_session_summary?.stock_types.zero).toEqual({ total: 1, covered: 1 })
    expect('session_state' in result).toBe(false)
  })

  test('acepta dispositivo no autorizado sin panel ni resumen', () => {
    const result = parseCashierV3Bootstrap(cashierV3Bootstrap('unauthorized'))
    expect(result.device.autorizado).toBe(false)
    expect(result.start_capability).toEqual({ allowed: false, reason: 'SOLOG_DEVICE_UNAUTHORIZED' })
    expect(result.panel_state).toBeNull()
    expect(result.pre_session_summary).toBeNull()
  })

  test('acepta sesión activa y recovery con una sola copia del panel', () => {
    for (const kind of ['session', 'recovery']) {
      const result = parseCashierV3Bootstrap(cashierV3Bootstrap(kind))
      expect(result.panel_state?.source).toBe('session')
      expect(result.panel_state?.frozen).toBe(true)
      expect(result.pre_session_summary).toBeNull()
      expect(result.session_capability.mode).toBe(kind === 'session' ? 'active' : 'recovery')
    }
  })

  test('rechaza versión, session_state y combinaciones incoherentes', () => {
    expect(() => parseCashierV3Bootstrap({ ...cashierV3Bootstrap(), contract_version: 2 })).toThrow()
    expect(() => parseCashierV3Bootstrap({ ...cashierV3Bootstrap(), session_state: {} })).toThrow()
    expect(() => parseCashierV3Bootstrap({ ...cashierV3Bootstrap(), pre_session_summary: null })).toThrow()
    const unauthorized = cashierV3Bootstrap('unauthorized')
    expect(() => parseCashierV3Bootstrap({ ...unauthorized, pre_session_summary: cashierV3Bootstrap().pre_session_summary })).toThrow()
  })

  test('valida formas discriminadas de start, save, recount y finish', () => {
    const start = parseCashierV3Mutation(cashierV3Mutation('start'), 'start')
    const save = parseCashierV3Mutation(cashierV3Mutation('save_batch'), 'save_batch')
    const recount = parseCashierV3Mutation(cashierV3Mutation('recount_save_batch'), 'recount_save_batch')
    const finish = parseCashierV3Mutation(cashierV3Mutation('finish'), 'finish')
    expect(start.panel_state.session.id).toBe('session-1')
    expect(save.panel_delta.count_queue_remove).toEqual(['group-1'])
    expect(recount.items[0].estado_diferencia).toBe('Coincide')
    expect(finish.status).toBe('finalizado')
  })

  test('rechaza revisiones y timestamps inválidos', () => {
    const stale = cashierV3Bootstrap(); stale.revisions.operational = -1
    expect(() => parseCashierV3Bootstrap(stale)).toThrow()
    const save = cashierV3Mutation('save_batch'); save.items[0].contado_at = 'invalid'
    expect(() => parseCashierV3Mutation(save, 'save_batch')).toThrow()
  })

  test('save/recount/finish rechazan state completo o forma de otra acción', () => {
    expect(() => parseCashierV3Mutation({ ...cashierV3Mutation('save_batch'), state: {} }, 'save_batch')).toThrow()
    expect(() => parseCashierV3Mutation({ ...cashierV3Mutation('recount_save_batch'), panel_state: {} }, 'recount_save_batch')).toThrow()
    expect(() => parseCashierV3Mutation(cashierV3Mutation('finish'), 'save_batch')).toThrow()
    expect(() => parseCashierV3Mutation({ ...cashierV3Mutation('finish'), panel_delta: {} }, 'finish')).toThrow()
  })

  test('transporte usa únicamente RPC V3 y conserva argumentos', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const rpc = async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return name.includes('bootstrap') ? cashierV3Bootstrap() : cashierV3Mutation('save_batch')
    }
    await fetchCashierV3Bootstrap('device-token', rpc)
    await mutateCashierV3('save_batch', { operation_id: 'operation-1', items: [] }, rpc)
    expect(calls).toEqual([
      { name: 'rpc_solog_cashier_bootstrap_v3', args: { p_payload: { device_token: 'device-token' } } },
      { name: 'rpc_solog_cashier_mutate_v3', args: { p_action: 'save_batch', p_payload: { operation_id: 'operation-1', items: [] } } },
    ])
  })
})
