import { describe, expect, test } from 'bun:test'
import { formatFullInventoryUpdate, fullMinutesRemaining, fullRemainingLabel } from '../src/features/solog/cajero/full.temporal'

describe('Cajero Full — presentación temporal sin duplicar fechas', () => {
  test('formatea una sola marca Lima como HH:MM am/pm [DD/MM]', () => {
    expect(formatFullInventoryUpdate('2026-10-28T09:38:00.000Z')).toBe('04:38 a. m. [28/10]')
    expect(formatFullInventoryUpdate('2026-10-28T17:05:00.000Z')).toBe('12:05 p. m. [28/10]')
    expect(formatFullInventoryUpdate('2026-10-28T05:00:00.000Z')).toBe('12:00 a. m. [28/10]')
    expect(formatFullInventoryUpdate(null)).toBe('Sin actualización')
    expect(formatFullInventoryUpdate('invalido')).toBe('Sin actualización')
  })

  test('usa deadline del servidor; redondea hacia arriba antes de vencer', () => {
    const expiry = '2026-10-28T10:38:00.000Z'
    expect(fullMinutesRemaining(expiry, Date.parse('2026-10-28T09:38:00.000Z'), true)).toBe(60)
    expect(fullMinutesRemaining(expiry, Date.parse('2026-10-28T09:38:00.001Z'), true)).toBe(60)
    expect(fullMinutesRemaining(expiry, Date.parse('2026-10-28T10:37:59.999Z'), true)).toBe(1)
    expect(fullMinutesRemaining(expiry, Date.parse(expiry), true)).toBe(0)
    expect(fullMinutesRemaining(expiry, Date.parse('2026-10-28T10:38:00.001Z'), true)).toBe(0)
  })

  test('separa minutos de captura de vigencia de inventario', () => {
    const now = Date.parse('2026-10-28T09:38:00.000Z')
    expect(fullRemainingLabel(fullMinutesRemaining('2026-10-28T10:36:00.000Z', now, true), 'capture'))
      .toBe('58 min restantes para capturar')
    expect(fullRemainingLabel(fullMinutesRemaining('2026-10-28T11:36:00.000Z', now, true), 'stock'))
      .toBe('118 min restantes de vigencia')
    expect(fullRemainingLabel(0, 'capture')).toBe('Tiempo de captura agotado')
    expect(fullRemainingLabel(0, 'stock')).toBe('Vigencia del inventario agotada')
  })

  test('no presenta tiempo inventado si el reloj no es confiable', () => {
    expect(fullMinutesRemaining('2026-10-28T10:38:00.000Z', Date.now(), false)).toBeNull()
    expect(fullMinutesRemaining(null, Date.now(), true)).toBeNull()
    expect(fullMinutesRemaining('invalido', Date.now(), true)).toBeNull()
    expect(fullMinutesRemaining('2026-10-28T10:38:00.000Z', Number.NaN, true)).toBeNull()
    expect(fullRemainingLabel(null, 'stock')).toBe('Tiempo restante no disponible')
  })
})
