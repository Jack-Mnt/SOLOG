import { describe, expect, test } from 'bun:test'
import { GroupsStore, type GroupsMutateTransport } from '../src/features/solog/admin/grupos/admin.grupos.store'
import type { MasterDataRevisionCoordinator } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const revisions = { groups: 3, catalog: 7 }
const envelope = () => ({ contract_version: 1 as const, generated_at: '2026-09-11T12:00:00.000Z', revisions })
function coordinator(): MasterDataRevisionCoordinator {
  const floors = { ...revisions, categories: 1 }
  return { observeRevisions(value) { Object.assign(floors, value) }, revisionFloors: () => ({ ...floors }), async refetchMasterData() { return {} as never }, async invalidateAndRefetchMasterData() { return {} as never } }
}

describe('Grupos V1: valorizado inmediato', () => {
  test('envía valuation_save con revisiones autoritativas y refresca después de guardar', async () => {
    const calls: Array<{ action: string; payload: Record<string, unknown> }> = []
    const mutate = (async (action: string, payload: Record<string, unknown>) => { calls.push({ action, payload: structuredClone(payload) }); return { ...envelope(), revisions: { groups: 4, catalog: 7 }, replay: false, result: {} } }) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), coordinator(), () => {}, mutate)
    await store.mutation('valuation_save', { grupo_id: 'group-1', enabled: true, unidades_por_paquete: 12, precio_paquete: 42 })
    expect(calls[0].payload).toMatchObject({ grupo_id: 'group-1', enabled: true, unidades_por_paquete: 12, precio_paquete: 42, expected_groups_revision: 3, expected_catalog_revision: 7 })
    expect(store.revisions()).toEqual({ groups: 4, catalog: 7 })
  })
  test('desactiva sin enviar nulls y libera la intención ante staging conflict o NOOP', async () => {
    let attempt = 0
    const mutate = (async (action: string, payload: Record<string, unknown>) => { void action; void payload; if (!attempt++) throw Object.assign(new Error('Staging'), { code: 'SOLOG_CATALOG_STAGING_CONFLICT' }); throw Object.assign(new Error('Noop'), { code: 'SOLOG_GROUP_VALUATION_NOOP' }) }) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), coordinator(), () => {}, mutate)
    await expect(store.mutation('valuation_save', { grupo_id: 'group-1', enabled: false })).rejects.toThrow('Staging')
    expect(store.intent()).toBeUndefined()
    await expect(store.mutation('valuation_save', { grupo_id: 'group-1', enabled: false })).rejects.toThrow('Noop')
    expect(store.intent()).toBeUndefined()
  })
  test('la pantalla usa el modal compartido y no reintroduce Master V2', async () => {
    const source = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    expect(source).toContain('ValuationDialog')
    expect(source).toContain("store.mutation('valuation_save'")
    expect(source).toContain('onRetry={store.intent() ? retry : undefined}')
    for (const forbidden of ['rpc_solog_admin_master_v2', 'rpc_solog_admin_master_read_v2', 'group_change_save', 'group_products', 'update_package_price']) expect(source).not.toContain(forbidden)
  })
})
