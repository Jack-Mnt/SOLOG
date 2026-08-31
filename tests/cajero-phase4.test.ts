import { describe, expect, test } from 'bun:test'
import {
  buildNextCajeroBatch,
  upsertCajeroObservation,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBufferScope,
  CajeroCountGroup,
  CajeroHistoryItem,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import {
  filterCajeroReviewGroups,
  formatCajeroDifference,
  getCajeroDifferenceClass,
  sortHistoryNewestFirst,
  toggleCajeroReviewDifferenceFilter,
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

function group(
  id: string,
  _motivo: string | null,
  contadoAt: string,
  estado: CajeroCountGroup['estado_diferencia'] = 'Recontar',
): CajeroCountGroup {
  return {
    grupo_id: id,
    nombre: `Grupo ${id}`,
    categoria_id: 'category-1',
    categoria: 'Bebidas',
    precio: 4,
    stock_teorico: 10,
    productos: [],
    detalle_origen_id: '4f3e43cc-2e6d-4cc5-bf9b-50bb58610417',
    estado_diferencia: estado,
    contado_at_original: contadoAt,
    ultima_diferencia: -2,
  }
}

function observation(grupoId: string): CajeroObservationInput {
  return {
    grupo_id: grupoId, stock_fisico: 8, contado_at: '2026-08-26T10:04:00.000Z',
    display: { vista: 'categoria', categoria_id: 'category-1', grupo: grupoId,
      categoria: 'Bebidas', stock_teorico: 10, precio: 4 },
  }
}

describe('Revisar Motor V3', () => {
  test('alterna el filtro compacto entre todas, positivas y negativas', () => {
    expect(toggleCajeroReviewDifferenceFilter('all', 'positive')).toBe('positive')
    expect(toggleCajeroReviewDifferenceFilter('all', 'negative')).toBe('negative')
    expect(toggleCajeroReviewDifferenceFilter('positive', 'positive')).toBe('all')
    expect(toggleCajeroReviewDifferenceFilter('negative', 'negative')).toBe('all')
    expect(toggleCajeroReviewDifferenceFilter('positive', 'negative')).toBe('negative')
    expect(toggleCajeroReviewDifferenceFilter('negative', 'positive')).toBe('positive')
  })

  test('filtra por última diferencia, conserva el orden y deja cero solo en Todas', () => {
    const groups = [
      { ...group('positive', null, '2026-08-26T08:00:00.000Z'), ultima_diferencia: 3 },
      { ...group('zero', null, '2026-08-26T09:00:00.000Z'), ultima_diferencia: 0 },
      { ...group('negative', null, '2026-08-26T10:00:00.000Z'), ultima_diferencia: -2 },
    ]

    expect(filterCajeroReviewGroups(groups, 'all').map((item) => item.grupo_id)).toEqual([
      'positive',
      'zero',
      'negative',
    ])
    expect(filterCajeroReviewGroups(groups, 'positive').map((item) => item.grupo_id)).toEqual([
      'positive',
    ])
    expect(filterCajeroReviewGroups(groups, 'negative').map((item) => item.grupo_id)).toEqual([
      'negative',
    ])
  })

  test('Revisar no puede almacenar reconteos en el batch normal', () => {
    const storage = new MemoryStorage()
    const input = observation('recount')
    expect(() => upsertCajeroObservation(scope, {
      ...input, display: { ...input.display, vista: 'revisar' as never },
    }, storage)).toThrow()
    expect(buildNextCajeroBatch(scope, 'device-token', storage)).toBeNull()
  })

  test('usa lista compacta y abre directamente el modal compartido', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.revisar.tsx',
    ).text()

    expect(source).toContain('<p>Registra la realidad</p>')
    expect(source).toContain('cajero-review-list')
    expect(source).toContain('cajero-review-filter')
    expect(source).toContain('filterCajeroReviewGroups')
    expect(source).toContain('CajeroCaptureModal')
    expect(source).toContain('initialGroupId={selectedGroup.grupo_id}')
    expect(source).not.toContain('CajeroOperationalView')
    expect(source).not.toContain('CajeroCountTable')
    expect(source).not.toContain('<input')
    expect(source).not.toContain('Motivo</')
  })

  test('el modal delega el reconteo al controlador sin usar el batch', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.captura.dialog.tsx',
    ).text()

    expect(source).toContain("'conteo_diario' | 'revisar'")
    expect(source).toContain('initialGroupId?: string')
    expect(source).toContain('<dt>Última diferencia</dt>')
    expect(source).toContain('<dt>Motivo</dt>')
    expect(source).toContain('beginRecount(detailId)')
    expect(source).toContain('session.saveRecount(detailId, payload.stock_fisico, payload.contado_at)')
    expect(source).toContain('result?.diferencia')
    expect(source).not.toContain('sendPending')
    expect(source).not.toContain('cajero.api')
  })

  test('formatea la diferencia actual con la semántica visual acordada', () => {
    expect(formatCajeroDifference(null)).toBe('—')
    expect(formatCajeroDifference(0)).toBe('0')
    expect(formatCajeroDifference(-8)).toBe('-8')
    expect(formatCajeroDifference(1)).toBe('+1')
    expect(getCajeroDifferenceClass(0)).toBe('is-zero')
    expect(getCajeroDifferenceClass(-1)).toBe('is-negative')
    expect(getCajeroDifferenceClass(1)).toBe('is-positive')
  })
})

describe('Historial V3', () => {
  test('ordena observaciones independientes sin acumular diferencias', () => {
    const base: Omit<CajeroHistoryItem, 'detalle_id' | 'contado_at' | 'diferencia'> = {
      grupo_id: 'group-1',
      grupo: 'Grupo 1',
      categoria_id: 'category-1',
      categoria: 'Bebidas',
      stock_posterior: null,
      stock_reconteo: null,
      recontado_at: null,
      stock_teorico: 10,
      stock_fisico: 8,
      precio: 4,
      valor_diferencia: -8,
      estado_diferencia: 'Recontar',
    }
    const items: CajeroHistoryItem[] = [
      { ...base, detalle_id: 'one', contado_at: '2026-08-26T10:00:00.000Z', diferencia: -2 },
      { ...base, detalle_id: 'two', contado_at: '2026-08-26T11:00:00.000Z', diferencia: -3 },
      { ...base, detalle_id: 'three', contado_at: '2026-08-26T12:00:00.000Z', diferencia: 0 },
    ]
    expect(sortHistoryNewestFirst(items).map((item) => item.diferencia)).toEqual([0, -3, -2])
  })

  test('usa header compacto, categorías locales y lista expandible múltiple', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.historial.tsx',
    ).text()

    expect(source).toContain('<p>Registra la realidad</p>')
    expect(source).not.toContain('cajero-module__eyebrow')
    expect(source).not.toContain('Consulta</')
    expect(source).toContain('cajero-history-tabs')
    expect(source).toContain('cajero-selection-grid cajero-history-categories')
    expect(source).toContain('getCajeroCategoryIcon')
    expect(source).toContain('cajero-history-list')
    expect(source).not.toContain('cajero-history-table')
    expect(source).toContain('useState<Set<string>>')
    expect(source).toContain('expandedItemIds.has(item.detalle_id)')
    expect(source).toContain("expanded ? '−' : '+'")
  })

  test('mantiene caché por período y resuelve filtros y expansión sin API', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.historial.tsx',
    ).text()

    expect(source).toContain("session.getCachedHistory('hoy')")
    expect(source).toContain('getCachedHistory(nextPeriod)')
    expect(source).toContain('filterCajeroByCategory(items, effectiveCategoryId)')
    expect(source).toContain('setSelectedCategoryId(category.id)')
    expect(source).toContain('toggleExpandedItem(item.detalle_id)')
    expect(source).not.toContain('cajero.api')
    expect(source).not.toContain('supabase')
  })
})
