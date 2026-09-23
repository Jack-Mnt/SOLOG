import { describe, expect, test } from 'bun:test'
import { CatalogStore, type CatalogMutateTransport, type CatalogPublishTransport, type CatalogReadTransport } from '../src/features/solog/admin/catalogo/admin.catalogo.store'
import type { CatalogMutationResult, CatalogReadAction } from '../src/features/solog/admin/catalogo/admin.catalogo.v4'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-21T12:00:00.000Z'
let revisions = { catalog: 5, groups: 9 }
const envelope = () => ({ contract_version: 4 as const, generated_at: now, revisions: { ...revisions } })
const proposal = { propuesta_fingerprint: 'a'.repeat(64), cambio_id: 'change-1', c_interno: 100, tipo: 'precio', estado: 'pendiente', origen: 'automatico', seccion: 'urgente', datos: {}, producto: 'Producto', sedes: [], occurrence_count: 1, first_seen_at: now, last_seen_at: now, catalogo_actual: { producto: 'Producto', c_barras: null, precio: 2, marca: null, estado: 'Agrupado', categoria: 'Categoría', grupo: 'Grupo' }, stale: false, publicable: null, block_reason: null, setup: null, price_resolution: null, aprobado_at: null, ignorado_at: null, version_aplicada: null, incorporado_at: null }

function fixture(action: CatalogReadAction, payload: Record<string, unknown> = {}) {
  if (action === 'status') return { ...envelope(), catalog: { version_actual: 6, publicado_at: now, incluidos: 1, excluidos: 0, total: 1 } }
  if (action === 'reference') return { ...envelope(), categories: [], groups: [] }
  if (action === 'proposals') {
    const estado = payload.estado ?? 'pendiente'
    return { ...envelope(), estado, rows: [{ ...proposal, estado, publicable: estado === 'aprobado' ? true : null }], total: 1, complete: true as const, counts: { pendiente: estado === 'pendiente' ? 1 : 0, aprobado: estado === 'aprobado' ? 1 : 0, ignorado: estado === 'ignorado' ? 1 : 0, incorporado: estado === 'incorporado' ? 1 : 0 } }
  }
  if (action === 'products') return { ...envelope(), rows: [], total: 0, complete: true as const, setup_required: [] }
  if (action === 'price_options') return { ...envelope(), propuesta_fingerprint: payload.propuesta_fingerprint, change_id: 'change-1', change_state: 'pendiente', grupo: { id: 'group-1', nombre: 'Grupo', precio: 2, unidades_por_paquete: null, precio_paquete: null }, c_interno: 100, nuevo_precio: 3, members: [], options: ['keep_structure'], package_decision_required: false, prepared_resolution: null, equivalent_proposals: [], conflicting_proposals: [] }
  return { ...envelope(), preview: { ok: true, codigo: 'CATALOG_PREVIEW_READY', version_actual: 6, version_nueva: 7, schema_version: 2, sku_actuales: 1, sku_resultantes: 1, cambios_total: 0, cambios: { agregar_producto: 0, eliminar_producto: 0, excluir_producto: 0, reincorporar_producto: 0, nombre: 0, precio: 0, codigo: 0 }, change_ids: [], conflictos: [], errores: [] } }
}

function setup(options: { mutate?: (action: string, payload: Record<string, unknown>) => unknown; publish?: (operationId: string) => unknown } = {}) {
  revisions = { catalog: 5, groups: 9 }
  const auth = bootstrapFixture()
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = []
  const read = (async (action, payload) => { calls.push({ action, payload: structuredClone(payload) }); return fixture(action, payload) }) as CatalogReadTransport
  const mutate = (async (action, payload) => { calls.push({ action, payload: structuredClone(payload) }); return options.mutate ? options.mutate(action, payload) : { ...envelope(), replay: false, result: {} } }) as CatalogMutateTransport
  const publish = (async (operationId: string) => options.publish ? options.publish(operationId) : { ok: true, codigo: 'CATALOG_PUBLISHED', operation_id: operationId, replay: false, completion_recorded: true, version: 7, hash: 'hash', storage_path: 'catalog.json', productos: 1, grupos_activos: 1, cambios_incorporados: 1 }) as CatalogPublishTransport
  return { store: new CatalogStore('admin-test', () => auth, () => {}, read, mutate, publish), auth, calls }
}

describe('store Catálogo V4', () => {
  test('deduplica lecturas completas por acción y payload', async () => {
    const { store, calls } = setup()
    await Promise.all([store.load('status', {}), store.load('status', {})])
    await store.load('proposals', {})
    await store.load('proposals', { estado: 'aprobado' })
    expect(calls.map(call => call.action)).toEqual(['status', 'proposals', 'proposals'])
  })

  test('reintento incierto conserva operation_id y revisiones', async () => {
    let attempts = 0
    const { store, calls } = setup({ mutate: () => {
      if (!attempts++) throw Object.assign(new Error('Lock ocupado'), { code: 'SOLOG_LOCK_CONFLICT_RETRYABLE' })
      return { ...envelope(), replay: true, result: { ok: true } } as CatalogMutationResult
    } })
    await store.load('status', {})
    await expect(store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'ignore' })).rejects.toThrow('Lock')
    await store.retryMutation()
    const mutations = calls.filter(call => call.action === 'proposal_action')
    expect(mutations[0].payload).toEqual(mutations[1].payload)
    expect(mutations[0].payload).toMatchObject({ expected_catalog_revision: 5, expected_groups_revision: 9 })
  })

  test('expone resolución atómica de producto y precio', async () => {
    const { store, calls } = setup()
    await store.load('status', {})
    await store.mutation('resolve_product', { propuesta_fingerprint: 'a'.repeat(64), mode: 'new_unit', categoria_id: 'cat-1', marca: null })
    await store.load('status', {})
    await store.mutation('resolve_price', { propuesta_fingerprint: 'b'.repeat(64), resolution: 'separate_sku', package_action: 'not_applicable' })
    expect(calls.find(call => call.action === 'resolve_product')?.payload).toMatchObject({ mode: 'new_unit', categoria_id: 'cat-1' })
    expect(calls.find(call => call.action === 'resolve_price')?.payload).toMatchObject({ resolution: 'separate_sku', package_action: 'not_applicable' })
  })

  test('reincorporación administrativa queda aprobada sin setup pendiente posterior', async () => {
    const { store } = setup()
    await store.load('status', {})
    await store.mutation('propose_product_state', { c_interno: 100, action: 'reincorporate', mode: 'new_unit', categoria_id: 'cat-1', marca: null })
    expect(store.confirmedProductProposalStatus(100)).toBe('aprobado')
    expect(store.confirmedSetupRequired()).toEqual([])
  })

  test('descartar libera el overlay de Producto', async () => {
    const { store } = setup()
    await store.load('status', {})
    const context = { ...proposal, estado: 'aprobado', tipo: 'excluir_producto', publicable: true }
    await store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'discard' }, { proposal: context as never })
    expect(store.confirmedProductProposalStatus(100)).toBe('none')
  })

  test('publicación conserva recibo estable', async () => {
    const ids: string[] = []
    let attempt = 0
    const { store } = setup({ publish: (operationId) => {
      ids.push(operationId)
      if (!attempt++) throw new Error('Sin confirmación')
      return { ok: true, codigo: 'CATALOG_PUBLISHED', operation_id: operationId, replay: true, completion_recorded: true, version: 8, hash: 'hash', storage_path: 'catalog.json', productos: 2, grupos_activos: 1, cambios_incorporados: 1 }
    } })
    await expect(store.publish()).rejects.toThrow('Sin confirmación')
    await store.publish()
    expect(ids[0]).toBe(ids[1])
  })
})
