import { describe, expect, test } from 'bun:test'
import { CatalogStore, type CatalogMutateTransport, type CatalogReadTransport } from '../src/features/solog/admin/catalogo/admin.catalogo.store'
import type { CatalogMutationResult, CatalogReadAction } from '../src/features/solog/admin/catalogo/admin.catalogo.v3'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

const now = '2026-09-10T12:00:00.000Z'
let revisions = { catalog: 7, groups: 3 }
const envelope = () => ({ contract_version: 3 as const, generated_at: now, revisions: { ...revisions } })
const proposal = { propuesta_fingerprint: 'a'.repeat(64), cambio_id: 'change-1', c_interno: 100, tipo: 'precio', estado: 'pendiente', seccion: 'urgente', datos: {}, producto: 'Producto', sedes: [], occurrence_count: 1, first_seen_at: now, last_seen_at: now, catalogo_actual: { producto: 'Producto', c_barras: null, precio: 2, marca: null, estado: 'Agrupado', categoria: 'Categoría', grupo: 'Grupo' }, stale: false, publicable: null, block_reason: null, setup: null, price_resolution: null, aprobado_at: null, ignorado_at: null, version_aplicada: null, incorporado_at: null }
function fixture(action: CatalogReadAction, payload: Record<string, unknown> = {}) {
  if (action === 'status') return { ...envelope(), catalog: { version_actual: 6, publicado_at: now, incluidos: 1, excluidos: 0, total: 1 } }
  if (action === 'reference') return { ...envelope(), categories: [], groups: [] }
  if (action === 'proposals') return { ...envelope(), estado: payload.estado ?? 'pendiente', rows: [{ ...proposal, estado: payload.estado ?? 'pendiente', publicable: payload.estado === 'aprobado' ? true : null }], total: 1, complete: true as const, counts: { pendiente: 1, aprobado: 0, ignorado: 0, incorporado: 0 } }
  if (action === 'products') return { ...envelope(), rows: [], total: 0, complete: true as const, setup_required: [] }
  if (action === 'price_options') return { ...envelope(), propuesta_fingerprint: payload.propuesta_fingerprint, change_id: 'change-1', change_state: 'aprobado', grupo: { id: 'group-1', nombre: 'Grupo', precio: 2, unidades_por_paquete: null, precio_paquete: null }, c_interno: 100, nuevo_precio: 3, members: [], options: ['keep_structure'], package_decision_required: false, prepared_resolution: null }
  return { ...envelope(), preview: { ok: true, codigo: 'CATALOG_PREVIEW_READY', version_actual: 6, version_nueva: 7, schema_version: 2, sku_actuales: 1, sku_resultantes: 1, cambios_total: 0, cambios: { agregar_producto: 0, eliminar_producto: 0, excluir_producto: 0, reincorporar_producto: 0, nombre: 0, precio: 0, codigo: 0 }, change_ids: [], conflictos: [], errores: [] } }
}
function setup(options: { read?: (action: CatalogReadAction, payload: Record<string, unknown>) => unknown; mutate?: (action: string, payload: Record<string, unknown>) => unknown } = {}) {
  revisions = { catalog: 7, groups: 3 }
  const auth = bootstrapFixture()
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = []
  const read = (async (action, payload) => { calls.push({ action, payload: structuredClone(payload) }); return options.read ? options.read(action, payload) : fixture(action, payload) }) as CatalogReadTransport
  const mutate = (async (action, payload) => { calls.push({ action, payload: structuredClone(payload) }); return options.mutate ? options.mutate(action, payload) : { ...envelope(), replay: false, result: {} } }) as CatalogMutateTransport
  return { store: new CatalogStore('admin-test', () => auth, () => {}, read, mutate), auth, calls }
}

describe('store Catálogo V3', () => {
  test('deduplica y conserva conjuntos completos por acción y payload', async () => {
    const { store, calls } = setup()
    await Promise.all([store.load('status', {}), store.load('status', {})])
    await store.load('status', {})
    await store.load('proposals', {})
    await store.load('proposals', { estado: 'aprobado' })
    expect(calls.map(call => call.action)).toEqual(['status', 'proposals', 'proposals'])
    expect(store.peek('proposals', {}).data?.complete).toBe(true)
  })
  test('una respuesta con revisión nueva invalida conjuntos anteriores, sin usar bootstrap como revisión', async () => {
    const { store } = setup()
    await store.load('status', {})
    await store.load('reference', {})
    revisions = { catalog: 8, groups: 4 }
    store.retry('status', {})
    await store.load('status', {})
    expect(store.revisions()).toEqual(revisions)
    expect(store.peek('reference', {}).data).toBeUndefined()
  })
  test('rechaza una lectura con revisión anterior a la fuente V3', async () => {
    const { store } = setup()
    await store.load('status', {})
    revisions = { catalog: 6, groups: 3 }
    store.retry('status', {})
    await expect(store.load('status', {})).rejects.toThrow('obsoleta')
  })
  test('conserva operation_id y ambas revisiones en reintentos inciertos', async () => {
    let attempts = 0
    const { store, calls } = setup({ mutate: (action, payload) => {
      void action
      void payload
      if (!attempts++) throw Object.assign(new Error('Lock ocupado'), { code: 'SOLOG_LOCK_CONFLICT_RETRYABLE' })
      return { ...envelope(), replay: true, result: { ok: true }, revisions: { catalog: 8, groups: 4 } } as CatalogMutationResult
    } })
    await store.load('status', {})
    await expect(store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'approve' })).rejects.toThrow('Lock')
    await store.retryMutation()
    const mutations = calls.filter(call => call.action === 'proposal_action')
    expect(mutations).toHaveLength(2)
    expect(mutations[0].payload).toEqual(mutations[1].payload)
    expect(mutations[0].payload).toMatchObject({ expected_catalog_revision: 7, expected_groups_revision: 3 })
    expect(store.intent()).toBeUndefined()
  })
  test('retirar aprobación invalida y obliga a releer el estado autoritativo', async () => {
    const { store, calls } = setup()
    await store.load('status', {})
    await store.load('proposals', { estado: 'aprobado' })
    await store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'withdraw' })
    await store.load('proposals', { estado: 'aprobado' })
    const mutations = calls.filter(call => call.action === 'proposal_action')
    expect(mutations).toHaveLength(1)
    expect(mutations[0].payload.action).toBe('withdraw')
    expect(calls.filter(call => call.action === 'proposals')).toHaveLength(2)
  })
  test('toda mutación exitosa invalida caché aunque las revisiones no cambien', async () => {
    const { store } = setup()
    await store.load('status', {})
    await store.load('reference', {})
    await store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'ignore' })
    expect(store.peek('status', {}).data).toBeUndefined()
    expect(store.peek('reference', {}).data).toBeUndefined()
  })
  test('un conflicto definitivo descarta intención e invalida caché', async () => {
    const { store } = setup({ mutate: () => { throw Object.assign(new Error('Conflicto'), { code: 'SOLOG_MASTERDATA_REVISION_CONFLICT' }) } })
    await store.load('status', {})
    await expect(store.mutation('proposal_action', { propuesta_fingerprint: 'a'.repeat(64), action: 'ignore' })).rejects.toThrow('Conflicto')
    expect(store.intent()).toBeUndefined()
    expect(store.peek('status', {}).data).toBeUndefined()
  })
  test('una respuesta pendiente no sobrevive un cambio de rol', async () => {
    let release!: (result: unknown) => void
    const { store, auth } = setup({ read: () => new Promise(resolve => { release = resolve }) })
    const pending = store.load('status', {})
    auth.identity.rol = 'moderador'
    release(fixture('status'))
    await expect(pending).rejects.toThrow('invalidada')
    expect(store.peek('status', {}).data).toBeUndefined()
  })
})
