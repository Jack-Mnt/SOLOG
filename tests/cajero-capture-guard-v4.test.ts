import { describe, expect, test } from 'bun:test'
import { hasUnsavedCaptureEdit } from '../src/features/solog/cajero/cajero.capture.guard'

const changed = (expression: string, physical: number | null, savedPhysical: number | null, edited = true) =>
  hasUnsavedCaptureEdit({ edited, expression, physical, savedPhysical })

describe('D.1.4 — protección de edición en captura', () => {
  test('no advierte cuando no hubo edición o no se ingresó cantidad', () => {
    expect(changed('', null, null)).toBe(false)
    expect(changed('12', 12, 12, false)).toBe(false)
  })
  test('detecta nueva cantidad, incluso cero, e incompleta', () => {
    expect(changed('0', 0, null)).toBe(true)
    expect(changed('12', 12, null)).toBe(true)
    expect(changed('12+', null, null)).toBe(true)
  })
  test('no advierte por expresiones equivalentes al valor guardado', () => {
    expect(changed('6×2', 12, 12)).toBe(false)
    expect(changed('12', 12, 12)).toBe(false)
  })
  test('detecta valor diferente, inválido y eliminación del valor guardado', () => {
    expect(changed('13', 13, 12)).toBe(true)
    expect(changed('12+', null, 12)).toBe(true)
    expect(changed('', null, 12)).toBe(true)
  })
})
