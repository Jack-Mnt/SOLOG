import { describe, expect, test } from 'bun:test'
import { CatalogContractError, CatalogPublicationError, validateCatalogMutation, validateCatalogMutationPayload, validateCatalogPublication, validateCatalogRead, type CatalogMutationAction, type CatalogMutations, type CatalogReadAction } from '../src/features/solog/admin/catalogo/admin.catalogo.v3'

const now = '2026-09-10T12:00:00.000Z'
const revisions = { catalog: 7, groups: 3 }
const envelope = () => ({ contract_version: 3, generated_at: now, revisions })
const group = { id: 'group-1', nombre: 'Grupo', categoria_id: 'category-1', categoria: 'Categoría', precio: 2, unidades_por_paquete: 6, precio_paquete: 10 }
const proposal = { propuesta_fingerprint: 'a'.repeat(64), cambio_id: 'change-1', c_interno: 100, tipo: 'precio', estado: 'aprobado', seccion: 'urgente', datos: {}, producto: 'Producto', sedes: [{ id: 'site-1', nombre: 'Sede' }], occurrence_count: 1, first_seen_at: now, last_seen_at: now, catalogo_actual: { producto: 'Producto', c_barras: null, precio: 2, marca: null, estado: 'Agrupado', categoria: 'Categoría', grupo: 'Grupo' }, stale: false, publicable: true, block_reason: null, setup: null, price_resolution: null, aprobado_at: now, ignorado_at: null, version_aplicada: null, incorporado_at: null }
const product = { c_interno: 100, producto: 'Producto', c_barras: null, precio: 2, marca: null, estado_catalogo: 'incluido', modo: 'Agrupado', categoria_id: 'category-1', categoria: 'Categoría', grupo_id: 'group-1', grupo: 'Grupo', unidades_por_paquete: 6, precio_paquete: 10, propuesta_estado: null }

function fixture(action: CatalogReadAction) {
  if (action === 'status') return { ...envelope(), catalog: { version_actual: 6, publicado_at: now, incluidos: 1, excluidos: 0, total: 1 } }
  if (action === 'reference') return { ...envelope(), categories: [{ id: 'category-1', nombre: 'Categoría', orden: 1 }], groups: [group] }
  if (action === 'proposals') return { ...envelope(), estado: 'aprobado', rows: [proposal], total: 1, complete: true, counts: { pendiente: 0, aprobado: 1, ignorado: 0, incorporado: 0 } }
  if (action === 'products') return { ...envelope(), rows: [product], total: 1, complete: true, setup_required: [] }
  if (action === 'price_options') return { ...envelope(), propuesta_fingerprint: proposal.propuesta_fingerprint, change_id: 'change-1', change_state: 'aprobado', grupo: group, c_interno: 100, nuevo_precio: 3, members: [{ c_interno: 100, producto: 'Producto', precio: 2 }], options: ['update_group_price', 'separate_sku'], package_decision_required: true, prepared_resolution: null }
  return { ...envelope(), preview: { ok: true, codigo: 'CATALOG_PREVIEW_READY', version_actual: 6, version_nueva: 7, schema_version: 2, sku_actuales: 1, sku_resultantes: 1, cambios_total: 1, cambios: { agregar_producto: 0, eliminar_producto: 0, excluir_producto: 0, reincorporar_producto: 0, nombre: 0, precio: 1, codigo: 0 }, change_ids: ['change-1'], conflictos: [], errores: [] } }
}

describe('Catálogo V3 contratos de lectura', () => {
  for (const action of ['status', 'reference', 'proposals', 'products', 'price_options', 'publication_preview'] as CatalogReadAction[]) test(`${action} acepta el contrato congelado`, () => {
    const response = fixture(action)
    expect(validateCatalogRead(action, response)).toBe(response)
  })
  test('rechaza versión distinta de tres, paginación y truncamiento silencioso', () => {
    expect(() => validateCatalogRead('status', { ...fixture('status'), contract_version: 2 })).toThrow(CatalogContractError)
    expect(() => validateCatalogRead('proposals', { ...fixture('proposals'), total: 2 })).toThrow(/truncado/)
    expect(() => validateCatalogRead('products', { ...fixture('products'), complete: false })).toThrow(/incompleto/)
  })
  test('rechaza campos legacy y respuestas incompletas de V3', () => {
    const preview = fixture('publication_preview')
    expect(() => validateCatalogRead('publication_preview', { ...preview, preview: { ...preview.preview, puede_publicar: true, cambios: { precio: 1 } } })).toThrow(CatalogContractError)
    const pending = { ...proposal, estado: 'pendiente', publicable: true }
    expect(() => validateCatalogRead('proposals', { ...fixture('proposals'), estado: 'pendiente', rows: [pending], counts: { pendiente: 1, aprobado: 0, ignorado: 0, incorporado: 0 } })).toThrow(/publicable/)
  })
})

describe('Catálogo V3 publicación', () => {
  const operationId = '123e4567-e89b-12d3-a456-426614174000'
  const response = (overrides: Record<string, unknown> = {}) => ({ ok: true, codigo: 'CATALOG_PUBLISHED', operation_id: operationId, replay: false, completion_recorded: true, version: 7, hash: 'sha256', storage_path: 'conexion-catalogos/catalog.prcatalog', productos: 10, grupos_activos: 4, cambios_incorporados: 2, ...overrides })
  test('acepta la respuesta estable y conserva la recuperación cuando falta registrar el cierre', () => {
    expect(validateCatalogPublication(response(), operationId).completion_recorded).toBe(true)
    expect(validateCatalogPublication(response({ completion_recorded: false }), operationId).completion_recorded).toBe(false)
  })
  test('rechaza respuestas incompletas o de otra operación como inciertas', () => {
    expect(() => validateCatalogPublication(response({ operation_id: '123e4567-e89b-12d3-a456-426614174001' }), operationId)).toThrow(CatalogPublicationError)
    expect(() => validateCatalogPublication({ ok: true, codigo: 'CATALOG_PUBLISHED' }, operationId)).toThrow(CatalogPublicationError)
  })
})
describe('Catálogo V3 contratos de mutación', () => {
  const base = { operation_id: '123e4567-e89b-12d3-a456-426614174000', expected_catalog_revision: 7, expected_groups_revision: 3 }
  const payloads: Record<CatalogMutationAction, CatalogMutations[CatalogMutationAction]> = {
    proposal_action: { ...base, propuesta_fingerprint: proposal.propuesta_fingerprint, action: 'approve' },
    propose_product_state: { ...base, c_interno: 100, action: 'exclude' },
    prepare_product: { ...base, propuesta_fingerprint: proposal.propuesta_fingerprint, mode: 'new_unit', categoria_id: 'category-1', marca: null },
    prepare_price: { ...base, propuesta_fingerprint: proposal.propuesta_fingerprint, resolution: 'update_group_price', package_action: 'update', precio_paquete: 12 },
  }
  for (const [action, payload] of Object.entries(payloads) as [CatalogMutationAction, CatalogMutations[CatalogMutationAction]][]) test(`${action} expone las revisiones e identificador requeridos`, () => {
    expect(payload).toMatchObject(base)
  })
  test('cada payload V3 exige operation_id y ambas revisiones', () => {
    for (const [action, payload] of Object.entries(payloads) as [CatalogMutationAction, CatalogMutations[CatalogMutationAction]][]) expect(() => validateCatalogMutationPayload(action, payload)).not.toThrow()
    expect(() => validateCatalogMutationPayload('prepare_price', { ...payloads.prepare_price, operation_id: 'invalid' })).toThrow(CatalogContractError)
    expect(() => validateCatalogMutationPayload('prepare_price', { ...payloads.prepare_price, expected_groups_revision: -1 })).toThrow(CatalogContractError)
    expect(() => validateCatalogMutationPayload('prepare_price', { ...payloads.prepare_price, package_action: 'update', precio_paquete: 0 })).toThrow(CatalogContractError)
  })
  test('la respuesta de mutación exige envelope V3, replay y result', () => {
    expect(validateCatalogMutation({ ...envelope(), replay: false, result: {} }).revisions).toEqual(revisions)
    expect(() => validateCatalogMutation({ ...envelope(), replay: false })).toThrow(CatalogContractError)
  })
})
