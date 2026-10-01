import { describe, expect, test } from 'bun:test'
import { Beer, CupSoda, Package, Warehouse } from 'lucide-react'
import { CASHIER_ROUTES, isCashierRoute } from '../src/lib/router'
import { getSologDifferenceStateClass, getSologDifferenceStateLabel } from '../src/features/solog/labels'
import {
  applyCajeroCalculatorKey, evaluateCajeroExpression, calculateCajeroValuationPreview,
  formatCajeroCurrency, formatCajeroDifference, getCajeroDifferenceClass, getCajeroCategoryIcon,
} from '../src/features/solog/cajero/cajero.utils'

describe('Cajero shared: calculadora y presentación vigentes', () => {
  test('expresiones conservan precedencia, cero y límite físico', () => {
    for (const [expression, value] of [['12 × 6 + 3', 75], ['0', 0], ['99999', 99999]] as const)
      expect(evaluateCajeroExpression(expression)).toEqual({ status: 'valid', value })
    expect(evaluateCajeroExpression('')).toEqual({ status: 'empty', value: null })
    for (const expression of ['12 +', '8 + 7 ×', '-1', '1.5'])
      expect(evaluateCajeroExpression(expression)).toEqual({ status: 'incomplete', value: null })
    for (const expression of ['100000', '999999999999999999999 × 999999999999999999'])
      expect(evaluateCajeroExpression(expression)).toEqual({ status: 'too_high', value: null })
  })
  test('teclas corrigen, limpian y construyen una expresión válida', () => {
    let expression = applyCajeroCalculatorKey('', '2')
    expression = applyCajeroCalculatorKey(expression, '+')
    expect(applyCajeroCalculatorKey(expression, '×')).toBe(expression)
    expression = applyCajeroCalculatorKey(expression, '3')
    expect(evaluateCajeroExpression(expression).value).toBe(5)
    expect(applyCajeroCalculatorKey(expression, 'backspace')).toBe('2 + ')
    expect(applyCajeroCalculatorKey('2 + ', 'backspace')).toBe('2')
    expect(applyCajeroCalculatorKey(expression, 'clear')).toBe('')
  })
  test('atajos ×6/×12 no crean expresiones inválidas', () => {
    for (const key of ['times6', 'times12'] as const) {
      for (const expression of ['', '2 + ', '2 × ']) expect(applyCajeroCalculatorKey(expression, key)).toBe(expression)
      expect(evaluateCajeroExpression(applyCajeroCalculatorKey('2', key)).value).toBe(key === 'times6' ? 12 : 24)
    }
  })
  test('preview conserva signo y valorización por paquete y unidad', () => {
    expect(calculateCajeroValuationPreview(0 - (-3), 4, null, null)).toBe(12)
    expect(calculateCajeroValuationPreview(-2, 3.5, null, null)).toBe(-7)
    expect(calculateCajeroValuationPreview(14, 4, 6, 20)).toBe(48)
    expect(calculateCajeroValuationPreview(-14, 4, 6, 20)).toBe(-48)
    expect(calculateCajeroValuationPreview(2, 4, 6, null)).toBeNull()
    expect(formatCajeroCurrency(12)).toContain('12.00')
  })
  test('formatos y clases compartidos no ocultan cero ni diferencias negativas', () => {
    for (const [value, text, css] of [[null, '—', undefined], [0, '0', 'is-zero'], [-8, '-8', 'is-negative'], [1, '+1', 'is-positive']] as const) {
      expect(formatCajeroDifference(value)).toBe(text)
      expect(getCajeroDifferenceClass(value)).toBe(css)
    }
    for (const state of ['Coincide', 'Recontar', 'Confirmada', 'Inconsistente'] as const) {
      expect(getSologDifferenceStateLabel(state)).toBe(state)
      expect(getSologDifferenceStateClass(state)).toBe(state.toLowerCase())
    }
  })
  test('iconografía compartida normaliza categorías y conserva fallback', () => {
    expect(getCajeroCategoryIcon('Cervezas')).toBe(Beer)
    expect(getCajeroCategoryIcon('Bebidas sin alcohol')).toBe(CupSoda)
    expect(getCajeroCategoryIcon('Abarrotes')).toBe(Warehouse)
    expect(getCajeroCategoryIcon('Categoría desconocida')).toBe(Package)
  })
  test('rutas globales pertenecen a lib y conservan los cinco destinos', async () => {
    expect(CASHIER_ROUTES).toEqual(['/cajero', '/cajero/conteo', '/cajero/diario', '/cajero/revisar', '/cajero/historial'])
    CASHIER_ROUTES.forEach(route => expect(isCashierRoute(route)).toBe(true))
    expect(isCashierRoute('/cajero/otra')).toBe(false)
    expect(await Bun.file('src/lib/router.ts').text()).not.toContain('features/solog/cajero')
  })
})

describe('Historial compartido vigente', () => {
  test('usa header compacto, categorías locales y lista expandible múltiple', async () => {
    const source = await Bun.file(
      'src/features/solog/cajero/cajero.historial.tsx',
    ).text()

    expect(source).toContain('<p>Consulta tus conteos recientes')
    expect(source).not.toContain('cajero-module__eyebrow')
    expect(source).toContain('Por categorías')
    expect(source).not.toContain('<dt>Estado</dt>')
    expect(source).toContain("hour12: true")
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

    expect(source).toContain("session.getCachedHistory('today')")
    expect(source).toContain('getCachedHistory(nextPeriod)')
    expect(source).toContain('items.filter((item) => item.categoria === effectiveCategoryId)')
    expect(source).toContain('setSelectedCategoryId(category.id)')
    expect(source).toContain('toggleExpandedItem(item.detalle_id)')
    expect(source).not.toContain('cajero.api')
    expect(source).not.toContain('supabase')
  })
})
