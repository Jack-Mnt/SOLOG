import { describe, expect, test } from 'bun:test'
import { getDetailsExportFilename, getDetailsValuationExplanation, validateDetailsExportResponse } from '../src/features/solog/detalles/detalles.export'
import { DetailsStore } from '../src/features/solog/detalles/detalles.store'
import { detailsRpc } from '../src/features/solog/detalles/detalles.v2'
import { exportFixture, summaryFixture } from './fixtures/details-v2.mjs'

describe('D3 export V4', () => {
  test('valida estados finales, resumen y ausencia de valorizado Inconsistente', () => {
    const fixture = exportFixture()
    expect(validateDetailsExportResponse(fixture)).toBe(fixture)
    expect(() => validateDetailsExportResponse({ ...fixture, rows: [{ ...fixture.rows[0], estado: 'Recontar' }] })).toThrow()
    expect(() => validateDetailsExportResponse({ ...fixture, summary: { ...fixture.summary, confirmadas: 2, inconsistentes: 0 } })).toThrow()
    expect(() => validateDetailsExportResponse({ ...fixture, rows: fixture.rows.map((r) => ({ ...r, valorizado: 2 })) })).toThrow()
    expect(validateDetailsExportResponse(fixture).summary).not.toHaveProperty('balance_valorizado')
  })
  test('nombre Lima y explicación no reemplazan valor backend', () => {
    const fixture = validateDetailsExportResponse(exportFixture())
    expect(getDetailsExportFilename(fixture, new Date('2026-08-31T11:35:00Z'))).toBe('SOLOG_Diferencias_quincenal_ago-31-0635_am_Huaca_Principal.xlsx')
    expect(getDetailsValuationExplanation(fixture.rows[0])).toBe('+3 × S/ 8.00 = +S/ 24.00')
    expect(getDetailsValuationExplanation(fixture.rows[1])).toBe('Sin valorización disponible')
    expect(getDetailsValuationExplanation({ ...fixture.rows[1], estado: 'Confirmada', valorizado: -60 })).toBe('-14 uds. = -(1 paquete × S/ 50.00 + 2 uds. × S/ 5.00) = -S/ 60.00')
  })
  test('ambas quincenas sin operation_id ni dispositivo; rechaza sede ajena', async () => {
    const payloads: unknown[] = []
    let wrongSite = false
    const rpc = (async (action, payload) => {
      if (action === 'summary') return summaryFixture()
      payloads.push(payload)
      const r = exportFixture(payload.period)
      if (wrongSite) r.site.id = 'other'
      return r
    }) as typeof detailsRpc
    const store = new DetailsStore('u', 'token', rpc); await store.loadSummary()
    await store.export('current_biweekly'); await store.export('previous_biweekly')
    expect(payloads).toEqual([{ period: 'current_biweekly' }, { period: 'previous_biweekly' }])
    wrongSite = true
    await expect(store.export('current_biweekly')).rejects.toThrow()
  })
  test('Excel bajo demanda y sin contrato Control', async () => {
    const source = await Bun.file('src/features/solog/detalles/detalles.export.ts').text()
    expect(source).toContain("sheet: 'Resumen'")
    expect(source).toContain("sheet: 'Diferencias'")
    expect(source).toContain("await import('write-excel-file/browser')")
    expect(source).not.toContain('rpc_solog_control_export')
    expect(source).not.toContain('balance_valorizado')
    const hook = await Bun.file('src/features/solog/detalles/detalles.export.hook.ts').text()
    expect(hook).toContain("await import('./detalles.export')")
    expect(hook).toContain('generation === store.generation')
  })
})
