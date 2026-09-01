import { describe, expect, test } from 'bun:test'
import type {
  SologDetailsExportResponse,
  SologDetailsExportRow,
} from '../src/features/solog/types'
import {
  getDetailsExportFilename,
  getDetailsValuationExplanation,
  validateDetailsExportResponse,
} from '../src/features/solog/detalles/detalles.export'

function rowFixture(
  overrides: Partial<SologDetailsExportRow> = {},
): SologDetailsExportRow {
  return {
    fecha: '2026-08-31T15:35:00Z',
    nombre: 'Agua mineral',
    categoria: 'Bebidas',
    estado: 'Confirmada',
    stock_tumi: 12,
    fisico: 15,
    diferencia: 3,
    valorizado: 24,
    precio: 8,
    unidades_por_paquete: null,
    precio_paquete: null,
    detalle_id: 'detail-1',
    ...overrides,
  }
}

function exportFixture(): SologDetailsExportResponse {
  return {
    ok: true,
    codigo: 'DETAILS_EXPORT',
    sede: { id: 'site-1', nombre: 'Huáca Principal' },
    periodo: { desde: '2026-08-16', hasta: '2026-08-31' },
    summary: {
      diferencias_finales: 2,
      confirmadas: 1,
      inconsistentes: 1,
      faltantes: 1,
      sobrantes: 1,
      valorizado_faltantes: -60,
      valorizado_sobrantes: 24,
      balance_valorizado: -36,
    },
    rows: [
      rowFixture(),
      rowFixture({
        fecha: '2026-08-31T04:30:00Z',
        nombre: 'Galletas por paquete',
        categoria: 'Snacks',
        estado: 'Inconsistente',
        stock_tumi: 30,
        fisico: 16,
        diferencia: -14,
        valorizado: -60,
        precio: 5,
        unidades_por_paquete: 12,
        precio_paquete: 50,
        detalle_id: 'detail-2',
      }),
    ],
    server_now: '2026-08-31T17:00:00Z',
  }
}

describe('Detalles Fase 4: contrato de exportación', () => {
  test('acepta únicamente respuestas finales completas y coherentes', () => {
    const fixture = exportFixture()
    expect(validateDetailsExportResponse(fixture)).toBe(fixture)

    expect(() =>
      validateDetailsExportResponse({
        ...fixture,
        rows: [{ ...fixture.rows[0], estado: 'Recontar' }],
      }),
    ).toThrow('El backend devolvió datos incompletos')

    expect(() =>
      validateDetailsExportResponse({
        ...fixture,
        summary: { ...fixture.summary, confirmadas: 2, inconsistentes: 0 },
      }),
    ).toThrow('El backend devolvió datos incompletos')
  })

  test('construye el nombre congelado en hora Lima y sanitiza la sede', () => {
    expect(
      getDetailsExportFilename(
        exportFixture(),
        new Date('2026-08-31T11:35:00Z'),
      ),
    ).toBe(
      'SOLOG_Diferencias_quincenal_ago-31-0635_am_Huaca_Principal.xlsx',
    )
  })

  test('explica valorización unitaria y por paquete sin sustituir el valor backend', () => {
    const fixture = exportFixture()
    expect(getDetailsValuationExplanation(fixture.rows[0])).toBe(
      '+3 × S/ 8.00 = +S/ 24.00',
    )
    expect(getDetailsValuationExplanation(fixture.rows[1])).toBe(
      '-14 uds. = -(1 paquete × S/ 50.00 + 2 uds. × S/ 5.00) = -S/ 60.00',
    )
  })

  test('export usa payload vacío y no reutiliza la exportación administrativa', async () => {
    const api = await Bun.file('src/features/solog/api.ts').text()
    expect(api).toContain("'export',\n    {}")

    const source = await Bun.file(
      'src/features/solog/detalles/detalles.export.ts',
    ).text()
    expect(source).toContain("sheet: 'Resumen'")
    expect(source).toContain("sheet: 'Diferencias'")
    expect(source).toContain("import('write-excel-file/browser')")
    expect(source).not.toContain('rpc_solog_control_export')
  })
})
