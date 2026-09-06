import { expect, test } from 'bun:test'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { adminSiteLabel, orderedAdminSites, deviceAccessLabel } from '../src/features/solog/admin/admin.site-ui'
import type { adminRpc } from '../src/features/solog/admin/admin.v2'
// @ts-expect-error Shared browser fixture.
import { bootstrapFixture, responseFixture } from './fixtures/admin-v2.mjs'

test('Shell orders sites and aliases Casuarinas without changing IDs or input', () => {
  const sites = ['Casuarinas', 'Unidad', 'Divino', 'Huaca', 'Cutervo'].map((nombre, i) => ({ nombre, id: String(i) }))
  const before = structuredClone(sites)
  expect(orderedAdminSites(sites).map(site => adminSiteLabel(site.nombre))).toEqual(['Cutervo', 'Huaca', 'Divino', 'Unidad', 'Casua'])
  expect(orderedAdminSites(sites).at(-1)?.id).toBe('0')
  expect(sites).toEqual(before)
  expect(adminSiteLabel('Huaca')).toBe('Huaca')
})

test('Shell site selection is UI-only, retained across module loads, and scoped to this store', async () => {
  const calls: string[] = []
  const rpc = (async (action, payload) => { calls.push(action); return responseFixture(action, payload) }) as typeof adminRpc
  const store = new AdminStore('admin-test', rpc)
  await store.load('bootstrap', {})
  store.selectSite('site-b')
  expect(store.siteId).toBe('site-b')
  expect(calls).toEqual(['bootstrap'])
  await store.load('dashboard_cards', {})
  await store.load('control_page', { site_id: store.siteId, period: 'today', state: null, page: 0, page_size: 100 })
  expect(store.siteId).toBe('site-b')
  expect(store.peek('control_page', { site_id: 'site-b', period: 'today', state: null, page: 0, page_size: 100 }).data?.site_id).toBe('site-b')
  const other = new AdminStore('admin-test', rpc)
  await other.load('bootstrap', {})
  expect(other.siteId).toBe('site-a')
})

test('Shell does not accept unauthorized sites and falls back if access changes', async () => {
  const store = new AdminStore('admin-test', (async () => bootstrapFixture()) as typeof adminRpc)
  await store.load('bootstrap', {})
  store.selectSite('site-b')
  store.selectSite('foreign-site')
  expect(store.siteId).toBe('site-b')
  store.bootstrap!.allowed_sites = store.bootstrap!.allowed_sites.filter(site => site.id === 'site-a')
  expect(store.siteId).toBe('site-a')
  store.dispose()
  store.selectSite('site-b')
  expect(store.siteId).toBe('')
})

test('Device last access uses Lima today, 12-hour time and explicit missing access', () => {
  const now = Date.parse('2026-09-06T02:30:00Z')
  expect(deviceAccessLabel('2026-09-05T10:07:00Z', now)).toMatch(/^Hoy, 5:07 a/)
  expect(deviceAccessLabel('2026-09-05T22:07:00Z', now)).toMatch(/^Hoy, 5:07 p/)
  expect(deviceAccessLabel('2026-09-05T04:59:00Z', now)).not.toContain('Hoy')
  expect(deviceAccessLabel(null, now)).toBe('Sin acceso registrado')
})

test('Shell selection emits only on a valid change and never invalidates cached datasets', async () => {
  const store = new AdminStore('admin-test', (async (action, payload) => responseFixture(action, payload)) as typeof adminRpc)
  await store.load('bootstrap', {})
  const cards = await store.load('dashboard_cards', {})
  let emissions = 0
  const unsubscribe = store.subscribe(() => emissions++)
  store.selectSite('site-a')
  store.selectSite('site-b')
  store.selectSite('site-b')
  expect(emissions).toBe(1)
  expect(store.peek('dashboard_cards', {}).data).toBe(cards)
  unsubscribe()
})
