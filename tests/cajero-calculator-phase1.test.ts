import { describe, expect, test } from 'bun:test'
import {
  applyCajeroBatchResponse,
  readCajeroExpressionDrafts,
  setCajeroExpressionDraft,
  upsertCajeroObservation,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBatchResponse,
  CajeroBufferScope,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import {
  evaluateCajeroExpression,
  isValidPhysicalCount,
} from '../src/features/solog/cajero/cajero.utils'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const scope: CajeroBufferScope = {
  usuario_id: 'user-1',
  sede_id: 'site-1',
  dispositivo_id: 'device-1',
  conteo_id: 'count-1',
}

function observation(grupoId: string): CajeroObservationInput {
  return {
    grupo_id: grupoId,
    stock_fisico: 8,
    contado_at: '2026-08-29T10:00:00.000Z',
    display: {
      vista: 'categoria',
      categoria_id: 'category-1',
      grupo: `Grupo ${grupoId}`,
      categoria: 'Bebidas',
      stock_teorico: 10,
      precio: 3.5,
    },
  }
}

describe('calculadora Cajero Fase 1', () => {
  test('evalúa suma y multiplicación con resultado entero válido', () => {
    expect(evaluateCajeroExpression('12 × 6 + 3')).toEqual({
      status: 'valid',
      value: 75,
    })
    expect(evaluateCajeroExpression('0')).toEqual({
      status: 'valid',
      value: 0,
    })
    expect(evaluateCajeroExpression('99999')).toEqual({
      status: 'valid',
      value: 99_999,
    })
  })

  test('distingue expresión vacía, incompleta y cantidad demasiado alta', () => {
    expect(evaluateCajeroExpression('')).toEqual({ status: 'empty', value: null })
    expect(evaluateCajeroExpression('12 +')).toEqual({
      status: 'incomplete',
      value: null,
    })
    expect(evaluateCajeroExpression('8 + 7 ×')).toEqual({
      status: 'incomplete',
      value: null,
    })
    expect(evaluateCajeroExpression('100000')).toEqual({
      status: 'too_high',
      value: null,
    })
    expect(isValidPhysicalCount(100_000)).toBe(false)
  })
})

describe('expresiones locales Cajero Fase 1', () => {
  test('aísla expresiones por usuario, sede, dispositivo y conteo', () => {
    const storage = new MemoryStorage()
    setCajeroExpressionDraft(scope, 'group-1', '4 × 2', storage)

    expect(readCajeroExpressionDrafts(scope, storage).items).toEqual([
      { grupo_id: 'group-1', expresion: '4 × 2' },
    ])
    for (const field of [
      'usuario_id',
      'sede_id',
      'dispositivo_id',
      'conteo_id',
    ] as const) {
      const incompatible = { ...scope, [field]: `${scope[field]}-other` }
      expect(readCajeroExpressionDrafts(incompatible, storage).items).toEqual([])
    }
  })

  test('limpia solo la expresión confirmada y conserva el fallo parcial', () => {
    const storage = new MemoryStorage()
    const confirmed = upsertCajeroObservation(scope, observation('group-1'), storage)
    const rejected = upsertCajeroObservation(scope, observation('group-2'), storage)
    setCajeroExpressionDraft(scope, 'group-1', '4 + 4', storage)
    setCajeroExpressionDraft(scope, 'group-2', '5 + 3', storage)

    const response: CajeroBatchResponse = {
      ok: false,
      codigo: 'COUNT_BATCH_PARTIAL',
      conteo_id: scope.conteo_id,
      items: [{
        client_observation_id: confirmed.client_observation_id,
        resultado: 'guardado',
        detalle_id: 'detail-1',
        grupo_id: 'group-1',
        stock_teorico: 10,
        stock_fisico: 8,
        diferencia: -2,
        estado_diferencia: 'Recontar',
        contado_at: '2026-08-29T10:00:00.000Z',
      }],
      errores: [{
        client_observation_id: rejected.client_observation_id,
        grupo_id: 'group-2',
        codigo: 'SOLOG_GROUP_NOT_REQUIRED',
      }],
      guardados: 1,
      ya_guardados: 0,
      rechazados: 1,
      server_now: '2026-08-29T10:01:00.000Z',
    }

    applyCajeroBatchResponse(scope, response, storage)

    expect(readCajeroExpressionDrafts(scope, storage).items).toEqual([
      { grupo_id: 'group-2', expresion: '5 + 3' },
    ])
  })

})
