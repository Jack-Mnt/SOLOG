import { describe, expect, test } from 'bun:test'
import { parseDetailsResponse, detailsDate } from '../src/features/solog/detalles/detalles.v2'
import { summaryFixture, historyFixture, detailFixture, exportFixture, detailsNow } from './fixtures/details-v2.mjs'
describe('D1 adaptador V4 y entrada aislada', () => {
  test('cinco contratos exactos sin wrapper genérico', () => {
    expect(parseDetailsResponse('summary', summaryFixture()).summary.periodo.porcentaje).toBe(75)
    expect(parseDetailsResponse('history', historyFixture()).page_size).toBe(100)
    expect(parseDetailsResponse('detail', detailFixture()).case.case_id).toBe('case-0')
    expect(parseDetailsResponse('export', exportFixture()).rows.length).toBe(2)
    expect(parseDetailsResponse('request_access', { contract_version: 2, generated_at: detailsNow, replay: true, status: 'pending', device_id: 'device-1', revisions: { devices: 3 } }).replay).toBe(true)
    expect(() => parseDetailsResponse('summary', { data: summaryFixture() })).toThrow()
    expect(() => parseDetailsResponse('summary', { ...summaryFixture(), contract_version: 1 })).toThrow()
  })
  test('dispositivo no autorizado y snapshot nulo permiten lectura', () => {
    const f = summaryFixture(); f.summary.ultimo_snapshot = null
    expect(parseDetailsResponse('summary', f).access.current_device_id).toBeNull()
  })
  test('API dedicada sin tablas, v1 ni payloads legacy', async () => {
    const api = await Bun.file('src/features/solog/detalles/detalles.v2.ts').text()
    expect(api).toContain("supabase.rpc('rpc_solog_details_v2', { p_action: action, p_payload: payload })")
    expect(api).not.toContain('.from(')
    expect(await Bun.file('src/features/solog/api.ts').text()).not.toContain("'rpc_solog_details'")
  })
  test('entrada directa previa a SologProvider, sin bootstrap general', async () => {
    const source = await Bun.file('src/protected-app.tsx').text()
    const start = source.indexOf('function AuthenticatedApp')
    const auth = source.slice(start)
    expect(auth.indexOf("pathname === '/detalles'")).toBeLessThan(auth.indexOf('<SologProvider>'))
    expect(await Bun.file('src/pages/detalles.tsx').text()).not.toContain('bootstrap')
    expect(source).toContain('<PanelLoader />')
  })
  test('días Lima y período backend obligatorios', () => {
    expect(detailsDate(Date.parse('2026-09-04T04:59:59Z'))).toBe('2026-09-03')
    expect(detailsDate(Date.parse('2026-09-04T05:00:00Z'))).toBe('2026-09-04')
    expect(() => parseDetailsResponse('history', { ...historyFixture(), date: '2026-09-02' })).toThrow()
  })
})
