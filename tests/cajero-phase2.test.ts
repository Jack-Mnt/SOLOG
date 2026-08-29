import { describe, expect, test } from 'bun:test'
import {
  CAJERO_INACTIVITY_MS,
  getCajeroSessionBlockReason,
  isCajeroInactive,
} from '../src/features/solog/cajero/cajero.session'
import {
  readCajeroBuffersForIdentity,
  upsertCajeroObservation,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBufferScope,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import type { SologOperationalBootstrap } from '../src/features/solog/types'
import { resolveTrustedRoute } from '../src/lib/router'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const NOW = Date.parse('2026-08-26T15:00:00.000Z')

function bootstrap(
  overrides: Partial<SologOperationalBootstrap> = {},
): SologOperationalBootstrap {
  return {
    usuario: { id: 'user-1', nombre: 'Cajero', rol: 'cajero' },
    sede: { id: 'site-1', nombre: 'Huaca', activo: true },
    dispositivo: {
      id: 'device-1',
      estado: 'autorizado',
      sede_correcta: true,
      autorizado: true,
    },
    sesion_activa: {
      id: 'count-1',
      iniciado_at: '2026-08-26T14:00:00.000Z',
      expira_at: '2026-08-26T16:00:00.000Z',
      snapshot_referencia_id: 'snapshot-1',
      snapshot_referencia_at: '2026-08-26T13:55:00.000Z',
      snapshot_confirmado_at: '2026-08-26T13:56:00.000Z',
      grupos_guardados: 0,
    },
    stock: {
      disponible: true,
      snapshot_id: 'snapshot-1',
      snapshot_at: '2026-08-26T13:55:00.000Z',
      confirmado_at: '2026-08-26T13:56:00.000Z',
      expira_at: '2026-08-26T16:00:00.000Z',
      version_catalogo: 3,
      puede_iniciar_conteo: true,
    },
    server_now: '2026-08-26T15:00:00.000Z',
    cobertura_diaria: {
      fecha: '2026-08-26',
      grupos_requeridos: 10,
      grupos_verificados: 2,
      pendientes: 8,
      porcentaje: 20,
      sin_requerimientos: false,
    },
    cobertura_quincenal: {
      grupos_contados: 20,
      grupos_totales: 100,
      pendientes: 80,
      porcentaje: 20,
      completa: false,
      quincena: 'segunda',
      desde: '2026-08-16',
      hasta: '2026-08-31',
    },
    conteo_principal: { categorias: [], stock_cero_pendientes: 0 },
    vistas_inteligentes: {
      seguimiento: { cantidad: 0, habilitado: true },
      cambios_recientes: { cantidad: 0, habilitado: false },
      stock_negativo: { cantidad: 0, habilitado: true },
      contar_detalladamente: { cantidad: 0, habilitado: false },
    },
    ...overrides,
  }
}

function observation(): CajeroObservationInput {
  return {
    grupo_id: 'group-1',
    stock_fisico: 2,
    contado_at: '2026-08-26T14:30:00.000Z',
    tipo_observacion: 'auto',
    observacion_origen_id: null,
    display: {
      vista: 'stock_cero',
      categoria_id: 'category-1',
      grupo: 'Grupo 1',
      categoria: 'Bebidas',
      stock_teorico: 0,
      precio: 4,
      ultima_diferencia: null,
      motivo_seguimiento: null,
    },
  }
}

describe('ciclo de sesión Cajero V3', () => {
  test('distingue sesión vigente, vencida y con stock actualizado', () => {
    expect(getCajeroSessionBlockReason(bootstrap(), NOW)).toBeNull()
    expect(getCajeroSessionBlockReason(bootstrap(), Date.parse('2026-08-26T16:00:00.000Z'))).toBe('expired')
    expect(
      getCajeroSessionBlockReason(
        bootstrap({
          stock: {
            ...bootstrap().stock,
            disponible: true,
            snapshot_id: 'snapshot-2',
          },
        }),
        NOW,
      ),
    ).toBe('stock_updated')
  })

  test('modela sin snapshot sin convertir fechas nulas', () => {
    const withoutStock = bootstrap({
      sesion_activa: null,
      stock: {
        disponible: false,
        snapshot_id: null,
        snapshot_at: null,
        confirmado_at: null,
        expira_at: null,
        version_catalogo: null,
        puede_iniciar_conteo: false,
      },
    })
    expect(getCajeroSessionBlockReason(withoutStock, NOW)).toBeNull()
  })

  test('detecta inactividad exactamente a los veinte minutos', () => {
    expect(isCajeroInactive(NOW - CAJERO_INACTIVITY_MS + 1, NOW)).toBe(false)
    expect(isCajeroInactive(NOW - CAJERO_INACTIVITY_MS, NOW)).toBe(true)
  })
})

describe('aislamiento y rutas Cajero V3', () => {
  test('descubre buffers tardíos compatibles sin mezclar conteo_id', () => {
    const storage = new MemoryStorage()
    const base: Omit<CajeroBufferScope, 'conteo_id'> = {
      usuario_id: 'user-1',
      sede_id: 'site-1',
      dispositivo_id: 'device-1',
    }
    upsertCajeroObservation({ ...base, conteo_id: 'count-1' }, observation(), storage)
    upsertCajeroObservation({ ...base, conteo_id: 'count-2' }, observation(), storage)

    const buffers = readCajeroBuffersForIdentity(base, storage)
    expect(buffers.map((buffer) => buffer.scope.conteo_id)).toEqual(['count-1', 'count-2'])
    expect(readCajeroBuffersForIdentity({ ...base, sede_id: 'site-2' }, storage)).toHaveLength(0)
  })

  test('restringe rutas por etapa y reemplaza nombres legacy', () => {
    const incomplete = bootstrap()
    const complete = bootstrap({
      cobertura_quincenal: {
        ...bootstrap().cobertura_quincenal,
        completa: true,
        grupos_contados: 100,
        pendientes: 0,
        porcentaje: 100,
      },
    })

    expect(resolveTrustedRoute(incomplete, '/cajero/conteo')).toBe('/cajero/conteo')
    expect(resolveTrustedRoute(incomplete, '/cajero/historial')).toBe('/cajero')
    expect(resolveTrustedRoute(incomplete, '/count')).toBe('/cajero/conteo')
    expect(resolveTrustedRoute(complete, '/cajero/conteo')).toBe('/cajero')
    expect(resolveTrustedRoute(complete, '/cajero/diario')).toBe('/cajero/diario')
    expect(resolveTrustedRoute(complete, '/cajero/revisar')).toBe('/cajero/revisar')
    expect(resolveTrustedRoute(complete, '/cajero/historial')).toBe('/cajero/historial')
    expect(resolveTrustedRoute(complete, '/cajero/seguimiento')).toBe('/cajero/revisar')
  })

  test('un dispositivo pendiente o revocado conserva device-pending', () => {
    const pending = bootstrap({
      dispositivo: {
        id: 'device-1',
        estado: 'pendiente',
        sede_correcta: true,
        autorizado: false,
      },
    })
    expect(resolveTrustedRoute(pending, '/cajero')).toBe('/device-pending')
  })
})
