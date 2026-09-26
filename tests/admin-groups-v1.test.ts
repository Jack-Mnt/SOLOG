import { describe, expect, test } from 'bun:test'
import { GroupsStore, type GroupsMutateTransport } from '../src/features/solog/admin/grupos/admin.grupos.store'
import { GroupsContractError, validateGroupsMutation, type GroupsMutationResult } from '../src/features/solog/admin/grupos/admin.grupos.v1'
import type { MasterDataRevisionCoordinator } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'
const now = '2026-09-11T12:00:00.000Z'
let revisions = { groups: 3, catalog: 7 }
const envelope = () => ({ contract_version: 1 as const, generated_at: now, revisions: { ...revisions } })
function setup(options: { mutate?: (action: string, payload: Record<string, unknown>) => unknown } = {}) {
  revisions = { groups: 3, catalog: 7 }
  const auth = bootstrapFixture(), calls: Array<{ channel: string; action: string; payload: Record<string, unknown> }> = []
  const mutate = (async (action, payload) => { calls.push({ channel: 'mutation', action, payload: structuredClone(payload) }); return options.mutate ? options.mutate(action, payload) : { ...envelope(), replay: false, result: { codigo: 'OK' } } }) as GroupsMutateTransport
  let invalidations = 0, catalogInvalidations = 0
  const coordinator: MasterDataRevisionCoordinator = {
    observeRevisions(value) { if (value.groups !== undefined) revisions.groups = Math.max(revisions.groups, value.groups); if (value.catalog !== undefined) revisions.catalog = Math.max(revisions.catalog, value.catalog) },
    revisionFloors: () => ({ ...revisions, categories: 1 }),
    async refetchMasterData() { return {} as never },
    async invalidateAndRefetchMasterData() { invalidations++; return {} as never },
  }
  return { store: new GroupsStore('admin-test', () => auth, coordinator, () => {}, mutate, () => { catalogInvalidations++ }), calls, coordinator, invalidations: () => invalidations, catalogInvalidations: () => catalogInvalidations }
}
describe('Grupos V1 mutaciones', () => {
  test('exige ambos expected revisions y payloads V1 exactos', () => {
    const base = { operation_id: crypto.randomUUID(), expected_groups_revision: 3, expected_catalog_revision: 7 }
    expect(validateGroupsMutation('group_create', { ...base, nombre: 'Grupo', categoria_id: 'cat-1', member_codes: [100, 101] })).toMatchObject(base)
    expect(validateGroupsMutation('valuation_save', { ...base, grupo_id: 'group-1', enabled: false })).toMatchObject({ enabled: false })
    expect(() => validateGroupsMutation('group_create', { ...base, nombre: 'Grupo', categoria_id: 'cat-1', member_codes: [100] })).toThrow(GroupsContractError)
    expect(() => validateGroupsMutation('valuation_save', { ...base, grupo_id: 'group-1', enabled: true, unidades_por_paquete: 1, precio_paquete: 5 })).toThrow(GroupsContractError)
  })
  test('conserva operation_id y payload exacto solamente para retry retryable', async () => {
    let attempts = 0
    const { store, calls } = setup({ mutate: () => { if (!attempts++) throw Object.assign(new Error('Lock'), { code: 'SOLOG_LOCK_CONFLICT_RETRYABLE' }); return { ...envelope(), replay: true, result: {} } as GroupsMutationResult } })
    await expect(store.mutation('make_unique', { c_interno: 100 })).rejects.toThrow('Lock')
    await store.retryMutation()
    const mutations = calls.filter(call => call.channel === 'mutation')
    expect(mutations).toHaveLength(2)
    expect(mutations[0].payload).toEqual(mutations[1].payload)
  })
  test('conflicto de revisión recarga autoridad y una nueva intención usa otro operation_id', async () => {
    let attempts = 0
    const { store, calls, coordinator } = setup({ mutate: () => { if (!attempts++) { revisions = { groups: 4, catalog: 8 }; throw Object.assign(new Error('Revisión'), { code: 'SOLOG_MASTERDATA_REVISION_CONFLICT' }) }; return { ...envelope(), replay: false, result: {} } as GroupsMutationResult } })
    await expect(store.mutation('make_unique', { c_interno: 100 })).rejects.toThrow('Revisión')
    expect(store.intent()).toBeUndefined()
    expect(coordinator.revisionFloors()).toMatchObject({ groups: 4, catalog: 8 })
    await store.mutation('make_unique', { c_interno: 100 })
    const mutations = calls.filter(call => call.channel === 'mutation')
    expect(mutations[0].payload.operation_id).not.toBe(mutations[1].payload.operation_id)
    expect(mutations[1].payload).toMatchObject({ expected_groups_revision: 4, expected_catalog_revision: 8 })
  })
  test('staging conflict no se reintenta y libera la intención para una nueva operación', async () => {
    const { store, invalidations, catalogInvalidations } = setup({ mutate: () => { throw Object.assign(new Error('Staging'), { code: 'SOLOG_CATALOG_STAGING_CONFLICT' }) } })
    await expect(store.mutation('valuation_save', { grupo_id: 'group-1', enabled: false })).rejects.toThrow('Staging')
    expect(store.intent()).toBeUndefined()
    expect(invalidations()).toBe(0)
    expect(catalogInvalidations()).toBe(1)
  })
})
