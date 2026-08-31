import { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, test } from 'bun:test'
import {
  applyCajeroBatchResponse, blockSupersededCajeroBuffer, buildNextCajeroBatch,
  discardLegacyCajeroBuffers, getCajeroBufferKey, readCajeroBuffer,
  readCajeroRecountAttempt, removeCajeroRecountAttempt, saveCajeroRecountAttempt,
  upsertCajeroObservation,
} from '../src/features/solog/cajero/cajero.storage'
import { isCurrentCajeroResponse } from '../src/features/solog/cajero/cajero.session'
import { getSologDifferenceStateClass, getSologDifferenceStateLabel } from '../src/features/solog/labels'
import { normalizeSologError } from '../src/features/solog/errors'
import type { CajeroBatchResponse, CajeroBufferScope, CajeroObservationInput } from '../src/features/solog/cajero/cajero.types'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
const scope: CajeroBufferScope = {
  usuario_id: 'cashier', sede_id: 'site', dispositivo_id: 'device', conteo_id: 'original',
}
const input: CajeroObservationInput = {
  grupo_id: 'group', stock_fisico: 8, contado_at: '2026-08-26T10:00:00Z',
  display: { vista: 'conteo_diario', categoria_id: 'cat', grupo: 'Grupo', categoria: 'Bebidas', stock_teorico: 10, precio: 4 },
}

describe('Motor V3: buffer V4 y recuperación', () => {
  test('el reintento después de expirar mantiene íntegro el payload original', () => {
    const storage = new MemoryStorage()
    upsertCajeroObservation(scope, input, storage)
    const original = buildNextCajeroBatch(scope, 'token', storage)!
    expect(readCajeroBuffer(scope, storage).version).toBe(4)
    // Releer tras expirar no introduce una fecha de envío ni una sesión nueva.
    const restored = buildNextCajeroBatch(scope, 'token', storage)
    expect(restored).toEqual(original)
    expect(Object.keys(restored!.items[0]!).sort()).toEqual(['client_observation_id', 'contado_at', 'grupo_id', 'stock_fisico'])
    expect(buildNextCajeroBatch({ ...scope, conteo_id: 'new' }, 'token', storage)).toBeNull()
  })

  test('SUPERSEDED conserva los datos y bloquea el envío normal y la edición', () => {
    const storage = new MemoryStorage()
    const original = upsertCajeroObservation(scope, input, storage)
    blockSupersededCajeroBuffer(scope, storage)
    expect(readCajeroBuffer(scope, storage).items).toEqual([original])
    expect(() => buildNextCajeroBatch(scope, 'token', storage)).toThrow('SUPERSEDED')
    expect(() => upsertCajeroObservation(scope, { ...input, stock_fisico: 99 }, storage)).toThrow()
    const error = normalizeSologError(new PostgrestError({ code: 'P0001', message: 'SOLOG_EXPIRED_SESSION_SUPERSEDED', details: '', hint: '' }))
    expect(error.code).toBe('SOLOG_EXPIRED_SESSION_SUPERSEDED')
    expect(error.message).toContain('ya no pueden enviarse ni reasignarse')
  })

  test('descarta únicamente buffers legacy, preservando V4 y otras claves', () => {
    const storage = new MemoryStorage()
    upsertCajeroObservation(scope, input, storage)
    for (const version of [1, 2, 3]) storage.setItem('solog.cajero.buffer.v' + version + ':old', '{}')
    storage.setItem('otra.aplicacion', 'keep')
    discardLegacyCajeroBuffers(storage)
    expect(storage.length).toBe(2)
    expect(storage.getItem(getCajeroBufferKey(scope))).not.toBeNull()
    expect(storage.getItem('otra.aplicacion')).toBe('keep')
  })

  test('el límite de 500 no elimina los pendientes del lote siguiente', () => {
    const storage = new MemoryStorage()
    for (let i = 0; i < 501; i++) upsertCajeroObservation(scope, { ...input, grupo_id: 'g' + i }, storage)
    const batch = buildNextCajeroBatch(scope, 'token', storage)!
    expect(batch.items).toHaveLength(500)
    const response: CajeroBatchResponse = {
      ok: true, codigo: 'COUNT_BATCH_SAVED', conteo_id: scope.conteo_id,
      items: batch.items.map((item) => ({
        ...item, detalle_id: item.grupo_id, resultado: 'guardado',
        stock_teorico: 10, diferencia: -2, estado_diferencia: 'Recontar',
      })),
      errores: [], guardados: 500, ya_guardados: 0, rechazados: 0, server_now: input.contado_at,
    }
    applyCajeroBatchResponse(scope, response, storage)
    expect(buildNextCajeroBatch(scope, 'token', storage)!.items).toHaveLength(1)
  })

  test('una respuesta de otra sesión no elimina observaciones', () => {
    const storage = new MemoryStorage()
    const item = upsertCajeroObservation(scope, input, storage)
    expect(() => applyCajeroBatchResponse(scope, { conteo_id: 'other' } as CajeroBatchResponse, storage)).toThrow()
    expect(readCajeroBuffer(scope, storage).items).toEqual([item])
  })
})

describe('Motor V3: reconteo separado y respuestas tardías', () => {
  test('persiste el intento por detalle, mantiene timestamp y físico y nunca lo introduce al batch', () => {
    const storage = new MemoryStorage()
    const original = saveCajeroRecountAttempt(scope, 'detail-1', 8, input.contado_at, storage)
    expect(saveCajeroRecountAttempt(scope, 'detail-1', 99, '2026-08-27T12:00:00Z', storage)).toEqual(original)
    expect(readCajeroRecountAttempt(scope, 'detail-2', storage)).toBeNull()
    expect(readCajeroRecountAttempt({ ...scope, conteo_id: 'other' }, 'detail-1', storage)).toBeNull()
    expect(buildNextCajeroBatch(scope, 'token', storage)).toBeNull()
    removeCajeroRecountAttempt(scope, 'detail-1', storage)
    expect(readCajeroRecountAttempt(scope, 'detail-1', storage)).toBeNull()
  })

  test('rechaza respuestas de una generación anterior y de otro alcance', () => {
    expect(isCurrentCajeroResponse(scope, { ...scope }, 1, 1)).toBe(true)
    expect(isCurrentCajeroResponse(scope, scope, 1, 2)).toBe(false)
    for (const field of ['usuario_id', 'sede_id', 'dispositivo_id', 'conteo_id'] as const) {
      expect(isCurrentCajeroResponse(scope, { ...scope, [field]: 'other' }, 1, 1)).toBe(false)
    }
  })

  test('los cuatro estados exactos mantienen etiqueta y clase normalizada', () => {
    for (const state of ['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'] as const) {
      expect(getSologDifferenceStateLabel(state)).toBe(state)
      expect(getSologDifferenceStateClass(state)).toBe(state.toLowerCase())
    }
  })
})
