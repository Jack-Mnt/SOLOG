import { describe, expect, test } from 'bun:test'
import { CatalogStore, type CatalogMutateTransport, type CatalogPublishTransport, type CatalogReadTransport } from '../src/features/solog/admin/catalogo/admin.catalogo.store'
import { GroupsStore, type GroupsMutateTransport, type GroupsReadTransport } from '../src/features/solog/admin/grupos/admin.grupos.store'
import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import { type adminRpc } from '../src/features/solog/admin/admin.v2'
import { MasterDataStore, type MasterDataReadTransport, type MasterDataRevisionCoordinator } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-11T12:00:00.000Z'
function coordinator(): MasterDataRevisionCoordinator & { refetches: number } {
  const floors = { groups: 3, catalog: 10, categories: 1 }
  const result = () => ({ contract_version: 1 as const, generated_at: now, complete: true as const, categories: [], groups: [], products: [], setup_required: [], totals: { categories: 0, groups: 0, products: 0, included: 0, excluded: 0 }, revisions: { ...floors } })
  return { refetches: 0, observeRevisions(value) { for (const key of ['groups', 'catalog', 'categories'] as const) if (value[key] !== undefined) floors[key] = Math.max(floors[key], value[key]!) }, revisionFloors: () => ({ ...floors }), async refetchMasterData() { this.refetches++; return result() }, async invalidateAndRefetchMasterData() { this.refetches++; return result() } }
}

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
  test('no reutiliza cache Catálogo inferior al coordinator', async () => {
    const shared = coordinator()
    let revision = 10, calls = 0
    const read = (async () => { calls++; return { contract_version: 3 as const, generated_at: now, revisions: { catalog: revision, groups: 3 }, catalog: { version_actual: null, publicado_at: null, incluidos: 0, excluidos: 0, total: 0 } } }) as CatalogReadTransport
    const store = new CatalogStore('admin-test', () => bootstrapFixture(), () => {}, read, undefined, undefined, shared)
    await store.load('status', {})
    shared.observeRevisions({ catalog: 11 })
    revision = 11
    expect(store.peek('status', {}).data).toBeUndefined()
    await store.load('status', {})
    expect(calls).toBe(2)
  })
  test('no reutiliza cache Grupos inferior al coordinator', async () => {
    const shared = coordinator()
    let revision = 3, calls = 0
    const read = (async () => { calls++; return { contract_version: 1 as const, generated_at: now, revisions: { groups: revision, catalog: 10 }, groups_active: 0, groups_unique: 0, groups_grouped: 0 } }) as GroupsReadTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), () => {}, read, undefined, shared)
    await store.load('status', {})
    shared.observeRevisions({ groups: 4 })
    revision = 4
    expect(store.peek('status', {}).data).toBeUndefined()
    await store.load('status', {})
    expect(calls).toBe(2)
  })
  test('mutación de Grupos invalida snapshot mientras espera refetch', async () => {
    let resolveRefresh!: (value: ReturnType<typeof emptyMaster>) => void
    const refresh = new Promise<ReturnType<typeof emptyMaster>>(resolve => { resolveRefresh = resolve })
    let reads = 0
    const emptyMaster = () => ({ contract_version: 1 as const, generated_at: now, complete: true as const, categories: [], groups: [], products: [], setup_required: [], totals: { categories: 0, groups: 0, products: 0, included: 0, excluded: 0 }, revisions: { groups: reads > 1 ? 4 : 3, catalog: 10, categories: 1 } })
    const masterRead = (async () => ++reads === 1 ? emptyMaster() : refresh) as MasterDataReadTransport
    const master = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, masterRead)
    await master.ensureLoaded()
    const groupsRead = (async () => ({ contract_version: 1 as const, generated_at: now, revisions: { groups: 3, catalog: 10 }, groups_active: 0, groups_unique: 0, groups_grouped: 0 })) as GroupsReadTransport
    const mutate = (async () => ({ contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { groups: 4, catalog: 10 } })) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), () => {}, groupsRead, mutate, master)
    const mutation = store.mutation('make_unique', { c_interno: 100 })
    await Promise.resolve()
    await Promise.resolve()
    expect(master.data().snapshot).toBeUndefined()
    resolveRefresh(emptyMaster())
    await mutation
    expect(master.data().snapshot?.revisions.groups).toBe(4)
  })
  test('publicación que avanza groups invalida cache Admin y preserva Control', async () => {
    const rpc = (async (action: string, payload: Record<string, unknown>) => {
      const { responseFixture } = await import('./fixtures/admin-v2.mjs')
      return responseFixture(action, payload)
    }) as adminRpc
    const store = new AdminStore('admin-test', rpc)
    await store.load('bootstrap', {})
    await store.load('dashboard_cards', {})
    const controlPayload = { site_id: 'site-a', period: 'today' as const }
    await store.load('control_groups', controlPayload)
    const masterRead = (async () => ({ contract_version: 1 as const, generated_at: now, complete: true as const, categories: [], groups: [], products: [], setup_required: [], totals: { categories: 0, groups: 0, products: 0, included: 0, excluded: 0 }, revisions: { groups: 4, catalog: 10, categories: 1 } })) as MasterDataReadTransport
    ;(store.masterData as unknown as { read: MasterDataReadTransport }).read = masterRead
    const publish = (async (operationId: string) => ({ ok: true as const, codigo: 'CATALOG_PUBLISHED', operation_id: operationId, replay: false, completion_recorded: true, version: 7, hash: 'hash', storage_path: 'catalog.json', productos: 1, grupos_activos: 1, cambios_incorporados: 1 })) as CatalogPublishTransport
    ;(store.catalog as unknown as { publishRpc: CatalogPublishTransport }).publishRpc = publish
    await store.catalog.publish()
    expect(store.peek('dashboard_cards', {}).data).toBeUndefined()
    expect(store.peek('control_groups', controlPayload).data).toBeDefined()
  })
})
