import { describe, expect, test } from 'bun:test'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { validateAdminResponse, type adminRpc, type AdminAction } from '../src/features/solog/admin/admin.v2'
import { validCustomRange } from '../src/features/solog/admin/admin.v2.format'
import { buildAdminWorkbook } from '../src/features/solog/admin/control/admin.control.v2.export'
// @ts-expect-error shared JS fixture for browser and unit tests
import { responseFixture, exportFixture, bootstrapFixture } from './fixtures/admin-v2.mjs'

function setup(handler = responseFixture) {
  const calls: [AdminAction, unknown][] = []
  const rpc = (async (action, payload) => {
    calls.push([action, payload])
    return handler(action, payload)
  }) as typeof adminRpc
  return { store: new AdminStore('admin-test', rpc), calls }
}
const control = { site_id: 'site-a', period: 'today' as const }
const daily = { site_id: 'site-a', origin_date: '2026-09-03', stock_class: 'positive' as const }
const chronology = { site_id: 'site-a', group_id: 'group-0', period: 'current_biweekly' as const }

describe('A1 store administrativo v2', () => {
  test('bootstrap mínimo, deduplicado, sin datasets de módulos', async () => {
    const { store, calls } = setup()
    await Promise.all([store.load('bootstrap', {}), store.load('bootstrap', {})])
    await store.load('bootstrap', {})
    expect(calls).toEqual([['bootstrap', {}]])
    expect(store.bootstrap?.identity.rol).toBe('admin')
  })

  test('admin y moderador desde identidad backend, no metadata cliente', async () => {
    const { store } = setup(() => bootstrapFixture('moderador'))
    await store.load('bootstrap', {})
    expect(store.bootstrap?.permissions.can_admin).toBe(false)
  })

  test('rechaza identidad cruzada y sede no permitida', async () => {
    const { store } = setup()
    await expect(store.load('control_groups', control)).rejects.toThrow()
    await store.load('bootstrap', {})
    await expect(store.load('shift_grid', { site_id: 'other' })).rejects.toThrow()
    const other = new AdminStore('other', (async () => bootstrapFixture()) as typeof adminRpc)
    await expect(other.load('bootstrap', {})).rejects.toThrow('Identidad')
  })

  test('cache de módulo/sede/filtros persiste al regresar; no N+1', async () => {
    const { store, calls } = setup()
    await store.load('bootstrap', {})
    await store.load('dashboard_cards', {})
    await store.load('control_groups', control)
    await store.load('dashboard_cards', {})
    await store.load('control_groups', control)
    expect(calls).toHaveLength(3)
    await store.load('control_groups', { ...control, site_id: 'site-b' })
    expect(calls).toHaveLength(4)
  })

  test('refresh y salida descartan datos y respuestas pendientes', async () => {
    let resolve!: (value: unknown) => void
    const { store } = setup((action: string, payload: unknown) =>
      action === 'bootstrap' ? responseFixture(action, payload) : new Promise(r => { resolve = r }))
    await store.load('bootstrap', {})
    const pending = store.load('control_groups', control)
    store.refresh()
    resolve(responseFixture('control_groups', control))
    await expect(pending).rejects.toThrow('descartada')
    expect(store.peek('control_groups', control).data).toBeUndefined()
    store.dispose()
    await expect(store.load('bootstrap', {})).rejects.toThrow()
  })

  test('revisión operacional preserva datasets V10 y rechaza respuestas anteriores', async () => {
    let revision = 10
    const { store } = setup((action: string, payload: unknown) => {
      const result = responseFixture(action, payload)
      if (action === 'daily_detail_bootstrap' || action === 'daily_detail_page') result.revisions.operational = revision
      return result
    })
    await store.load('bootstrap', {})
    const cached = await store.load('control_groups', control)
    revision = 11
    await store.load('daily_detail_bootstrap', daily)
    expect(store.peek('control_groups', control).data).toBe(cached)
    revision = 10
    await expect(store.load('daily_detail_page', { ...daily, state: 'Coincide', page: 0 })).rejects.toThrow('anterior')
  })

  test('errores de autorización eliminan todo el estado operativo', async () => {
    const { store } = setup((action: string, payload: unknown) => {
      if (action === 'control_groups') throw Object.assign(new Error('Acceso revocado'), { code: 'SOLOG_ADMIN_ROLE_REQUIRED' })
      return responseFixture(action, payload)
    })
    await store.load('bootstrap', {})
    await store.load('dashboard_cards', {})
    await expect(store.load('control_groups', control)).rejects.toThrow()
    expect(store.bootstrap).toBeNull()
    expect(store.peek('dashboard_cards', {}).data).toBeUndefined()
  })
})

describe('A2 contratos actuales y proyección autoritativa', () => {
  test('payload grid incluye sede y admite default y ambas quincenas', async () => {
    const { store, calls } = setup()
    await store.load('bootstrap', {})
    for (const period of [undefined, 'current_biweekly', 'previous_biweekly'] as const) {
      const payload = { site_id: 'site-a', ...(period ? { period } : {}) }
      const result = await store.load('shift_grid', payload)
      expect(result.data.totals[0].percentage).toBe(30)
      expect(calls.at(-1)).toEqual(['shift_grid', payload])
    }
  })

  test('conserva Total distinto de suma de turnos y cero de otra sede', () => {
    const a = validateAdminResponse('shift_grid', responseFixture('shift_grid', { site_id: 'site-a' }))
    const b = validateAdminResponse('shift_grid', responseFixture('shift_grid', { site_id: 'site-b' }))
    expect(a.data.shifts.map(row => row.percentage)).toEqual([20, 20, 20])
    expect(a.data.totals[0].percentage).toBe(30)
    expect(b.data.totals[0].numerator).toBe(0)
    expect(b.data.totals).toHaveLength(1)
  })

  test('detalle diario optimizado se cachea por sede/origen/clase', async () => {
    const { store, calls } = setup()
    await store.load('bootstrap', {})
    await store.load('daily_detail_bootstrap', daily)
    await store.load('daily_detail_bootstrap', daily)
    expect(calls.filter(call => call[0] === 'daily_detail_bootstrap')).toHaveLength(1)
    await store.load('daily_detail_bootstrap', { ...daily, stock_class: 'zero' })
    expect(calls.filter(call => call[0] === 'daily_detail_bootstrap')).toHaveLength(2)
  })

  test('rechaza wrapper genérico, versión y scope incorrectos', async () => {
    expect(() => validateAdminResponse('shift_grid', { data: responseFixture('shift_grid') })).toThrow()
    expect(() => validateAdminResponse('bootstrap', { ...bootstrapFixture(), contract_version: 5 })).toThrow()
    const { store } = setup((action: string, payload: unknown) =>
      action === 'shift_grid' ? responseFixture(action, { site_id: 'site-b' }) : responseFixture(action, payload))
    await store.load('bootstrap', {})
    await expect(store.load('shift_grid', { site_id: 'site-a' })).rejects.toThrow('otra sede')
  })
})

describe('A3 Control actual y Excel', () => {
  test('dataset completo y cronología actual se cachean por scope', async () => {
    const { store, calls } = setup()
    await store.load('bootstrap', {})
    expect((await store.load('control_groups', control)).items).toHaveLength(101)
    await store.load('control_groups', control)
    expect(calls.filter(call => call[0] === 'control_groups')).toHaveLength(1)
    await store.load('control_chronology_view', chronology)
    await store.load('control_chronology_view', chronology)
    expect(calls.filter(call => call[0] === 'control_chronology_view')).toHaveLength(1)
  })

  test('custom permite 92 días y rechaza rango inválido o superior', () => {
    expect(validCustomRange('2026-01-01', '2026-04-02')).toBe(true)
    expect(validCustomRange('2026-01-01', '2026-04-03')).toBe(false)
    expect(validCustomRange('2026-02-30', '2026-03-02')).toBe(false)
    expect(validCustomRange('2026-09-03', '2026-09-02')).toBe(false)
  })

  test('cada export es autoritativa bajo demanda, sin operation_id', async () => {
    const { store, calls } = setup()
    await store.load('bootstrap', {})
    const payload = { site_id: 'site-a', period: 'previous_biweekly' as const }
    await store.load('export', payload)
    await store.load('export', payload)
    expect(calls.filter(call => call[0] === 'export')).toEqual([['export', payload], ['export', payload]])
  })

  test('cinco hojas, datos recibidos sin reselección ni valorización de inconsistentes', () => {
    const raw = exportFixture()
    const workbook = buildAdminWorkbook(raw)
    expect(workbook.sheets).toEqual(['Resumen', 'Ajustes', 'Por recontar', 'Inconsistentes', 'Todas'])
    const headers = workbook.data[3][0].map((cell: unknown) => (cell as { value: unknown }).value)
    expect(headers).not.toContain('Valorizado (S/)')
    expect(headers).not.toContain('Stock posterior')
    expect(headers).toContain('Teórico de reconteo')
    expect(workbook.data[1]).toHaveLength(raw.adjustments.length + 1)
    expect(workbook.data[1][1][6]).toMatchObject({ value: -2 })
    raw.adjustments = []
    expect(buildAdminWorkbook(raw).data[1]).toHaveLength(1)
  })
})
