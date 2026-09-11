import { describe, expect, test } from 'bun:test'
import { CatalogStore, type CatalogMutateTransport, type CatalogReadTransport } from '../src/features/solog/admin/catalogo/admin.catalogo.store'
import { GroupsStore, type GroupsMutateTransport, type GroupsReadTransport } from '../src/features/solog/admin/grupos/admin.grupos.store'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { type adminRpc } from '../src/features/solog/admin/admin.v2'
import type { MasterDataRevisionCoordinator } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-11T12:00:00.000Z'
function coordinator(): MasterDataRevisionCoordinator & { refetches: number } { const floors = { groups: 3, catalog: 10, categories: 1 }; return { refetches: 0, observeRevisions(value) { for (const key of ['groups', 'catalog', 'categories'] as const) if (value[key] !== undefined) floors[key] = Math.max(floors[key], value[key]!) }, revisionFloors: () => ({ ...floors }), async refetchMasterData() { this.refetches++; return { contract_version: 1, generated_at: now, complete: true, categories: [], groups: [], products: [], setup_required: [], totals: { categories: 0, groups: 0, products: 0, included: 0, excluded: 0 }, revisions: { ...floors } } } } }

describe('Coordinación Master Data V1', () => {
  test('Catálogo toma expected revisions de floors y staging no refetch master', async () => {
    const shared = coordinator(), calls: Record<string, unknown>[] = []
    const read = (async () => ({ contract_version: 3 as const, generated_at: now, revisions: { catalog: 11, groups: 3 }, catalog: { version_actual: null, publicado_at: null, incluidos: 0, excluidos: 0, total: 0 } })) as CatalogReadTransport
    const mutate = (async (_action: string, payload: Record<string, unknown>) => { calls.push(payload); return { contract_version: 3 as const, generated_at: now, replay: false, result: {}, revisions: { catalog: 12, groups: 3 } } }) as CatalogMutateTransport
    const store = new CatalogStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate, undefined, shared)
    await store.load('status', {})
    await store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'approve' })
    expect(calls[0]).toMatchObject({ expected_catalog_revision: 11, expected_groups_revision: 3 })
    expect(shared.revisionFloors().catalog).toBe(12)
    expect(shared.refetches).toBe(0)
  })
  test('Grupos toma floors centrales y una mutación confirmada refetch master', async () => {
    const shared = coordinator(), calls: Record<string, unknown>[] = []
    const read = (async () => ({ contract_version: 1 as const, generated_at: now, revisions: { groups: 3, catalog: 10 }, groups_active: 0, groups_unique: 0, groups_grouped: 0 })) as GroupsReadTransport
    const mutate = (async (_action: string, payload: Record<string, unknown>) => { calls.push(payload); return { contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { groups: 4, catalog: 10 } } }) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate, shared)
    await store.mutation('make_unique', { c_interno: 100 })
    expect(calls[0]).toMatchObject({ expected_groups_revision: 3, expected_catalog_revision: 10 })
    expect(shared.revisionFloors().groups).toBe(4)
    expect(shared.refetches).toBe(1)
  })
})

describe('Floors centrales de lecturas', () => {
  test('rechaza lectura Catálogo inferior al floor del coordinador', async () => {
    const shared = coordinator()
    shared.observeRevisions({ catalog: 12 })
    const read = (async () => ({ contract_version: 3 as const, generated_at: now, revisions: { catalog: 11, groups: 3 }, catalog: { version_actual: null, publicado_at: null, incluidos: 0, excluidos: 0, total: 0 } })) as CatalogReadTransport
    const store = new CatalogStore('admin-test', () => bootstrapFixture(), () => {}, read, undefined, undefined, shared)
    await expect(store.load('status', {})).rejects.toThrow('obsoleta')
    expect(store.peek('status', {}).data).toBeUndefined()
  })
  test('rechaza lectura Grupos inferior al floor del coordinador', async () => {
    const shared = coordinator()
    shared.observeRevisions({ groups: 4 })
    const read = (async () => ({ contract_version: 1 as const, generated_at: now, revisions: { groups: 3, catalog: 10 }, groups_active: 0, groups_unique: 0, groups_grouped: 0 })) as GroupsReadTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), () => {}, read, undefined, shared)
    await expect(store.load('status', {})).rejects.toThrow('obsoleta')
    expect(store.peek('status', {}).data).toBeUndefined()
  })
  test('AdminStore contrasta grupos contra el floor compartido tras su avance', async () => {
    const rpc = (async () => ({ ...bootstrapFixture(), revisions: { groups: 3, catalog: 5 } })) as adminRpc
    const store = new AdminStore('admin-test', rpc)
    store.masterData.observeRevisions({ groups: 4 })
    await expect(store.load('bootstrap', {})).rejects.toThrow('obsoleto')
    expect(store.masterData.revisionFloors().groups).toBe(4)
  })
})