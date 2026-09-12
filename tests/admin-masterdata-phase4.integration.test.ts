import { describe, expect, test } from 'bun:test'
import { CatalogStore, type CatalogMutateTransport, type CatalogPublishTransport, type CatalogReadTransport } from '../src/features/solog/admin/catalogo/admin.catalogo.store'
import type { CatalogMutationAction } from '../src/features/solog/admin/catalogo/admin.catalogo.v3'
import { GroupsStore, type GroupsMutateTransport } from '../src/features/solog/admin/grupos/admin.grupos.store'
import type { GroupsMutationAction } from '../src/features/solog/admin/grupos/admin.grupos.v1'
import { MasterDataStore, type MasterDataMutateTransport, type MasterDataReadTransport, type MasterDataRevisionCoordinator } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import type { MasterDataMutationAction, MasterDataSnapshot } from '../src/features/solog/admin/masterdata/admin.masterdata.v1'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-12T12:00:00.000Z'
const fingerprint = 'a'.repeat(64)
const snapshot = (revisions = { groups: 3, catalog: 10, categories: 1 }): MasterDataSnapshot => ({
  contract_version: 1,
  generated_at: now,
  complete: true,
  categories: [{ id: 'cat-a', nombre: 'A', orden: 1 }, { id: 'cat-b', nombre: 'B', orden: 2 }],
  groups: [{ id: 'group-a', nombre: 'Grupo A', categoria_id: 'cat-a', precio: 2, unidades_por_paquete: null, precio_paquete: null }],
  products: [{ c_interno: 100, producto: 'Producto', c_barras: null, marca: null, precio: 2, estado: 'Único', categoria_id: 'cat-a', grupo_id: 'group-a' }],
  setup_required: [{ cambio_id: 'change-a', propuesta_fingerprint: fingerprint, tipo: 'agregar_producto', c_interno: 101, producto: 'Nuevo', precio: 2, block_reason: 'configuracion_requerida' }],
  totals: { categories: 2, groups: 1, products: 1, included: 1, excluded: 0 },
  revisions,
})

function masterHarness() {
  let reads = 0
  let revisions = { groups: 3, catalog: 10, categories: 1 }
  const read = (async () => { reads++; return snapshot({ ...revisions }) }) as MasterDataReadTransport
  const master = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read)
  return { master, reads: () => reads, revisions, setRevisions(next: Partial<typeof revisions>) { revisions = { ...revisions, ...next }; this.revisions = revisions } }
}

describe('Fase 4: integración transversal Admin Master Data', () => {
  test('Productos → Grupos → Catálogo → Productos comparte un único bootstrap vigente', async () => {
    const { master, reads } = masterHarness()
    await master.ensureLoaded()
    await master.ensureLoaded()
    expect(master.data().snapshot).toBeDefined()
    await master.ensureLoaded()
    await master.ensureLoaded()
    expect(reads()).toBe(1)
  })

  test('las cuatro mutaciones staging Catálogo avanzan floor sin invalidar Master Data', async () => {
    const harness = masterHarness()
    await harness.master.ensureLoaded()
    let catalogRevision = 10
    const actions: CatalogMutationAction[] = []
    const mutate = (async (action) => {
      actions.push(action)
      catalogRevision++
      return { contract_version: 3 as const, generated_at: now, replay: false, result: {}, revisions: { groups: 3, catalog: catalogRevision } }
    }) as CatalogMutateTransport
    const read = (async () => { throw new Error('La prueba no debe leer Catálogo.') }) as CatalogReadTransport
    const store = new CatalogStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate, undefined, harness.master)
    await store.mutation('proposal_action', { propuesta_fingerprint: fingerprint, action: 'approve' })
    await store.mutation('propose_product_state', { c_interno: 100, action: 'exclude' })
    await store.mutation('prepare_product', { propuesta_fingerprint: fingerprint, mode: 'existing_group', grupo_id: 'group-a', marca: null })
    await store.mutation('prepare_price', { propuesta_fingerprint: fingerprint, resolution: 'keep_structure', package_action: 'keep' })
    expect(actions).toEqual(['proposal_action', 'propose_product_state', 'prepare_product', 'prepare_price'])
    expect(harness.master.revisionFloors().catalog).toBe(14)
    expect(harness.master.data().snapshot?.revisions.catalog).toBe(10)
    expect(harness.reads()).toBe(1)
  })

  test('el overlay evita repetir estado/configuración confirmados y se reconcilia con un bootstrap nuevo', async () => {
    const harness = masterHarness()
    await harness.master.ensureLoaded()
    let revision = 10
    const mutate = (async () => ({ contract_version: 3 as const, generated_at: now, replay: false, result: {}, revisions: { groups: 3, catalog: ++revision } })) as CatalogMutateTransport
    const store = new CatalogStore('admin-test', () => bootstrapFixture(), () => {}, undefined, mutate, undefined, harness.master)
    await store.mutation('propose_product_state', { c_interno: 100, action: 'exclude' })
    await store.mutation('prepare_product', { propuesta_fingerprint: fingerprint, mode: 'new_unit', categoria_id: 'cat-a', marca: null })
    expect(store.confirmedProductState(100)).toBe('exclude')
    expect(store.productSetupPrepared(fingerprint)).toBe(true)
    harness.setRevisions({ catalog: 12 })
    await harness.master.refetchMasterData()
    expect(store.confirmedProductState(100)).toBeUndefined()
    expect(store.productSetupPrepared(fingerprint)).toBe(false)
  })

  test('cada mutación Grupos invalida y recarga el snapshot completo', async () => {
    const cases: Array<[GroupsMutationAction, Record<string, unknown>]> = [
      ['group_create', { nombre: 'Nuevo', categoria_id: 'cat-a', member_codes: [100, 101] }],
      ['group_update', { grupo_id: 'group-a', nombre: 'Grupo', categoria_id: 'cat-a' }],
      ['membership_move', { grupo_destino_id: 'group-a', member_codes: [100] }],
      ['make_unique', { c_interno: 100 }],
      ['valuation_save', { grupo_id: 'group-a', enabled: false }],
    ]
    for (const [action, payload] of cases) {
      const harness = masterHarness()
      await harness.master.ensureLoaded()
      const mutate = (async () => { harness.setRevisions({ groups: 4 }); return { contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { groups: 4, catalog: 10 } } }) as GroupsMutateTransport
      const store = new GroupsStore('admin-test', () => bootstrapFixture(), harness.master, () => {}, mutate)
      await store.mutation(action, payload as never)
      expect(harness.reads()).toBe(2)
      expect(harness.master.data().snapshot?.revisions.groups).toBe(4)
    }
  })

  test('cada mutación Categorías invalida y recarga el snapshot completo', async () => {
    const cases: Array<[MasterDataMutationAction, Record<string, unknown>]> = [
      ['category_create', { nombre: 'Nueva' }],
      ['category_rename', { category_id: 'cat-a', nombre: 'Renombrada' }],
      ['category_reorder', { category_ids: ['cat-b', 'cat-a'] }],
    ]
    for (const [action, payload] of cases) {
      let reads = 0
      let revision = 1
      const read = (async () => { reads++; return snapshot({ groups: 3, catalog: 10, categories: revision }) }) as MasterDataReadTransport
      const mutate = (async () => { revision = 2; return { contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { groups: 3, catalog: 10, categories: 2 } } }) as MasterDataMutateTransport
      const store = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate)
      await store.ensureLoaded()
      await store.mutation(action, payload as never)
      expect(reads).toBe(2)
      expect(store.data().snapshot?.revisions.categories).toBe(2)
    }
  })

  test('staging conflict de Grupos invalida Catálogo especializado sin tocar Master Data', async () => {
    let masterRefetches = 0, catalogInvalidations = 0
    const floors = { groups: 3, catalog: 10, categories: 1 }
    const coordinator: MasterDataRevisionCoordinator = {
      observeRevisions() {}, revisionFloors: () => ({ ...floors }),
      async refetchMasterData() { masterRefetches++; return snapshot() },
      async invalidateAndRefetchMasterData() { masterRefetches++; return snapshot() },
    }
    const mutate = (async () => { throw Object.assign(new Error('Staging'), { code: 'SOLOG_CATALOG_STAGING_CONFLICT' }) }) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), coordinator, () => {}, mutate, () => { catalogInvalidations++ })
    await expect(store.mutation('make_unique', { c_interno: 100 })).rejects.toThrow('Staging')
    expect(store.intent()).toBeUndefined()
    expect(masterRefetches).toBe(0)
    expect(catalogInvalidations).toBe(1)
  })

  test('publicación cerrada invalida/refetch y publicación incompleta conserva el mismo receipt', async () => {
    const harness = masterHarness()
    await harness.master.ensureLoaded()
    const ids: string[] = []
    const publish = (async (operationId: string) => {
      ids.push(operationId)
      const complete = ids.length > 1
      if (complete) harness.setRevisions({ groups: 4, catalog: 11 })
      return { ok: true as const, codigo: 'CATALOG_PUBLISHED', operation_id: operationId, replay: complete, completion_recorded: complete, version: 2, hash: 'hash', storage_path: 'catalog.json', productos: 1, grupos_activos: 1, cambios_incorporados: 1 }
    }) as CatalogPublishTransport
    const store = new CatalogStore('admin-test', () => bootstrapFixture(), () => {}, undefined, undefined, publish, harness.master)
    expect((await store.publish()).completion_recorded).toBe(false)
    expect(harness.reads()).toBe(1)
    expect((await store.publish()).completion_recorded).toBe(true)
    expect(ids[1]).toBe(ids[0])
    expect(harness.reads()).toBe(2)
    expect(harness.master.data().snapshot?.revisions).toMatchObject({ groups: 4, catalog: 11 })
  })
})

test('Fase 4: superficies activas no conservan caminos de lectura sustituidos', async () => {
  const files = await Promise.all([
    Bun.file('src/features/solog/admin/productos/admin.productos.v1.tsx').text(),
    Bun.file('src/features/solog/admin/productos/admin.product-setup.dialog.tsx').text(),
    Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text(),
    Bun.file('src/features/solog/admin/grupos/admin.grupos.store.ts').text(),
    Bun.file('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx').text(),
  ])
  const active = files.join('\n')
  for (const legacy of ["useCatalogQuery('products'", "useCatalogQuery('reference'", 'useGroupsQuery', 'groupsRead(', 'group_detail']) expect(active).not.toContain(legacy)
  for (const specialized of ["useCatalogQuery('status'", "useCatalogQuery('proposals'", "useCatalogQuery('price_options'", "useCatalogQuery('publication_preview'"]) expect(active).toContain(specialized)
})
