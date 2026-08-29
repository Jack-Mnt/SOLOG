import { describe, expect, test } from 'bun:test'
import {
  applyCajeroBatchResponse,
  buildNextCajeroBatch,
  enqueueCajeroObservation,
  getCajeroBufferKey,
  readCajeroBuffer,
  readCajeroExpressionDrafts,
  setCajeroExpressionDraft,
  shouldFlushCajeroBufferImmediately,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBatchResponse,
  CajeroBufferScope,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import {
  calculateDifference,
  calculateValuation,
  getFollowupReasonLabel,
} from '../src/features/solog/cajero/cajero.utils'

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const scope: CajeroBufferScope = {
  usuario_id: 'user-1',
  sede_id: 'site-1',
  dispositivo_id: 'device-1',
  conteo_id: 'count-1',
}

function observation(
  grupoId: string,
  overrides: Partial<CajeroObservationInput> = {},
): CajeroObservationInput {
  return {
    grupo_id: grupoId,
    stock_fisico: 8,
    contado_at: '2026-08-26T10:04:00-05:00',
    tipo_observacion: 'auto',
    observacion_origen_id: null,
    display: {
      vista: 'categoria',
      categoria_id: 'category-1',
      grupo: `Grupo ${grupoId}`,
      categoria: 'Bebidas',
      stock_teorico: 10,
      precio: 3.5,
      ultima_diferencia: null,
      motivo_seguimiento: null,
    },
    ...overrides,
  }
}

function response(
  conteoId: string,
  savedId: string,
  rejectedId: string,
): CajeroBatchResponse {
  return {
    ok: false,
    codigo: 'COUNT_BATCH_PARTIAL',
    conteo_id: conteoId,
    items: [
      {
        client_observation_id: savedId,
        resultado: 'guardado',
        detalle_id: 'detail-1',
        grupo_id: 'group-1',
        tipo_observacion: 'base',
        stock_teorico: 10,
        stock_fisico: 8,
        diferencia: -2,
        precio: 3.5,
        valor_diferencia: -7,
        estado_diferencia: 'pendiente',
        diferencia_confirmada: null,
        contado_at: '2026-08-26T10:04:00-05:00',
      },
    ],
    errores: [
      {
        client_observation_id: rejectedId,
        grupo_id: 'group-2',
        codigo: 'SOLOG_GROUP_NOT_REQUIRED',
      },
    ],
    guardados: 1,
    ya_guardados: 0,
    rechazados: 1,
    sesion_expirada: false,
    stock_actualizado: false,
    requiere_nueva_sesion: false,
    server_now: '2026-08-26T10:05:00-05:00',
  }
}

describe('cajero.storage V3', () => {
  test('aísla el buffer por usuario, sede, dispositivo y conteo', () => {
    const storage = new MemoryStorage()
    enqueueCajeroObservation(scope, observation('group-1'), storage)

    expect(readCajeroBuffer(scope, storage).items).toHaveLength(1)
    for (const field of [
      'usuario_id',
      'sede_id',
      'dispositivo_id',
      'conteo_id',
    ] as const) {
      const incompatible = { ...scope, [field]: `${scope[field]}-other` }
      expect(readCajeroBuffer(incompatible, storage).items).toHaveLength(0)
      expect(getCajeroBufferKey(incompatible)).not.toBe(
        getCajeroBufferKey(scope),
      )
    }
  })

  test('conserva el client_observation_id al restaurar', () => {
    const storage = new MemoryStorage()
    const saved = enqueueCajeroObservation(
      scope,
      observation('group-1'),
      storage,
    )

    expect(readCajeroBuffer(scope, storage).items[0]?.client_observation_id).toBe(
      saved.client_observation_id,
    )
  })

  test('genera un lote mixto sin campos de vista', () => {
    const storage = new MemoryStorage()
    enqueueCajeroObservation(scope, observation('group-1'), storage)
    enqueueCajeroObservation(
      scope,
      observation('group-2', {
        tipo_observacion: 'reconteo',
        observacion_origen_id: '4f3e43cc-2e6d-4cc5-bf9b-50bb58610417',
        display: {
          ...observation('group-2').display,
          vista: 'revisar',
          categoria_id: null,
          motivo_seguimiento: 'conteos_inconsistentes',
        },
      }),
      storage,
    )

    const batch = buildNextCajeroBatch(scope, 'device-token', storage)
    expect(batch?.items).toHaveLength(2)
    expect(batch?.items.map((item) => item.tipo_observacion)).toEqual([
      'auto',
      'reconteo',
    ])
    expect(batch).not.toHaveProperty('vista')
  })

  test('conserva solo rechazados después de una respuesta parcial', () => {
    const storage = new MemoryStorage()
    const saved = enqueueCajeroObservation(
      scope,
      observation('group-1'),
      storage,
    )
    const rejected = enqueueCajeroObservation(
      scope,
      observation('group-2'),
      storage,
    )

    const applied = applyCajeroBatchResponse(
      scope,
      response(
        scope.conteo_id,
        saved.client_observation_id,
        rejected.client_observation_id,
      ),
      storage,
    )

    expect(applied.confirmedIds).toEqual([saved.client_observation_id])
    expect(applied.remaining.items).toHaveLength(1)
    expect(applied.remaining.items[0]?.client_observation_id).toBe(
      rejected.client_observation_id,
    )
    expect(applied.remaining.items[0]?.error?.codigo).toBe(
      'SOLOG_GROUP_NOT_REQUIRED',
    )
  })

  test('elimina una observación confirmada como ya_guardado', () => {
    const storage = new MemoryStorage()
    const pending = enqueueCajeroObservation(
      scope,
      observation('group-1'),
      storage,
    )
    setCajeroExpressionDraft(scope, 'group-1', '4 + 4', storage)
    const duplicate = response(
      scope.conteo_id,
      pending.client_observation_id,
      'unused-rejected-id',
    )
    duplicate.ok = true
    duplicate.codigo = 'COUNT_BATCH_SAVED'
    const duplicateItem = duplicate.items[0]
    if (!duplicateItem) throw new Error('Falta el item duplicado de prueba.')
    duplicateItem.resultado = 'ya_guardado'
    duplicate.errores = []
    duplicate.guardados = 0
    duplicate.ya_guardados = 1
    duplicate.rechazados = 0

    const applied = applyCajeroBatchResponse(
      scope,
      duplicate,
      storage,
    )

    expect(applied.remaining.items).toHaveLength(0)
    expect(readCajeroBuffer(scope, storage).items).toHaveLength(0)
    expect(readCajeroExpressionDrafts(scope, storage).items).toHaveLength(0)
  })
  test('impone auto en vistas base y exige origen para reconteo', () => {
    const storage = new MemoryStorage()

    expect(() =>
      enqueueCajeroObservation(
        scope,
        observation('group-1', { tipo_observacion: 'base' }),
        storage,
      ),
    ).toThrow()

    expect(() =>
      enqueueCajeroObservation(
        scope,
        observation('group-2', {
          tipo_observacion: 'reconteo',
          display: {
            ...observation('group-2').display,
            vista: 'revisar',
          },
        }),
        storage,
      ),
    ).toThrow()
  })

  test('aplica únicamente el umbral inmediato de 80', () => {
    expect(shouldFlushCajeroBufferImmediately(79)).toBe(false)
    expect(shouldFlushCajeroBufferImmediately(80)).toBe(true)
    expect(shouldFlushCajeroBufferImmediately(120)).toBe(true)
  })
})

describe('cajero.utils V3', () => {
  test('calcula diferencia y valorización sin reinterpretar backend', () => {
    expect(calculateDifference(8, 10)).toBe(-2)
    expect(calculateValuation(-2, 3.5)).toBe(-7)
  })

  test('traduce motivos técnicos a términos operativos', () => {
    expect(getFollowupReasonLabel('persistente')).toBe(
      'Verificar diferencia',
    )
    expect(getFollowupReasonLabel('conteos_inconsistentes')).toBe('Reconteo')
    expect(getFollowupReasonLabel('movimiento_posterior')).toBe(
      'Cambio de stock',
    )
  })
})
