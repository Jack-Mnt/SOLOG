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
  getFollowupGroupLabel,
  getReviewReasonLabel,
  isCajeroRecountGroup,
  sortFollowupGroups,
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
  motivo: string | null,
  contadoAt: string,
  estado: CajeroCountGroup['estado_diferencia'] = 'pendiente',
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
    motivo_seguimiento: motivo,
    estado_diferencia: estado,
    contado_at_original: contadoAt,
    ultima_diferencia: -2,
  }
}

function observation(
  grupoId: string,
  tipo: CajeroObservationInput['tipo_observacion'],
  origen: string | null,
): CajeroObservationInput {
  return {
    grupo_id: grupoId,
    stock_fisico: 8,
    contado_at: '2026-08-26T10:04:00.000Z',
    tipo_observacion: tipo,
    observacion_origen_id: origen,
    display: {
      vista: tipo === 'auto' ? 'categoria' : 'revisar',
      categoria_id: 'category-1',
      grupo: `Grupo ${grupoId}`,
      categoria: 'Bebidas',
      stock_teorico: 10,
      precio: 4,
      ultima_diferencia: -2,
      motivo_seguimiento: tipo === 'reconteo' ? 'conteos_inconsistentes' : null,
    },
  }
}

describe('Revisar V3.1', () => {
  test('ordena por motivo y después por antigüedad', () => {
    const groups = [
      group('change', 'movimiento_posterior', '2026-08-26T08:00:00.000Z'),
      group('recount', 'conteos_inconsistentes', '2026-08-26T07:00:00.000Z'),
      group('difference-new', 'persistente', '2026-08-26T09:00:00.000Z'),
      group('difference-old', 'parcialmente_explicada', '2026-08-26T06:00:00.000Z'),
    ]
    expect(sortFollowupGroups(groups).map((item) => item.grupo_id)).toEqual([
      'difference-old',
      'difference-new',
      'recount',
      'change',
    ])
  })

  test('traduce motivos y reconoce reconteo desde el estado backend', () => {
    const recount = group(
      'recount',
      null,
      '2026-08-26T07:00:00.000Z',
      'conteos_inconsistentes',
    )
    expect(isCajeroRecountGroup(recount)).toBe(true)
    expect(getFollowupGroupLabel(recount)).toBe('Reconteo')
    expect(getFollowupGroupLabel(group('change', 'movimiento_posterior', '2026-08-26T08:00:00.000Z'))).toBe('Cambio de stock')
  })

  test('traduce los motivos de Revisar a lenguaje operativo', () => {
    expect(getReviewReasonLabel('persistente')).toBe('Confirmar conteo')
    expect(getReviewReasonLabel('conteos_inconsistentes')).toBe('Confirmar conteo')
    expect(getReviewReasonLabel('parcialmente_explicada')).toBe('Volver a contar')
    expect(getReviewReasonLabel('movimiento_posterior')).toBe('Volver a contar')
    expect(getReviewReasonLabel('otro')).toBe('Verificar diferencia')
    expect(getReviewReasonLabel(null)).toBe('Verificar diferencia')
  })

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

  test('crea un lote mixto con auto, seguimiento y reconteo con origen', () => {
    const storage = new MemoryStorage()
    const origin = '4f3e43cc-2e6d-4cc5-bf9b-50bb58610417'
    upsertCajeroObservation(scope, observation('base', 'auto', null), storage)
    upsertCajeroObservation(scope, observation('followup', 'seguimiento', null), storage)
    upsertCajeroObservation(scope, observation('recount', 'reconteo', origin), storage)

    const batch = buildNextCajeroBatch(scope, 'device-token', storage)
    expect(batch?.items.map((item) => item.tipo_observacion)).toEqual([
      'auto',
      'seguimiento',
      'reconteo',
    ])
    expect(batch?.items[2]?.observacion_origen_id).toBe(origin)
  })

  test('rechaza reconteo sin observacion_origen_id', () => {
    expect(() =>
      upsertCajeroObservation(
        scope,
        observation('recount', 'reconteo', null),
        new MemoryStorage(),
      ),
    ).toThrow()
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
    expect(source).toContain('initialGroupId={selectedGroupId}')
    expect(source).not.toContain('CajeroOperationalView')
    expect(source).not.toContain('CajeroCountTable')
    expect(source).not.toContain('<input')
    expect(source).not.toContain('Motivo</')
  })

  test('el modal admite Revisar sin ejecutar RPC y conserva su semántica', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.captura.dialog.tsx',
    ).text()

    expect(source).toContain("'conteo_diario' | 'revisar'")
    expect(source).toContain('initialGroupId?: string')
    expect(source).toContain('<dt>Última diferencia</dt>')
    expect(source).toContain('<dt>Motivo</dt>')
    expect(source).toContain("? 'reconteo'")
    expect(source).toContain(": 'seguimiento'")
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
      tipo_observacion: 'seguimiento',
      stock_teorico: 10,
      stock_fisico: 8,
      precio: 4,
      valor_diferencia: -8,
      estado_diferencia: 'pendiente',
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
