import { describe, expect, test } from 'bun:test'
import {
  buildNextCajeroBatch,
  readCajeroBuffer,
  readCajeroExpressionDrafts,
  saveCajeroLocalCapture,
  setCajeroExpressionDraft,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBufferScope,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import {
  applyCajeroCalculatorKey,
  evaluateCajeroExpression,
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

function observation(stockFisico: number): CajeroObservationInput {
  return {
    grupo_id: 'group-1',
    stock_fisico: stockFisico,
    contado_at: '2026-08-29T12:00:00.000Z',
    tipo_observacion: 'auto',
    observacion_origen_id: null,
    display: {
      vista: 'categoria',
      categoria_id: 'category-1',
      grupo: 'Grupo 1',
      categoria: 'Bebidas',
      stock_teorico: 10,
      precio: 3.5,
      ultima_diferencia: null,
      motivo_seguimiento: null,
    },
  }
}

describe('calculadora compartida Fase 2', () => {
  test('construye y corrige expresiones únicamente con las teclas permitidas', () => {
    let expression = ''
    for (const key of ['1', '2', '+', '6', '×', '3'] as const) {
      expression = applyCajeroCalculatorKey(expression, key)
    }
    expect(expression).toBe('12 + 6 × 3')
    expect(evaluateCajeroExpression(expression)).toEqual({
      status: 'valid',
      value: 30,
    })
    expect(applyCajeroCalculatorKey(expression, 'backspace')).toBe('12 + 6 × ')
    expect(applyCajeroCalculatorKey(expression, 'clear')).toBe('')
    expect(applyCajeroCalculatorKey('', '+')).toBe('')
  })

  test('conserva una expresión vacía explícita al usar C', () => {
    const storage = new MemoryStorage()
    setCajeroExpressionDraft(scope, 'group-1', '', storage)
    expect(readCajeroExpressionDrafts(scope, storage).items).toEqual([
      { grupo_id: 'group-1', expresion: '' },
    ])
  })
})

describe('Guardar local Fase 2', () => {
  test('actualiza conteo y expresión sin cambiar UUID ni ampliar el payload', () => {
    const storage = new MemoryStorage()
    const first = saveCajeroLocalCapture(
      scope,
      observation(8),
      '4 + 4',
      storage,
    )
    const corrected = saveCajeroLocalCapture(
      scope,
      observation(12),
      '6 × 2',
      storage,
    )

    expect(corrected.client_observation_id).toBe(first.client_observation_id)
    expect(readCajeroBuffer(scope, storage).items[0]?.stock_fisico).toBe(12)
    expect(readCajeroExpressionDrafts(scope, storage).items[0]?.expresion).toBe(
      '6 × 2',
    )
    const payload = buildNextCajeroBatch(scope, 'device-token', storage)
    expect(payload?.items[0]).not.toHaveProperty('expresion')
  })

  test('el modal y la calculadora no importan API ni ejecutan envíos', async () => {
    const files = await Promise.all([
      Bun.file('src/features/solog/cajero/cajero.captura.dialog.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.calculadora.tsx').text(),
    ])
    const source = files.join('\n')
    expect(source).not.toContain('cajero.api')
    expect(source).not.toContain('supabase')
    expect(source).not.toContain('saveCajeroBatch')
    expect(source).not.toContain('sendPending')
  })
})
