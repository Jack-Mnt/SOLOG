import { describe, expect, test } from 'bun:test'
import { Beer, CupSoda, Package, Warehouse } from 'lucide-react'
import {
  buildNextCajeroBatch,
  readCajeroBuffer,
  saveCajeroLocalCapture,
} from '../src/features/solog/cajero/cajero.storage'
import type {
  CajeroBufferScope,
  CajeroCountGroup,
  CajeroObservationInput,
} from '../src/features/solog/cajero/cajero.types'
import {
  deriveCajeroFortnightCategories,
  filterCajeroFortnightCategoryGroups,
  getCajeroCategoryIcon,
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
  categoryId: string,
  category: string,
  stock: number,
  pending: boolean,
  order: number,
): CajeroCountGroup {
  return {
    grupo_id: id,
    nombre: `Grupo ${id}`,
    categoria_id: categoryId,
    categoria: category,
    categoria_orden: order,
    precio: 3.5,
    stock_teorico: stock,
    pendiente_quincena: pending,
    cubierto_quincena: !pending,
    stock_cero: stock === 0,
    stock_negativo: stock < 0,
  }
}

function observation(
  grupoId: string,
  categoryId: string,
  view: 'categoria' | 'conteo_diario',
): CajeroObservationInput {
  return {
    grupo_id: grupoId,
    stock_fisico: 8,
    contado_at: '2026-08-29T14:00:00.000Z',
    tipo_observacion: 'auto',
    observacion_origen_id: null,
    display: {
      vista: view,
      categoria_id: categoryId,
      grupo: `Grupo ${grupoId}`,
      categoria: `Categoría ${categoryId}`,
      stock_teorico: 10,
      precio: 3.5,
      ultima_diferencia: null,
      motivo_seguimiento: null,
    },
  }
}

describe('Conteo quincenal Fase 3', () => {
  const groups = [
    group('positive-pending', 'category-b', 'Bebidas', 10, true, 2),
    group('positive-done', 'category-a', 'Almacén', 4, false, 1),
    group('zero-pending', 'category-a', 'Almacén', 0, true, 1),
    group('negative-pending', 'category-c', 'Cervezas', -2, true, 3),
  ]

  test('deriva categorías del dataset completo y conserva las vacías ordenadas', () => {
    expect(deriveCajeroFortnightCategories(groups, 'positive')).toEqual([
      { id: 'category-a', nombre: 'Almacén', count: 0, orden: 1 },
      { id: 'category-b', nombre: 'Bebidas', count: 1, orden: 2 },
    ])
    expect(deriveCajeroFortnightCategories(groups, 'zero')[0]?.count).toBe(1)
    expect(deriveCajeroFortnightCategories(groups, 'negative')[0]?.count).toBe(1)
  })

  test('filtra siempre por pendiente_quincena, tipo y categoría', () => {
    expect(
      filterCajeroFortnightCategoryGroups(
        groups,
        'positive',
        'category-a',
      ),
    ).toEqual([])
    expect(
      filterCajeroFortnightCategoryGroups(
        groups,
        'positive',
        'category-b',
      ).map((item) => item.grupo_id),
    ).toEqual(['positive-pending'])
  })

  test('la pantalla realiza una sola carga compacta y usa selección local', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.conteo.tsx',
    ).text()
    expect(source.match(/getCajeroGroups\(/g)).toHaveLength(1)
    expect(source).toContain("vista: 'conteo'")
    expect(source).not.toContain("vista: 'categoria'")
    expect(source).toContain('CajeroSelectionGrid')
    expect(source).toContain('CajeroCaptureModal')
  })
})

describe('Conteo diario y buffer compartido Fase 3', () => {
  test('Conteo diario conserva la caché y abre el mismo modal sin API por categoría', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.diario.tsx',
    ).text()
    expect(source.match(/loadOperationalGroups\('conteo_diario'\)/g)).toHaveLength(1)
    expect(source).toContain("getCachedOperationalGroups('conteo_diario')")
    expect(source).toContain('CajeroSelectionGrid')
    expect(source).toContain('CajeroCaptureModal')
    expect(source).not.toContain('getCajeroGroups')
  })

  test('observaciones de categorías y módulos distintos conviven en el mismo alcance', () => {
    const storage = new MemoryStorage()
    saveCajeroLocalCapture(
      scope,
      observation('group-base', 'category-a', 'categoria'),
      '4 + 4',
      storage,
    )
    saveCajeroLocalCapture(
      scope,
      observation('group-daily', 'category-b', 'conteo_diario'),
      '2 × 4',
      storage,
    )

    expect(readCajeroBuffer(scope, storage).items).toHaveLength(2)
    const payload = buildNextCajeroBatch(scope, 'device-token', storage)
    expect(payload?.items).toHaveLength(2)
    expect(JSON.stringify(payload)).not.toContain('expresion')
  })
})

describe('corrección visual y ergonómica', () => {
  test('asigna iconos representativos y conserva fallback genérico', () => {
    expect(getCajeroCategoryIcon('Cervezas')).toBe(Beer)
    expect(getCajeroCategoryIcon('Bebidas sin alcohol')).toBe(CupSoda)
    expect(getCajeroCategoryIcon('De Bodega')).toBe(Warehouse)
    expect(getCajeroCategoryIcon('Categoría desconocida')).toBe(Package)
  })

  test('simplifica títulos y envío sin alterar la integración del modal', async () => {
    const [count, daily, operational, modal, styles] = await Promise.all([
      Bun.file('src/features/solog/cajero/cajero.conteo.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.diario.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.operativo.tsx').text(),
      Bun.file('src/features/solog/cajero/cajero.captura-modal.tsx').text(),
      Bun.file('src/styles.css').text(),
    ])

    expect(count).toContain('<p>Registra la realidad</p>')
    expect(daily).toContain('<p>Registra la realidad</p>')
    expect(count).not.toContain('>Tipo de stock<')
    expect(operational).not.toContain('conteos por enviar')
    expect(modal).toContain('cajero-capture-modal__body--detail')
    expect(modal).toContain('cajero-capture-detail__information')
    expect(styles).toContain('background: var(--color-dark-surface-secondary)')
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(styles).toContain('position: sticky')
  })
})
