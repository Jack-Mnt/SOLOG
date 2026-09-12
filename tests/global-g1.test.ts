import { expect, test } from 'bun:test'
import { DetailsStore } from '../src/features/solog/detalles/detalles.store'
import type { detailsRpc } from '../src/features/solog/detalles/detalles.v2'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import type { adminRpc } from '../src/features/solog/admin/admin.v2'
import { ManagementStore } from '../src/features/solog/admin/admin.management.store'
import { ManagementError, type managementRead, type managementMutate } from '../src/features/solog/admin/admin.management.v2'
import { SologApiError } from '../src/features/solog/errors'
import { summaryFixture, detailFixture } from './fixtures/details-v2.mjs'
import { bootstrapFixture, responseFixture } from './fixtures/admin-v2.mjs'
import { managementFixture, mutationFixture } from './fixtures/admin-management.mjs'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('G1 Detalles error de acceso tardío no borra resumen de otra sede', async () => {
  const delayed = deferred<unknown>(); const fixture = summaryFixture()
  const store = new DetailsStore('user', 'token', (async a =>
    a === 'summary' ? structuredClone(fixture) : delayed.promise) as typeof detailsRpc)
  await store.loadSummary(); const old = store.loadDetail('case-0')
  fixture.site.id = 'site-2'; await store.loadSummary()
  delayed.reject(new SologApiError('SOLOG_AUTH_REQUIRED'))
  await expect(old).rejects.toThrow('contexto')
  expect(store.summary?.site.id).toBe('site-2')
})

test('G1 Detalles no restaura autorización de dispositivo antigua', async () => {
  const fixture = summaryFixture()
  const store = new DetailsStore('user', 'token', (async () => structuredClone(fixture)) as typeof detailsRpc)
  await store.loadSummary(); const previous = store.summary
  fixture.revisions.devices--
  await expect(store.loadSummary()).rejects.toThrow('obsoleta')
  expect(store.summary).toBe(previous)
})

test('G1 Detalles summary invalidado por revisión no vuelve a publicarse', async () => {
  const delayed = deferred<unknown>(); let summaries = 0
  const store = new DetailsStore('user', 'token', (async a => {
    if (a === 'summary') return ++summaries === 1 ? summaryFixture() : delayed.promise
    const detail = detailFixture(); detail.revisions.operational = 11; return detail
  }) as typeof detailsRpc)
  await store.loadSummary(); const old = store.loadSummary()
  await store.loadDetail('case-0')
  delayed.resolve(summaryFixture())
  await expect(old).rejects.toThrow('invalidada')
  expect(store.operational).toBe(11)
})

test('G1 Admin bootstrap obsoleto no reemplaza identidad ni acceso', async () => {
  let stale = false
  const store = new AdminStore('admin-test', (async (a,p) => {
    const r = responseFixture(a,p)
    if (a === 'bootstrap' && stale) { r.identity.nombre = 'Obsoleto'; r.revisions.groups-- }
    return r
  }) as typeof adminRpc)
  await store.load('bootstrap', {}); const previous = store.bootstrap
  stale = true; store.retry('bootstrap', {})
  await expect(store.load('bootstrap', {})).rejects.toThrow('obsoleto')
  expect(store.bootstrap).toBe(previous)
})

test('G1 error Admin invalidado no resucita ni elimina contexto nuevo', async () => {
  const delayed = deferred<unknown>(); let first = true
  const store = new AdminStore('admin-test', (async (a,p) => {
    if (a === 'daily_detail' && first) { first = false; return delayed.promise }
    return responseFixture(a,p)
  }) as typeof adminRpc)
  await store.load('bootstrap', {})
  const payload = { site_id: 'site-a', origin_date: '2026-09-03' }
  const old = store.load('daily_detail', payload)
  store.retry('daily_detail', payload); const fresh = await store.load('daily_detail', payload)
  delayed.reject(new ManagementError('SOLOG_SITE_FORBIDDEN'))
  await expect(old).rejects.toThrow('FORBIDDEN')
  expect(store.bootstrap).not.toBeNull(); expect(store.peek('daily_detail', payload).data).toBe(fresh)
})

test('G1 error maestro invalidado no revoca un acceso actualizado', async () => {
  const delayed = deferred<unknown>(); let first = true, forbidden = false
  const store = new ManagementStore('admin-test', bootstrapFixture, (_, denied) => { forbidden ||= !!denied },
    (async (a,p) => { if (first) { first = false; return delayed.promise } return managementFixture(a,p) }) as typeof managementRead)
  const old = store.load('status', {}); store.refresh()
  const fresh = await store.load('status', {})
  delayed.reject(new ManagementError('SOLOG_ADMIN_ROLE_REQUIRED'))
  await expect(old).rejects.toThrow('ROLE')
  expect(forbidden).toBe(false); expect(store.peek('status', {}).data).toBe(fresh)
})

test('G1 resultado de mutación no cruza un cambio de acceso', async () => {
  const delayed = deferred<unknown>(); let payload = {}
  const store = new ManagementStore('admin-test', bootstrapFixture, () => {}, undefined,
    (async (_a,p) => { payload = p; return delayed.promise }) as typeof managementMutate)
  const old = store.mutation('update_package_price', { grupo_id: 'g', precio_paquete: 12 }, 3)
  store.resetAccess(); delayed.resolve(mutationFixture('update_package_price', payload))
  await expect(old).rejects.toThrow('cambio de acceso')
  expect(store.results.size).toBe(0); expect(store.intent('master')).toBeUndefined()
})
