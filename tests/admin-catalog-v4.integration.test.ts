import { describe, expect, test } from 'bun:test'
import { CatalogStore, type CatalogMutateTransport, type CatalogPublishTransport, type CatalogReadTransport } from '../src/features/solog/admin/catalogo/admin.catalogo.store'
import type { CatalogReadAction } from '../src/features/solog/admin/catalogo/admin.catalogo.v4'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-21T12:00:00.000Z'
const fingerprint = 'a'.repeat(64)
const revisions = { catalog: 5, groups: 9 }
const envelope = () => ({ contract_version: 4 as const, generated_at: now, revisions })
const proposal = (estado: 'pendiente' | 'aprobado' | 'ignorado' | 'incorporado' = 'pendiente') => ({ propuesta_fingerprint: fingerprint, cambio_id: 'change-1', c_interno: 100, tipo: 'agregar_producto', estado, origen: 'automatico', seccion: 'urgente', datos: { precio: 2 }, producto: 'Producto', sedes: [], occurrence_count: 1, first_seen_at: now, last_seen_at: now, catalogo_actual: { producto: 'Producto', c_barras: null, precio: 2, marca: null, estado: 'Agrupado', categoria: 'Categoría', grupo: 'Grupo' }, stale: false, publicable: estado === 'aprobado', block_reason: null, setup: estado === 'aprobado' ? { mode: 'new_unit' } : null, price_resolution: null, aprobado_at: estado === 'aprobado' ? now : null, ignorado_at: estado === 'ignorado' ? now : null, version_aplicada: null, incorporado_at: null })

function readFixture(action: CatalogReadAction, payload: Record<string, unknown>) {
  if (action === 'status') return { ...envelope(), catalog: { version_actual: 6, publicado_at: now, incluidos: 1, excluidos: 0, total: 1 } }
  if (action === 'reference') return { ...envelope(), categories: [{ id: 'category-1', nombre: 'Categoría', orden: 1 }], groups: [{ id: 'group-1', nombre: 'Grupo', categoria_id: 'category-1', categoria: 'Categoría', precio: 2, unidades_por_paquete: 6, precio_paquete: 10 }] }
  if (action === 'proposals') { const estado = (payload.estado ?? 'pendiente') as 'pendiente' | 'aprobado' | 'ignorado' | 'incorporado'; return { ...envelope(), estado, rows: [proposal(estado)], total: 1, complete: true as const, counts: { pendiente: estado === 'pendiente' ? 1 : 0, aprobado: estado === 'aprobado' ? 1 : 0, ignorado: estado === 'ignorado' ? 1 : 0, incorporado: estado === 'incorporado' ? 1 : 0 } } }
  if (action === 'products') return { ...envelope(), rows: [], total: 0, complete: true as const, setup_required: [] }
  if (action === 'price_options') return { ...envelope(), propuesta_fingerprint: payload.propuesta_fingerprint, change_id: 'change-1', change_state: 'pendiente', grupo: { id: 'group-1', nombre: 'Grupo', precio: 2, unidades_por_paquete: 6, precio_paquete: 10 }, c_interno: 100, nuevo_precio: 3, members: [{ c_interno: 100, producto: 'Producto', precio: 2 }], options: ['update_group_price', 'separate_sku'], package_decision_required: true, prepared_resolution: null }
  return { ...envelope(), preview: { ok: true, codigo: 'CATALOG_PREVIEW_READY', version_actual: 6, version_nueva: 7, schema_version: 2, sku_actuales: 1, sku_resultantes: 1, cambios_total: 1, cambios: { agregar_producto: 1, eliminar_producto: 0, excluir_producto: 0, reincorporar_producto: 0, nombre: 0, precio: 0, codigo: 0 }, change_ids: ['change-1'], conflictos: [], errores: [] } }
}

function harness(role: 'admin' | 'moderador' = 'admin', options: { failFirstRead?: boolean } = {}) {
  const auth = bootstrapFixture(); auth.identity.rol = role
  const calls: Array<{ channel: 'read' | 'mutation' | 'publish'; action: string; payload: Record<string, unknown> }> = []
  let failed = false
  const read = (async (action, payload) => {
    calls.push({ channel: 'read', action, payload: structuredClone(payload) })
    if (options.failFirstRead && !failed) { failed = true; throw new Error('Lectura temporalmente no disponible') }
    return readFixture(action, payload)
  }) as CatalogReadTransport
  const mutate = (async (action, payload) => {
    calls.push({ channel: 'mutation', action, payload: structuredClone(payload) })
    return { ...envelope(), replay: false, result: { ok: true } }
  }) as CatalogMutateTransport
  const publish = (async (operationId: string) => {
    calls.push({ channel: 'publish', action: 'publish_catalog', payload: { operation_id: operationId } })
    return { ok: true as const, codigo: 'CATALOG_PUBLISHED', operation_id: operationId, replay: false, completion_recorded: true, version: 7, hash: 'hash', storage_path: 'catalog.prcatalog', productos: 1, grupos_activos: 1, cambios_incorporados: 1 }
  }) as CatalogPublishTransport
  return { store: new CatalogStore('admin-test', () => auth, () => {}, read, mutate, publish), calls }
}

describe('Catálogo V4 integración frontend', () => {
  test('alta pendiente se resuelve y aprueba en una única mutación', async () => {
    const { store, calls } = harness()
    await store.load('status', {})
    await store.load('proposals', {})
    await store.mutation('resolve_product', { propuesta_fingerprint: fingerprint, mode: 'existing_group', grupo_id: 'group-1', marca: null })
    await store.load('publication_preview', {})
    await store.publish()
    expect(calls.map(call => `${call.channel}:${call.action}`)).toEqual(['read:status', 'read:proposals', 'mutation:resolve_product', 'read:publication_preview', 'publish:publish_catalog'])
  })

  test('reincorporación administrativa viaja configurada en la misma mutación', async () => {
    const { store, calls } = harness()
    await store.load('status', {})
    await store.mutation('propose_product_state', { c_interno: 100, action: 'reincorporate', mode: 'new_unit', categoria_id: 'category-1', marca: null })
    expect(calls.find(call => call.action === 'propose_product_state')?.payload).toMatchObject({ action: 'reincorporate', mode: 'new_unit', categoria_id: 'category-1' })
  })

  test('precio pendiente usa resolve_price y aprobado conserva prepare_price para edición posterior', async () => {
    const { store, calls } = harness()
    await store.load('status', {})
    await store.load('price_options', { propuesta_fingerprint: fingerprint })
    await store.mutation('resolve_price', { propuesta_fingerprint: fingerprint, resolution: 'separate_sku', package_action: 'not_applicable' })
    await store.load('status', {})
    await store.mutation('prepare_price', { propuesta_fingerprint: fingerprint, resolution: 'update_group_price', package_action: 'keep' })
    expect(calls.filter(call => call.channel === 'mutation').map(call => call.action)).toEqual(['resolve_price', 'prepare_price'])
  })

  test('moderador consulta y prepara pero no publica', async () => {
    const { store, calls } = harness('moderador')
    await store.load('status', {})
    await store.load('proposals', { estado: 'aprobado' })
    await store.mutation('prepare_product', { propuesta_fingerprint: fingerprint, mode: 'new_unit', categoria_id: 'category-1', marca: null })
    await expect(store.publish()).rejects.toThrow('Solo admin')
    expect(calls.some(call => call.channel === 'publish')).toBe(false)
  })

  test('lectura conserva retry sin llamadas directas a Supabase en el store', async () => {
    const { store, calls } = harness('admin', { failFirstRead: true })
    await expect(store.load('status', {})).rejects.toThrow('Lectura temporalmente no disponible')
    store.retry('status', {})
    await store.load('status', {})
    expect(calls.filter(call => call.action === 'status')).toHaveLength(2)
  })
})
