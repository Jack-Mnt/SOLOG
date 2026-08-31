import { describe, expect, test } from 'bun:test'
import {
  getReusableCajeroGroups,
  shouldInvalidateCajeroCaches,
} from '../src/features/solog/cajero/cajero.session'
import type {
  CajeroGroupsCacheEntry,
  CajeroGroupsPayload,
  CajeroCountGroup,
  CajeroGroupsResponse,
  CajeroHistoryItem,
} from '../src/features/solog/cajero/cajero.types'
import {
  deriveCajeroCategories,
  filterCajeroByCategory,
  filterCajeroFortnightCategoryGroups,
  isCajeroRouteAvailable,
} from '../src/features/solog/cajero/cajero.utils'

function groups(view: 'conteo_diario' | 'revisar', snapshotId = 'snapshot-1'): CajeroGroupsResponse {
  return {
    conteo_id: 'count-1',
    vista: view,
    snapshot_actual_id: snapshotId,
    snapshot_actual_at: '2026-08-26T10:00:00Z',
    server_now: '2026-08-26T10:01:00Z',
    grupos: [],
  }
}

describe('navegación Cajero V3.1', () => {
  test('expone únicamente las rutas de la etapa vigente', () => {
    expect(isCajeroRouteAvailable('/cajero', false)).toBe(true)
    expect(isCajeroRouteAvailable('/cajero/conteo', false)).toBe(true)
    expect(isCajeroRouteAvailable('/cajero/diario', false)).toBe(false)
    expect(isCajeroRouteAvailable('/cajero/revisar', false)).toBe(false)
    expect(isCajeroRouteAvailable('/cajero/historial', false)).toBe(false)

    expect(isCajeroRouteAvailable('/cajero', true)).toBe(true)
    expect(isCajeroRouteAvailable('/cajero/conteo', true)).toBe(false)
    expect(isCajeroRouteAvailable('/cajero/diario', true)).toBe(true)
    expect(isCajeroRouteAvailable('/cajero/revisar', true)).toBe(true)
    expect(isCajeroRouteAvailable('/cajero/historial', true)).toBe(true)
  })
})

describe('caché operativo Cajero V3.1', () => {
  const daily: CajeroGroupsCacheEntry = {
    snapshotId: 'snapshot-1',
    response: groups('conteo_diario'),
  }

  test('reutiliza grupos únicamente con el mismo snapshot', () => {
    expect(getReusableCajeroGroups(daily, 'snapshot-1')).toBe(daily.response)
    expect(getReusableCajeroGroups(daily, 'snapshot-2')).toBeNull()
    expect(getReusableCajeroGroups(undefined, 'snapshot-1')).toBeNull()
  })

  test('invalida ambas colas si el snapshot cambió', () => {
    const caches = {
      conteo_diario: daily,
      revisar: {
        snapshotId: 'snapshot-1',
        response: groups('revisar'),
      },
    }
    expect(shouldInvalidateCajeroCaches(caches, 'snapshot-1')).toBe(false)
    expect(shouldInvalidateCajeroCaches(caches, 'snapshot-2')).toBe(true)
    expect(shouldInvalidateCajeroCaches({}, 'snapshot-1')).toBe(false)
  })

  test('mantiene separadas las vistas compactas solicitadas al backend', () => {
    const dailyPayload: CajeroGroupsPayload = {
      device_token: 'token',
      vista: 'conteo_diario',
    }
    const reviewPayload: CajeroGroupsPayload = {
      device_token: 'token',
      vista: 'revisar',
    }
    expect(dailyPayload.vista).toBe('conteo_diario')
    expect(reviewPayload.vista).toBe('revisar')
  })
})
describe('categorías locales del Panel Cajero', () => {
  const group = (id: string, categoryId: string, category: string): CajeroCountGroup => ({
    grupo_id: id,
    nombre: `Grupo ${id}`,
    categoria_id: categoryId,
    categoria: category,
    precio: 2,
    stock_teorico: 4,
    detalle_origen_id: null,
    estado_diferencia: null,
    contado_at_original: null,
  })

  test('deriva solo categorías presentes y conserva el orden estable del payload', () => {
    const groups = [
      group('1', 'bodega', 'De Bodega'),
      group('2', 'bebidas', 'Bebidas sin alcohol'),
      group('3', 'bodega', 'De Bodega'),
    ]

    expect(deriveCajeroCategories(groups)).toEqual([
      { id: 'bodega', nombre: 'De Bodega', count: 2 },
      { id: 'bebidas', nombre: 'Bebidas sin alcohol', count: 1 },
    ])
    expect(filterCajeroByCategory(groups, 'bebidas').map((item) => item.grupo_id)).toEqual(['2'])
    expect(filterCajeroByCategory(groups, null)).toHaveLength(3)
  })

  test('Historial deriva y filtra categorías desde su propio período', () => {
    const base: CajeroHistoryItem = {
      detalle_id: 'detail-1',
      contado_at: '2026-08-27T10:00:00.000Z',
      grupo_id: 'group-1',
      grupo: 'Grupo 1',
      categoria_id: 'snacks',
      categoria: 'Snacks',
      stock_teorico: 10,
      stock_fisico: 8,
      diferencia: -2,
      precio: 3,
      valor_diferencia: -6,
      estado_diferencia: 'Recontar',
      stock_posterior: null,
      stock_reconteo: null,
      recontado_at: null,
    }
    const items = [
      base,
      { ...base, detalle_id: 'detail-2', grupo_id: 'group-2' },
      { ...base, detalle_id: 'detail-3', grupo_id: 'group-3', categoria_id: 'cervezas', categoria: 'Cervezas' },
    ]

    expect(deriveCajeroCategories(items)).toEqual([
      { id: 'snacks', nombre: 'Snacks', count: 2 },
      { id: 'cervezas', nombre: 'Cervezas', count: 1 },
    ])
    expect(filterCajeroByCategory(items, 'cervezas').map((item) => item.detalle_id)).toEqual(['detail-3'])
  })
})

describe('dataset compacto de Conteo quincenal', () => {
  const group = (
    id: string,
    categoryId: string,
    category: string,
    order: number,
    overrides: Partial<CajeroCountGroup> = {},
  ): CajeroCountGroup => ({
    grupo_id: id,
    nombre: "Grupo " + id,
    categoria_id: categoryId,
    categoria: category,
    categoria_orden: order,
    precio: 2,
    stock_teorico: 4,
    cubierto_quincena: false,
    stock_cero: false,
    stock_negativo: false,
    ...overrides,
  })

  test('acepta una sola solicitud sin categoría', () => {
    const payload: CajeroGroupsPayload = {
      device_token: 'token',
      vista: 'conteo',
    }
    expect(payload).toEqual({ device_token: 'token', vista: 'conteo' })
  })

  test('respeta cubierto_quincena y deriva las vistas localmente', () => {
    const groups = [
      group('normal', 'bebidas', 'Bebidas', 2),
      group('zero', 'bodega', 'Bodega', 1, {
        stock_teorico: 0,
        stock_cero: true,
      }),
      group('negative', 'bebidas', 'Bebidas', 2, {
        stock_teorico: -3,
        stock_negativo: true,
      }),
      group('covered', 'bodega', 'Bodega', 1, {
        cubierto_quincena: true,
        stock_cero: true,
      }),
    ]

    expect(
      filterCajeroFortnightCategoryGroups(
        groups,
        'positive',
        'bebidas',
      ).map(
        (item) => item.grupo_id,
      ),
    ).toEqual(['normal'])
    expect(
      filterCajeroFortnightCategoryGroups(
        groups,
        'zero',
        'bodega',
      ).map(
        (item) => item.grupo_id,
      ),
    ).toEqual(['zero'])
    expect(
      filterCajeroFortnightCategoryGroups(
        groups,
        'negative',
        'bebidas',
      ).map(
        (item) => item.grupo_id,
      ),
    ).toEqual(['negative'])
    expect(deriveCajeroCategories(groups).map((item) => item.id)).toEqual([
      'bodega',
      'bebidas',
    ])
  })
})
