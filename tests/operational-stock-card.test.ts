import { describe, expect, test } from 'bun:test'
import { isDetailsStockStale } from '../src/features/solog/detalles/detalles.stock'

describe('normalización transversal de tarjeta stock/inventario', () => {
  test('Detalles marca stale exactamente desde las dos horas', () => {
    const confirmedAt = '2026-10-07T10:00:00.000Z'
    expect(isDetailsStockStale(confirmedAt, '2026-10-07T11:59:59.999Z')).toBe(false)
    expect(isDetailsStockStale(confirmedAt, '2026-10-07T12:00:00.000Z')).toBe(true)
    expect(isDetailsStockStale(null, '2026-10-07T12:00:00.000Z')).toBe(false)
  })

  test('Cajero y Detalles comparten icono, copy y estados visuales', async () => {
    const operational = await Bun.file('src/operational.css').text()
    const cajero = await Bun.file('src/features/solog/cajero/cajero.v4.ui.tsx').text()
    const detalles = await Bun.file('src/features/solog/detalles/detalles.panel.tsx').text()

    for (const source of [cajero, detalles]) {
      expect(source).toContain('cajero-stock-card__icon')
      expect(source).toContain('cajero-stock-card__copy')
      expect(source).toContain('cajero-stock-card--updated')
      expect(source).toContain('cajero-stock-card--stale')
    }
    expect(operational).toContain('.cajero-stock-card--updated')
    expect(operational).toContain('.cajero-stock-card--stale')
    expect(cajero).toContain('Inventario desactualizado')
    expect(detalles).toContain('Stock desactualizado')
  })
})
