import { describe, expect, test } from 'bun:test'
import {
  CONTROL_STATE_GROUPS,
  formatControlDate,
  getControlDifferenceClass,
} from '../src/features/solog/admin/control/admin.control.format'
import {
  getControlExportFilename,
  validateControlExportResponse,
} from '../src/features/solog/admin/control/admin.control.export'
import type { SologControlExportResponse, SologControlSummary } from '../src/features/solog/types'

function exportFixture(): SologControlExportResponse {
  return {
    sede_id: 'site', sede: 'Huaca', date_from: '2026-08-16', date_to: '2026-08-31',
    registros: 1, faltantes: 17.25, sobrantes: 0, balance: 17.25,
    server_now: '2026-08-31T17:00:00Z',
    rows: [{
      fecha: '2026-08-31T16:00:00Z', categoria: 'Bebidas', grupo: 'Grupo A',
      tipo: 'Agrupado', codigos_internos: [123, 456], teorico: 20, fisico: 10,
      reconteo: 18, ajuste: -2, valor_economico: 17.25, detalle_id: 'detail', estado: 'Confirmada',
    }],
  }
}

describe('Control V3: filtros y presentación', () => {
  test('mapea los cinco filtros a las claves reales de resumen', () => {
    const summary: SologControlSummary = { recontar: 3, confirmadas: 4, inconsistentes: 5, coincide: 6, total: 18 }
    expect(CONTROL_STATE_GROUPS.map(({ value, label, summaryKey }) => [value, label, summary[summaryKey]])).toEqual([
      ['recontar', 'Recontar', 3], ['confirmadas', 'Confirmada', 4],
      ['inconsistentes', 'Inconsistente', 5], ['coinciden', 'Coincide', 6], ['todos', 'Todos', 18],
    ])
  })

  test('mantiene formato de fechas y signo de la diferencia entregada', () => {
    expect(getControlDifferenceClass(-2)).toBe('control-difference control-difference--negative')
    expect(getControlDifferenceClass(3)).toBe('control-difference control-difference--positive')
    expect(getControlDifferenceClass(0)).toBe('control-difference control-difference--zero')
    expect(formatControlDate(null)).toBe('Sin registro')
    expect(formatControlDate('2026-09-01T01:00:00Z')).toStartWith('31/08,')
  })

  test('contratos de Control no requieren campos legacy ni paginación inexistente', async () => {
    const types = await Bun.file('src/features/solog/types.ts').text()
    const control = types.slice(types.indexOf('export type SologControlScope'))
    expect(control).not.toMatch(/tipo_observacion|observacion_origen_id|motivo_verificacion|diferencia_confirmada|confirmado_at|reconteo_stock|historial_limit|historial_offset|persistente|confirmada_reconteo/)
    const history = control.slice(control.indexOf('export interface SologControlHistoryRow'))
    expect(history).not.toMatch(/usuario_id|usuario:/)
    expect(control).toContain('primer_snapshot_posterior_id: string | null')
    expect(control).toContain('snapshot_reconteo_id: string | null')
    expect(control).toContain('stock_reconteo: number | null')
    expect(control).toContain("'categoria_id' | 'es_observacion_vigente'")
  })
})

describe('Export V3', () => {
  test('acepta contrato real y devuelve las mismas filas y totales, sin recalcular ajustes', () => {
    const response = exportFixture()
    expect(response.rows[0].ajuste).not.toBe(response.rows[0].fisico - response.rows[0].teorico)
    expect(validateControlExportResponse(response)).toBe(response)
    expect(response.rows[0].ajuste).toBe(-2)
    expect(response.rows[0].valor_economico).toBe(17.25)
    expect(response.balance).toBe(17.25)
  })

  test('acepta respuesta vacía y reconteo nulo sin fabricar datos', () => {
    const response = exportFixture()
    response.rows[0].reconteo = null
    expect(validateControlExportResponse(response).rows[0].reconteo).toBeNull()
    Object.assign(response, { rows: [], registros: 0, faltantes: 0, sobrantes: 0, balance: 0 })
    expect(validateControlExportResponse(response).rows).toEqual([])
  })

  test('rechaza estados ajenos al contrato, no filtra silenciosamente un lote inválido', () => {
    for (const estado of ['Inconsistente', 'Recontar', 'Coincide', 'persistente', 'confirmada_reconteo', 'confirmada']) {
      const response = exportFixture()
      expect(() => validateControlExportResponse({ ...response, rows: [{ ...response.rows[0], estado }] })).toThrow()
    }
  })

  test('exige detalle_id, reconteo y números finitos; detecta respuesta incompleta', () => {
    const response = exportFixture()
    for (const patch of [{ detalle_id: undefined }, { reconteo: undefined }, { reconteo: NaN }, { ajuste: Infinity }, { valor_economico: '17.25' }]) {
      expect(() => validateControlExportResponse({ ...response, rows: [{ ...response.rows[0], ...patch }] })).toThrow()
    }
    expect(() => validateControlExportResponse({ ...response, registros: 2 })).toThrow()
  })

  test('mantiene el nombre y período del archivo aprobado', () => {
    expect(getControlExportFilename(exportFixture())).toBe('SOLOG_Ajustes_Huaca_2026-08-16_2026-08-31.xlsx')
  })
})
