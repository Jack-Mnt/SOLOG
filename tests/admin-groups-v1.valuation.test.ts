import { describe, expect, test } from 'bun:test'
import { GroupsStore, type GroupsMutateTransport, type GroupsReadTransport } from '../src/features/solog/admin/grupos/admin.grupos.store'
import type { GroupsReadAction } from '../src/features/solog/admin/grupos/admin.grupos.v1'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const revisions = { groups: 3, catalog: 7 }
const envelope = () => ({ contract_version: 1 as const, generated_at: '2026-09-11T12:00:00.000Z', revisions })
const group = { id: 'group-1', nombre: 'Máscara', categoria_id: 'cat-1', categoria: 'Bebidas', precio: 5, unidades_por_paquete: null, precio_paquete: null, tipo: 'Agrupado' as const, member_count: 2 }
const product = { c_interno: 100, producto: 'Producto', marca: null, precio: 5, categoria_id: 'cat-1', categoria: 'Bebidas', estado: 'Agrupado' as const, grupo_id: 'group-1', grupo: 'Máscara' }
function readFixture(action: GroupsReadAction) { if (action === 'status') return { ...envelope(), groups_active: 1, groups_unique: 0, groups_grouped: 1 }; if (action === 'reference') return { ...envelope(), categories: [] }; if (action === 'group_detail') return { ...envelope(), group, members: [product, { ...product, c_interno: 101 }] }; return { ...envelope(), rows: action === 'groups' ? [group] : [product], limit: 50, offset: 0 } }

describe('Grupos V1: valorizado inmediato', () => {
  test('envía valuation_save con revisiones autoritativas y refresca después de guardar', async () => {
    const calls: Array<{ action: string; payload: Record<string, unknown> }> = []
    const read = (async (action: GroupsReadAction) => readFixture(action)) as GroupsReadTransport
    const mutate = (async (action: string, payload: Record<string, unknown>) => { calls.push({ action, payload: structuredClone(payload) }); return { ...envelope(), revisions: { groups: 4, catalog: 7 }, replay: false, result: {} } }) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate)
    await store.load('status', {})
    await store.mutation('valuation_save', { grupo_id: 'group-1', enabled: true, unidades_por_paquete: 12, precio_paquete: 42 })
    expect(calls[0].payload).toMatchObject({ grupo_id: 'group-1', enabled: true, unidades_por_paquete: 12, precio_paquete: 42, expected_groups_revision: 3, expected_catalog_revision: 7 })
    expect(store.revisions()).toEqual({ groups: 4, catalog: 7 })
    expect(store.peek('status', {}).data).toBeUndefined()
  })
  test('desactiva sin enviar nulls y libera la intención ante staging conflict o NOOP', async () => {
    let attempt = 0
    const read = (async (action: GroupsReadAction) => readFixture(action)) as GroupsReadTransport
    const mutate = (async (action: string, payload: Record<string, unknown>) => { void action; void payload; if (!attempt++) throw Object.assign(new Error('Staging'), { code: 'SOLOG_CATALOG_STAGING_CONFLICT' }); throw Object.assign(new Error('Noop'), { code: 'SOLOG_GROUP_VALUATION_NOOP' }) }) as GroupsMutateTransport
    const store = new GroupsStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate)
    await store.load('status', {})
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
