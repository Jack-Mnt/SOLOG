import { describe, expect, test } from 'bun:test'
import {
  readCajeroBuffer,
  removeCajeroObservation,
  upsertCajeroObservation,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBufferScope,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import {
  calculateDifference,
  calculateValuation,
  formatCajeroCurrency,
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

function observation(stockFisico: number, contadoAt: string): CajeroObservationInput {
  return {
    grupo_id: 'group-1',
    stock_fisico: stockFisico,
    contado_at: contadoAt,
    display: {
      vista: 'categoria',
      categoria_id: 'category-1',
      grupo: 'Grupo 1',
      categoria: 'Bebidas',
      stock_teorico: 10,
      precio: 3.5,
    },
  }
}

describe('captura base Cajero V3', () => {
  test('actualiza un borrador válido sin duplicarlo ni cambiar su UUID', () => {
    const storage = new MemoryStorage()
    const first = upsertCajeroObservation(
      scope,
      observation(1, '2026-08-26T10:04:00.000Z'),
      storage,
    )
    const updated = upsertCajeroObservation(
      scope,
      observation(18, '2026-08-26T10:05:00.000Z'),
      storage,
    )
    const restored = readCajeroBuffer(scope, storage)

    expect(restored.items).toHaveLength(1)
    expect(updated.client_observation_id).toBe(first.client_observation_id)
    expect(updated.stock_fisico).toBe(18)
    expect(updated.contado_at).toBe('2026-08-26T10:04:00.000Z')
  })

  test('retira el borrador cuando el campo vuelve a quedar vacío', () => {
    const storage = new MemoryStorage()
    upsertCajeroObservation(
      scope,
      observation(8, '2026-08-26T10:04:00.000Z'),
      storage,
    )
    removeCajeroObservation(scope, 'group-1', storage)
    expect(readCajeroBuffer(scope, storage).items).toHaveLength(0)
  })

  test('solo acepta enteros físicos mayores o iguales a cero', () => {
    expect(isValidPhysicalCount(0)).toBe(true)
    expect(isValidPhysicalCount(18)).toBe(true)
    expect(isValidPhysicalCount(-1)).toBe(false)
    expect(isValidPhysicalCount(1.5)).toBe(false)
  })

  test('previsualiza diferencia y valorización sin ocultar stock TumiSoft negativo', () => {
    const difference = calculateDifference(0, -3)
    expect(difference).toBe(3)
    expect(calculateValuation(difference, 4)).toBe(12)
    expect(formatCajeroCurrency(12)).toContain('12.00')
  })
})
