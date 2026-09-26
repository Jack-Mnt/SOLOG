import { expect, test } from 'bun:test'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { validateAdminResponse, type adminRpc } from '../src/features/solog/admin/admin.v2'
// @ts-expect-error shared JS fixture
import { responseFixture } from './fixtures/admin-v2.mjs'

const daily = { site_id: 'site-a', origin_date: '2026-09-03', stock_class: 'positive' as const }

test('respuesta tardía invalidada no reemplaza la respuesta nueva', async () => {
  let resolve!: (value: unknown) => void
  let first = true
  const rpc = (async (action, payload) => {
    if (action === 'daily_detail_bootstrap' && first) {
      first = false
      return new Promise(r => { resolve = r })
    }
    const response = responseFixture(action, payload)
    if (action !== 'bootstrap') response.revisions.operational = 11
    return response
  }) as typeof adminRpc
  const store = new AdminStore('admin-test', rpc)
  await store.load('bootstrap', {})
  const old = store.load('daily_detail_bootstrap', daily)
  await store.load('daily_detail_page', { ...daily, state: 'Coincide', page: 0 })
  const fresh = await store.load('daily_detail_bootstrap', daily)
  resolve(responseFixture('daily_detail_bootstrap', daily))
  await expect(old).rejects.toThrow('invalidada')
  expect(store.peek('daily_detail_bootstrap', daily).data).toBe(fresh)
  expect(store.peek('daily_detail_bootstrap', daily).error).toBeUndefined()
})

test('cambio global groups invalida datasets no preservados de ambas sedes sin modificar KPI', async () => {
  const rpc = (async (action, payload) => {
    const response = responseFixture(action, payload)
    if (action === 'shift_grid') response.revisions.groups = 4
    return response
  }) as typeof adminRpc
  const store = new AdminStore('admin-test', rpc)
  await store.load('bootstrap', {})
  await store.load('daily_detail_bootstrap', daily)
  await store.load('daily_detail_bootstrap', { ...daily, site_id: 'site-b' })
  await store.load('shift_grid', { site_id: 'site-a' })
  expect(store.peek('daily_detail_bootstrap', daily).data).toBeUndefined()
  expect(store.peek('daily_detail_bootstrap', { ...daily, site_id: 'site-b' }).data).toBeUndefined()
})

test('cambio de rol descarta datos incluso con revisiones iguales', async () => {
  let role = 'admin'
  const rpc = (async (action, payload) => {
    const response = responseFixture(action, payload)
    if (action === 'bootstrap') {
      response.identity.rol = role
      response.permissions.can_admin = role === 'admin'
    }
    return response
  }) as typeof adminRpc
  const store = new AdminStore('admin-test', rpc)
  await store.load('bootstrap', {})
  await store.load('daily_detail_bootstrap', daily)
  role = 'moderador'
  store.retry('bootstrap', {})
  await store.load('bootstrap', {})
  expect(store.peek('daily_detail_bootstrap', daily).data).toBeUndefined()
  expect(store.bootstrap?.identity.rol).toBe('moderador')
})

test('sesiones Auth distintas no comparten datos aunque coincidan filtros', async () => {
  const a = new AdminStore('admin-test', (async (action, payload) => responseFixture(action, payload)) as typeof adminRpc)
  const b = new AdminStore('other-user', (async (action, payload) => {
    const response = responseFixture(action, payload)
    if (action === 'bootstrap') response.identity.id = 'other-user'
    return response
  }) as typeof adminRpc)
  await a.load('bootstrap', {})
  await a.load('daily_detail_bootstrap', daily)
  await b.load('bootstrap', {})
  expect(b.peek('daily_detail_bootstrap', daily).data).toBeUndefined()
  expect(a.key('daily_detail_bootstrap', daily)).not.toBe(b.key('daily_detail_bootstrap', daily))
})

test('validación de contrato rechaza revisiones ausentes y campos actuales no finitos/incompletos', () => {
  for (const [action, payload] of [
    ['daily_detail_bootstrap', daily],
    ['control_chronology_view', { site_id: 'site-a', group_id: 'group-0', period: 'current_biweekly' }],
    ['export', { site_id: 'site-a', period: 'current_biweekly' }],
  ] as const) {
    const response = responseFixture(action, payload)
    response.revisions = {}
    expect(() => validateAdminResponse(action, response)).toThrow()
  }
  const detail = responseFixture('daily_detail_bootstrap', daily)
  delete detail.views.Coincide[0].stock
  expect(() => validateAdminResponse('daily_detail_bootstrap', detail)).toThrow()
  const chronology = responseFixture('control_chronology_view', { site_id: 'site-a', group_id: 'group-0', period: 'current_biweekly' })
  chronology.group.latest_unit_price = Infinity
  expect(() => validateAdminResponse('control_chronology_view', chronology)).toThrow()
  const exp = responseFixture('export', { site_id: 'site-a', period: 'current_biweekly' })
  exp.adjustments[0].valorizado = Infinity
  expect(() => validateAdminResponse('export', exp)).toThrow()
})

test('error de transporte permite retry explícito sin bucle de refetch', async () => {
  let calls = 0
  const store = new AdminStore('admin-test', (async (action, payload) => {
    if (action === 'daily_detail_bootstrap' && calls++ === 0) throw new Error('Network')
    return responseFixture(action, payload)
  }) as typeof adminRpc)
  await store.load('bootstrap', {})
  await expect(store.load('daily_detail_bootstrap', daily)).rejects.toThrow('Network')
  expect(store.peek('daily_detail_bootstrap', daily).error).toBe('Network')
  expect(calls).toBe(1)
  store.retry('daily_detail_bootstrap', daily)
  await store.load('daily_detail_bootstrap', daily)
  expect(calls).toBe(2)
})
