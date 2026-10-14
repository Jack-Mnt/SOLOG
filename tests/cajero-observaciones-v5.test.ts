import { describe, expect, test } from 'bun:test'
import { mutateCashierV5, parseCashierV5Mutation, type CashierV4Rpc } from '../src/features/solog/cajero/cajero.v4.api'
import {
  CASHIER_DIFFERENCE_REASONS, hasCashierObservationText, isCashierDifferenceReason,
  validCashierInitialObservation, validCashierRecountObservation,
} from '../src/features/solog/cajero/cajero.observaciones.v5'
import {
  assertSameCashierV5Operation, deserializeCashierV5PreparedBatch,
  prepareCashierV5Batch, serializeCashierV5PreparedBatch,
} from '../src/features/solog/cajero/cajero.v5.batch'
import { cashierV4Ids, cashierV4Mutation, cashierV4Request } from './fixtures/cashier-v4.mjs'

const initial = { motivo_diferencia: 'Transferencia' as const, observacion_diferencia: 'Traslado de unidades' }
const recount = { motivo_diferencia: 'Otro motivo' as const, observacion_reconteo: 'Revisar pérdida' }

function v5Result(action: 'start' | 'save_batch' | 'recount_save_batch' | 'finish') {
  const result = { ...cashierV4Mutation(action), contract_version: 5 }
  if (action === 'save_batch') return {
    ...result, items: [{ ...result.items[0], ...initial }],
  }
  if (action === 'recount_save_batch') return {
    ...result, items: [{ ...result.items[0], motivo_diferencia: 'Otro motivo', observacion_reconteo: 'Resuelto' }],
  }
  return result
}
const scope = {
  operation_id: cashierV4Ids.operation, conteo_id: cashierV4Ids.session,
  expected_groups_revision: 7,
}
const normal = {
  ...cashierV4Request('save_batch').items[0], ...initial,
}
const review = {
  ...cashierV4Request('recount_save_batch').items[0], ...recount,
}

describe('Cajero observaciones V5', () => {
  test('motivos cerrados, sin selección por defecto y trim efectivo', () => {
    expect(CASHIER_DIFFERENCE_REASONS).toHaveLength(5)
    expect(isCashierDifferenceReason('Otro motivo')).toBe(true)
    expect(isCashierDifferenceReason('Robo')).toBe(false)
    expect(hasCashierObservationText('  abc  ')).toBe(true)
    expect(hasCashierObservationText(' \t\n ')).toBe(false)
    expect(validCashierInitialObservation({ motivo_diferencia: null, observacion_diferencia: null })).toBe(true)
    expect(validCashierInitialObservation({ motivo_diferencia: 'Otro motivo', observacion_diferencia: 'a' })).toBe(false)
    expect(validCashierInitialObservation({ motivo_diferencia: 'Otro motivo', observacion_diferencia: 'abc' })).toBe(true)
    expect(validCashierInitialObservation({ motivo_diferencia: null, observacion_diferencia: 'abc' })).toBe(false)
    expect(validCashierRecountObservation({ motivo_diferencia: 'Otro motivo', observacion_reconteo: null })).toBe(true)
    expect(validCashierRecountObservation({ motivo_diferencia: null, observacion_reconteo: 'abc' })).toBe(true)
  })

  test.each(['start', 'save_batch', 'recount_save_batch', 'finish'] as const)('RPC V5 %s usa payload y UUID sin alterarlos', async action => {
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const old = cashierV4Request(action)
    const payload = action === 'save_batch'
      ? { ...old, items: [normal] }
      : action === 'recount_save_batch'
        ? { ...old, items: [review] }
        : old
    const before = structuredClone(payload)
    const call: CashierV4Rpc = async (name, args) => {
      calls.push(structuredClone({ name, args }))
      return { ...v5Result(action), replay: calls.length > 1 }
    }
    const first = await mutateCashierV5(action, payload as never, call)
    const replay = await mutateCashierV5(action, payload as never, call)
    expect(first.contract_version).toBe(5)
    expect(replay.replay).toBe(true)
    expect(calls).toEqual([1, 2].map(() => ({
      name: 'rpc_solog_cashier_mutate_v5', args: { p_action: action, p_payload: before },
    })))
    expect(payload).toEqual(before)
  })

  test('rechaza respuestas V4, campos ausentes y valores incorrectos', () => {
    expect(() => parseCashierV5Mutation(cashierV4Mutation('start'), 'start')).toThrow()
    const valid = v5Result('save_batch')
    expect(() => parseCashierV5Mutation(valid, 'save_batch')).not.toThrow()
    expect(() => parseCashierV5Mutation({
      ...valid, items: [{ ...valid.items[0], observacion_diferencia: null }],
    }, 'save_batch')).toThrow()
    expect(() => parseCashierV5Mutation({
      ...valid, items: [{ ...valid.items[0], motivo_diferencia: 'No permitido' }],
    }, 'save_batch')).toThrow()
    const r = v5Result('recount_save_batch')
    expect(() => parseCashierV5Mutation(r, 'recount_save_batch')).not.toThrow()
    expect(() => parseCashierV5Mutation({
      ...r, items: [{ ...r.items[0], observacion_reconteo: null }],
    }, 'recount_save_batch')).toThrow()
  })

  test('lotes preparados V5 se serializan sin pérdida y son inmutables', () => {
    const prepared = prepareCashierV5Batch('save_batch', [normal], scope)
    const raw = serializeCashierV5PreparedBatch(prepared)
    const restored = deserializeCashierV5PreparedBatch(raw)
    expect(restored).toEqual(prepared)
    expect(restored.items[0]).toEqual(normal)
    assertSameCashierV5Operation(prepared, { ...prepared, status: 'uncertain' })
    expect(() => assertSameCashierV5Operation(prepared, {
      ...prepared, items: [{ ...normal, observacion_diferencia: 'Texto cambiado' }],
    })).toThrow()
    expect(() => assertSameCashierV5Operation(prepared, {
      ...prepared, operation_id: cashierV4Ids.observation,
    })).toThrow()
  })

  test('lotes de reconteo y validación estricta de metadatos', () => {
    const prepared = prepareCashierV5Batch('recount_save_batch', [review], scope)
    expect(deserializeCashierV5PreparedBatch(serializeCashierV5PreparedBatch(prepared))).toEqual(prepared)
    expect(() => prepareCashierV5Batch('save_batch', [{
      ...normal, observacion_diferencia: ' \n  ',
    }], scope)).toThrow()
    expect(() => prepareCashierV5Batch('recount_save_batch', [{
      ...review, observacion_reconteo: 0,
    }] as never, scope)).toThrow()
    expect(() => prepareCashierV5Batch('save_batch', [{
      ...normal, motivo_diferencia: 'Transferencia', observacion_diferencia: 'abc', desconocido: true,
    }] as never, scope)).toThrow()
  })
})
