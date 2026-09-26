import { expect, test } from 'bun:test'

import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { validateAdminResponse, validateControlPayload, type adminRpc, type AdminPayloads } from '../src/features/solog/admin/admin.v2'
import { controlView } from '../src/features/solog/admin/control/admin.control.data'
// @ts-expect-error shared browser fixtures
import { responseFixture } from './fixtures/admin-v2.mjs'

const context = { site_id: 'site-a', period: 'today' as const }
const chronology = { site_id: 'site-a', group_id: 'group-0', period: 'current_biweekly' as const }
type MutableScopeFixture = { site_id: string; period: { key: string; from: string }; group: { id: string } }

function setup(transform = (_action: string, value: unknown) => value) {
  const calls: { action: string; payload: unknown }[] = []
  const rpc = (async (action, payload) => {
    calls.push({ action, payload })
    return validateAdminResponse(action, transform(action, responseFixture(action, payload)))
  }) as typeof adminRpc
  return { store: new AdminStore('admin-test', rpc), calls }
}

test('V10 dataset completo, payload mínimo y caché por sede/período/custom sin revalidación', async () => {
  const { store, calls } = setup()
  await store.load('bootstrap', {})
  for (const payload of [
    context,
    { ...context, period: 'current_biweekly' as const },
    context,
    { ...context, site_id: 'site-b' },
    { ...context, period: 'custom' as const, date_from: '2026-09-01', date_to: '2026-09-05' },
    context,
  ]) {
    expect((await store.load('control_groups', payload)).items).toHaveLength(101)
  }
  expect(calls.filter(call => call.action === 'control_groups')).toEqual([
    { action: 'control_groups', payload: context },
    { action: 'control_groups', payload: { ...context, period: 'current_biweekly' } },
    { action: 'control_groups', payload: { ...context, site_id: 'site-b' } },
    { action: 'control_groups', payload: { ...context, period: 'custom', date_from: '2026-09-01', date_to: '2026-09-05' } },
  ])
  store.dispose()
})

test('V10 rechaza filtros/paginación remotos, fechas incorrectas y período no quincenal del Eye', async () => {
  for (const key of ['state', 'search', 'page', 'page_size']) {
    expect(() => validateControlPayload('control_groups', { ...context, [key]: 0 })).toThrow()
  }
  for (const payload of [
    { ...context, date_from: '2026-09-01' },
    { ...context, period: 'custom' },
    { ...context, period: 'custom', date_from: '2026-02-30', date_to: '2026-03-01' },
    { ...context, period: 'custom', date_from: '2026-01-01', date_to: '2026-04-03' },
  ]) {
    expect(() => validateControlPayload('control_groups', payload)).toThrow()
  }
  expect(() => validateControlPayload('control_groups', { ...context, period: 'custom', date_from: '2026-01-01', date_to: '2026-04-02' })).not.toThrow()
  for (const period of ['today', 'last_week', 'custom']) {
    expect(() => validateControlPayload('control_chronology_view', { ...chronology, period })).toThrow()
  }
  const { store, calls } = setup()
  await store.load('bootstrap', {})
  await expect(store.load('control_groups', { ...context, page: 0 } as AdminPayloads['control_groups'])).rejects.toThrow('Payload')
  expect(calls).toHaveLength(1)
})

test('V10 resumen base estable, búsqueda + estado locales, 50 por página sin mutar dataset', () => {
  const data = validateAdminResponse('control_groups', responseFixture('control_groups', context))
  const original = JSON.stringify(data)
  const all = controlView(data.items, '', '', 'default', 0)
  expect(all.summary).toEqual({ total: 101, coincide: 26, pending_recount: 25, confirmed: 25, inconsistent: 25 })
  expect(all.rows).toHaveLength(50)
  expect(controlView(data.items, '', '', 'default', 1).rows).toHaveLength(50)
  expect(controlView(data.items, '', '', 'default', 2).rows.map(row => row.group_id)).toEqual(['group-100'])
  const filtered = controlView(data.items, 'Recontar', '  GRUPO 1 ', 'default', 0)
  expect(filtered.summary).toEqual(all.summary)
  expect(filtered.rows.map(row => row.group_id)).toEqual(['group-1', 'group-13', 'group-17'])
  expect(controlView(data.items, '', 'no existe', 'default', 0).rows).toHaveLength(0)
  expect(JSON.stringify(data)).toBe(original)
})

test('V10 cronología view se cachea por sede/grupo/quincena y conserva valores autoritativos', async () => {
  const { store, calls } = setup()
  await store.load('bootstrap', {})
  await store.load('control_groups', { ...context, period: 'previous_biweekly' })
  const result = await store.load('control_chronology_view', chronology)
  await store.load('control_chronology_view', chronology)
  await store.load('control_chronology_view', { ...chronology, period: 'previous_biweekly' })
  await store.load('control_chronology_view', { ...chronology, group_id: 'group-1' })
  expect(calls.filter(call => call.action === 'control_chronology_view')).toHaveLength(3)
  expect(result.chronology.map(row => row.state)).toEqual(['Inconsistente', 'Confirmada', 'Recontado', 'Coincide'])
  expect(result.chronology[0].event_at).toBe('2026-09-18T22:30:00Z')
  expect(result.chronology[1]).toMatchObject({ state: 'Confirmada', difference: 5, valued_difference: 110 })
  expect(result.group.latest_unit_price).toBe(42)
  store.dispose()
})

test('V10 rechaza versión, revisiones, campos ausentes, no finitos, duplicados y estados inválidos', () => {
  for (const action of ['control_groups', 'control_chronology_view'] as const) {
    const payload = action === 'control_groups' ? context : chronology
    for (const change of [
      (response: Record<string, unknown>) => { response.contract_version = 10 },
      (response: Record<string, unknown>) => { response.revisions = {} },
      (response: Record<string, unknown>) => { response.revisions = { operational: -1 } },
      (response: Record<string, unknown>) => { response.period = { key: 'bad', from: '2026-01-01', to: '2026-01-02' } },
    ]) {
      const response = responseFixture(action, payload)
      change(response)
      expect(() => validateAdminResponse(action, response)).toThrow()
    }
  }

  for (const key of ['group_id', 'category', 'origin_at', 'valued_difference']) {
    const response = responseFixture('control_groups', context)
    delete response.items[0][key]
    expect(() => validateAdminResponse('control_groups', response)).toThrow()
  }
  const duplicateGroup = responseFixture('control_groups', context)
  duplicateGroup.items.push(duplicateGroup.items[0])
  expect(() => validateAdminResponse('control_groups', duplicateGroup)).toThrow()
  const invalidGroup = responseFixture('control_groups', context)
  invalidGroup.items[0].state = 'Recontado'
  expect(() => validateAdminResponse('control_groups', invalidGroup)).toThrow()

  const chronologyMissing = responseFixture('control_chronology_view', chronology)
  delete chronologyMissing.chronology[0].found_difference
  expect(() => validateAdminResponse('control_chronology_view', chronologyMissing)).toThrow()
  const chronologyDuplicate = responseFixture('control_chronology_view', chronology)
  chronologyDuplicate.chronology.push(chronologyDuplicate.chronology[0])
  expect(() => validateAdminResponse('control_chronology_view', chronologyDuplicate)).toThrow()
  const chronologyPrice = responseFixture('control_chronology_view', chronology)
  chronologyPrice.group.latest_unit_price = Infinity
  expect(() => validateAdminResponse('control_chronology_view', chronologyPrice)).toThrow()
})

test('V10 valida sede, grupo, período y custom antes de publicar en caché', async () => {
  for (const [action, payload, change] of [
    ['control_groups', context, (response: MutableScopeFixture) => { response.site_id = 'site-b' }],
    ['control_groups', context, (response: MutableScopeFixture) => { response.period.key = 'last_week' }],
    ['control_groups', { ...context, period: 'custom', date_from: '2026-09-01', date_to: '2026-09-03' }, (response: MutableScopeFixture) => { response.period.from = '2026-09-02' }],
    ['control_chronology_view', chronology, (response: MutableScopeFixture) => { response.group.id = 'other' }],
    ['control_chronology_view', chronology, (response: MutableScopeFixture) => { response.period.key = 'previous_biweekly' }],
  ] as const) {
    const { store } = setup((current, response) => {
      if (current === action) change(response as MutableScopeFixture)
      return response
    })
    await store.load('bootstrap', {})
    await expect(store.load(action, payload as never)).rejects.toThrow()
    expect(store.peek(action, payload as never).data).toBeUndefined()
    store.dispose()
  }
})

test('V10 revisiones nuevas no recargan datasets ya cacheados; refresh y revocación sí los limpian', async () => {
  let revision = 10
  let forbidden = false
  const { store, calls } = setup((action, value) => {
    const response = value as { revisions: { operational?: number } }
    if (forbidden && action === 'daily_detail_bootstrap') throw Object.assign(new Error('revocado'), { code: 'SOLOG_ADMIN_ROLE_REQUIRED' })
    if (action !== 'bootstrap' && response.revisions.operational !== undefined) response.revisions.operational = revision
    return response
  })
  await store.load('bootstrap', {})
  const base = await store.load('control_groups', context)
  revision = 11
  await store.load('control_chronology_view', chronology)
  expect(await store.load('control_groups', context)).toBe(base)
  expect(calls.filter(call => call.action === 'control_groups')).toHaveLength(1)
  store.refresh()
  expect(store.peek('control_groups', context).data).toBeUndefined()
  await store.load('control_groups', context)
  forbidden = true
  await expect(store.load('daily_detail_bootstrap', { site_id: 'site-a', origin_date: '2026-09-03', stock_class: 'positive' })).rejects.toThrow()
  expect(store.peek('control_groups', context).data).toBeUndefined()
  expect(store.bootstrap).toBeNull()
})

test('V10 Control no consume acciones anteriores ni envía filtros locales', async () => {
  const source = await Bun.file('src/features/solog/admin/control/admin.control.v2.tsx').text()
  expect(source).not.toMatch(/["']control_(page|detail|chronology)["']/)
  expect(source).toMatch(/["']control_groups["']/)
  expect(source).toMatch(/["']control_chronology_view["']/)
  expect(source).not.toContain('ControlChronologyPeriod')
  expect(source).toContain('period: "current_biweekly"')
  expect(source).toContain('period: "previous_biweekly"')
  expect(source).toContain('{ enabled: showPrevious }')
  expect(source).toContain('latest_unit_price')
  expect(source).toContain('row.initial_difference')
  expect(source).toContain('row.found_difference')
  expect(source).not.toContain('row.valuation')
  expect(source).toContain('role="switch"')
  expect(source).toContain('aria-label="Incluir quincena anterior"')
  expect(source).toContain('className="admin-control-chronology__timeline"')
  expect(source).not.toContain('Aplicar filtros')
  expect(source).not.toContain('<select')
  expect(source).not.toContain('setPayload')
  expect(source).not.toContain('confirmedRange')
  expect(source).toMatch(/!site\s*\|\|\s*invalid\s*\?\s*null/s)
  expect(source).toContain('No hay registros en la cronología.')
})

test('Control retiró llamadas legacy y comparte modal de exportación', async () => {
  const api = await Bun.file('src/features/solog/api.ts').text()
  expect(api).not.toMatch(/rpc_solog_control(?:'|_detalle'|_export')/)
  for (const path of ['dashboard/admin.dashboard.v2.tsx', 'control/admin.control.v2.tsx']) {
    expect(await Bun.file('src/features/solog/admin/' + path).text()).toContain('AdminExportDialog')
  }
})
