import { describe, expect, test } from 'bun:test'
import { fetchCashierV4Bootstrap, mutateCashierV4, type CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import type { CashierV4RequestFor } from '../src/features/solog/cajero/cajero.v4'
import { cashierV4Bootstrap, cashierV4DeviceToken, cashierV4Mutation, cashierV4Request } from './fixtures/cashier-v4.mjs'

describe('Cajero V4: transporte', () => {
  test('bootstrap usa exclusivamente RPC V4 y p_payload exacto', async () => {
    const calls: unknown[] = []
    const payload = { device_token: cashierV4DeviceToken }
    const call: CashierV4Rpc = async (name, args) => { calls.push({ name, args }); return cashierV4Bootstrap() }
    expect((await fetchCashierV4Bootstrap(payload, call)).contract_version).toBe(4)
    expect(calls).toEqual([{ name: 'rpc_solog_cashier_bootstrap_v4', args: { p_payload: payload } }])
  })
  test.each(['start', 'save_batch', 'recount_save_batch', 'finish'] as const)('%s conserva request, UUID y timestamps entre llamadas', async (action) => {
    const calls: unknown[] = []
    const payload = cashierV4Request(action) as CashierV4RequestFor<typeof action>
    const before = structuredClone(payload)
    const call: CashierV4Rpc = async (name, args) => {
      calls.push(structuredClone({ name, args }))
      return { ...cashierV4Mutation(action), replay: calls.length > 1 }
    }
    expect((await mutateCashierV4(action, payload, call)).action).toBe(action)
    expect((await mutateCashierV4(action, payload, call)).replay).toBe(true)
    expect(calls).toEqual([1, 2].map(() => ({ name: 'rpc_solog_cashier_mutate_v4', args: { p_action: action, p_payload: before } })))
    expect(payload).toEqual(before)
    expect(Object.keys(payload).sort()).toEqual((action === 'start'
      ? ['operation_id', 'device_token']
      : ['operation_id', 'device_token', 'conteo_id', 'expected_groups_revision', ...(action === 'finish' ? [] : ['items'])]).sort())
    if (action !== 'start') expect(payload).toHaveProperty('expected_groups_revision', 7)
    if ('items' in payload) expect(Object.keys(payload.items[0]).sort()).toEqual((action === 'save_batch'
      ? ['client_observation_id', 'grupo_id', 'stock_fisico', 'contado_at']
      : ['detalle_id', 'stock_fisico', 'contado_at']).sort())
  })
  test('un fallo de transporte no provoca fallback ni retry automático', async () => {
    let calls = 0
    const error = new Error('respuesta incierta')
    const call: CashierV4Rpc = async () => { calls++; throw error }
    await expect(fetchCashierV4Bootstrap({ device_token: cashierV4DeviceToken }, call)).rejects.toBe(error)
    const payload = cashierV4Request('start') as CashierV4RequestFor<'start'>
    await expect(mutateCashierV4('start', payload, call)).rejects.toBe(error)
    expect(calls).toBe(2)
  })
  test('una respuesta V3 nunca se acepta en el transporte V4', async () => {
    const call: CashierV4Rpc = async () => ({ ...cashierV4Bootstrap(), contract_version: 3 })
    await expect(fetchCashierV4Bootstrap({ device_token: cashierV4DeviceToken }, call)).rejects.toThrow()
  })
})
