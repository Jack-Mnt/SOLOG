import { describe, expect, test } from 'bun:test'
import { MasterDataStore, type MasterDataMutateTransport, type MasterDataReadTransport } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import { MasterDataContractError, validateMasterDataBootstrap, validateMasterDataMutation } from '../src/features/solog/admin/masterdata/admin.masterdata.v1'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-11T12:00:00.000Z'
let revisions = { groups: 3, catalog: 10, categories: 1 }
const fixture = () => ({ contract_version: 1 as const, generated_at: now, complete: true as const, categories: [{ id: 'cat-1', nombre: 'Bebidas', orden: 0 }], groups: [{ id: 'group-1', nombre: 'Máscara', categoria_id: 'cat-1', precio: 3, unidades_por_paquete: null, precio_paquete: null }], products: [{ c_interno: 100, producto: 'Producto', c_barras: null, marca: null, precio: 3, estado: 'Único' as const, categoria_id: 'cat-1', grupo_id: 'group-1' }, { c_interno: 101, producto: 'Excluido', c_barras: null, marca: null, precio: 3, estado: 'Excluido' as const, categoria_id: 'cat-1', grupo_id: null }], setup_required: [], totals: { categories: 1, groups: 1, products: 2, included: 1, excluded: 1 }, revisions: { ...revisions } })
function setup(options: { mutate?: (action: string, payload: Record<string, unknown>) => unknown } = {}) {
  revisions = { groups: 3, catalog: 10, categories: 1 }
  const calls: Array<{ kind: string; action?: string; payload?: Record<string, unknown> }> = []
  const read = (async () => { calls.push({ kind: 'read' }); return fixture() }) as MasterDataReadTransport
  const mutate = (async (action, payload) => { calls.push({ kind: 'mutation', action, payload: structuredClone(payload) }); return options.mutate ? options.mutate(action, payload) : { contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { ...revisions, categories: ++revisions.categories } } }) as MasterDataMutateTransport
  return { store: new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate), calls }
}

describe('Master Data V1', () => {
  test('valida bootstrap completo, compactación nullable y relaciones', () => {
    expect(validateMasterDataBootstrap(fixture()).totals.products).toBe(2)
    expect(() => validateMasterDataBootstrap({ ...fixture(), complete: false })).toThrow(MasterDataContractError)
    expect(() => validateMasterDataBootstrap({ ...fixture(), totals: { ...fixture().totals, products: 3 } })).toThrow(MasterDataContractError)
    expect(() => validateMasterDataBootstrap({ ...fixture(), products: [{ ...fixture().products[0], grupo_id: 'missing' }] })).toThrow(MasterDataContractError)
  })
  test('deduplica bootstrap y deriva relaciones locales', async () => {
    const { store, calls } = setup()
    const [first, second] = await Promise.all([store.ensureLoaded(), store.ensureLoaded()])
    expect(first).toBe(second)
    expect(calls.filter(call => call.kind === 'read')).toHaveLength(1)
    const derived = store.data().derived!
    expect(derived.categoryById.get('cat-1')?.nombre).toBe('Bebidas')
    expect(derived.memberCountByGroupId.get('group-1')).toBe(1)
    expect(derived.derivedTypeByGroupId.get('group-1')).toBe('Único')
    expect(derived.compatibleCandidates('group-1').map(item => item.c_interno)).toEqual([100])
  })
  test('separa revision floors de las revisiones del snapshot', async () => {
    const { store, calls } = setup()
    await store.ensureLoaded()
    store.observeRevisions({ catalog: 11 })
    expect(store.revisionFloors()).toMatchObject({ catalog: 11, groups: 3, categories: 1 })
    expect(store.data().snapshot?.revisions).toMatchObject({ catalog: 10, groups: 3, categories: 1 })
    await store.ensureLoaded()
    expect(calls.filter(call => call.kind === 'read')).toHaveLength(1)
  })
  test('categorías usa expected floor, replay/retry exacto y refetch posterior', async () => {
    let attempts = 0
    const { store, calls } = setup({ mutate: () => { if (!attempts++) throw Object.assign(new Error('Lock'), { code: 'SOLOG_LOCK_CONFLICT_RETRYABLE' }); revisions.categories = 2; return { contract_version: 1 as const, generated_at: now, replay: true, result: {}, revisions: { ...revisions } } } })
    await store.ensureLoaded()
    await expect(store.mutation('category_create', { nombre: 'Nueva' })).rejects.toThrow('Lock')
    await store.retryMutation()
    const mutations = calls.filter(call => call.kind === 'mutation')
    expect(mutations[0].payload).toEqual(mutations[1].payload)
    expect(mutations[0].payload).toMatchObject({ expected_categories_revision: 1 })
    expect(calls.filter(call => call.kind === 'read')).toHaveLength(2)
    expect(store.data().snapshot?.revisions.categories).toBe(2)
  })
  test('conflicto descarta intención, refetch y obliga UUID nuevo', async () => {
    let attempt = 0
    const { store, calls } = setup({ mutate: () => { if (!attempt++) { revisions = { groups: 4, catalog: 11, categories: 2 }; throw Object.assign(new Error('Conflict'), { code: 'SOLOG_MASTERDATA_REVISION_CONFLICT' }) }; revisions.categories = 3; return { contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { ...revisions } } } })
    await store.ensureLoaded()
    await expect(store.mutation('category_rename', { category_id: 'cat-1', nombre: 'Nueva' })).rejects.toThrow('Conflict')
    expect(store.intent()).toBeUndefined()
    await store.mutation('category_rename', { category_id: 'cat-1', nombre: 'Nueva' })
    const mutations = calls.filter(call => call.kind === 'mutation')
    expect(mutations[0].payload?.operation_id).not.toBe(mutations[1].payload?.operation_id)
    expect(mutations[1].payload).toMatchObject({ expected_categories_revision: 2 })
  })
  test('valida reorder completo y no permite payloads ambiguos', () => {
    const base = { operation_id: crypto.randomUUID(), expected_categories_revision: 1 }
    expect(() => validateMasterDataMutation('category_reorder', { ...base, category_ids: ['a', 'b'] })).not.toThrow()
    expect(() => validateMasterDataMutation('category_reorder', { ...base, category_ids: ['a', 'a'] })).toThrow(MasterDataContractError)
  })
})

describe('Master Data V1: consistencia de snapshot y refetch', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
    return { promise, resolve, reject }
  }
  test('rechaza bootstrap inferior al floor sin reemplazar el snapshot válido', async () => {
    const { store } = setup()
    const valid = await store.ensureLoaded()
    store.observeRevisions({ groups: 4 })
    revisions.groups = 3
    await expect(store.refetchMasterData()).rejects.toThrow('obsoleto')
    expect(store.data().snapshot).toBe(valid)
    expect(store.revisionFloors().groups).toBe(4)
  })
  test('un refetch durante bootstrap en vuelo inicia una lectura posterior', async () => {
    const first = deferred<ReturnType<typeof fixture>>()
    const second = deferred<ReturnType<typeof fixture>>()
    let calls = 0
    const read = (async () => (++calls === 1 ? first.promise : second.promise)) as MasterDataReadTransport
    const store = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read)
    const initial = store.ensureLoaded()
    const refetch = store.refetchMasterData()
    first.resolve(fixture())
    await initial
    await Promise.resolve()
    expect(calls).toBe(2)
    revisions.groups = 4
    second.resolve(fixture())
    await expect(refetch).resolves.toMatchObject({ revisions: { groups: 4 } })
    expect(store.data().snapshot?.revisions.groups).toBe(4)
  })
  test('descarta respuesta tardía al disponer el contexto', async () => {
    const pending = deferred<ReturnType<typeof fixture>>()
    const read = (async () => pending.promise) as MasterDataReadTransport
    const store = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read)
    const request = store.ensureLoaded()
    store.dispose()
    pending.resolve(fixture())
    await expect(request).rejects.toThrow('descartado')
  })
  test('category_reorder exige la lista completa del snapshot antes de RPC', async () => {
    const categories = [{ id: 'cat-1', nombre: 'Bebidas', orden: 0 }, { id: 'cat-2', nombre: 'Lácteos', orden: 1 }]
    const calls: unknown[] = []
    const read = (async () => ({ ...fixture(), categories, totals: { ...fixture().totals, categories: 2 } })) as MasterDataReadTransport
    const mutate = (async (_action: string, payload: Record<string, unknown>) => { calls.push(payload); revisions.categories = 2; return { contract_version: 1 as const, generated_at: now, replay: false, result: {}, revisions: { ...revisions } } }) as MasterDataMutateTransport
    const store = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate)
    await store.ensureLoaded()
    await expect(store.mutation('category_reorder', { category_ids: ['cat-1'] })).rejects.toThrow('exactamente')
    await expect(store.mutation('category_reorder', { category_ids: ['cat-1', 'missing'] })).rejects.toThrow('exactamente')
    await expect(store.mutation('category_reorder', { category_ids: ['cat-1', 'cat-1'] })).rejects.toThrow('exactamente')
    expect(calls).toHaveLength(0)
    await store.mutation('category_reorder', { category_ids: ['cat-2', 'cat-1'] })
    expect(calls).toHaveLength(1)
  })
})
