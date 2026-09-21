import { describe, expect, test } from 'bun:test'
import {
  CatalogContractError,
  catalogProposalChange,
  validateCatalogMutation,
  validateCatalogMutationPayload,
  validateCatalogRead,
  type CatalogMutationAction,
  type CatalogMutations,
  type CatalogProposal,
  type CatalogReadAction,
} from '../src/features/solog/admin/catalogo/admin.catalogo.v4'

const now = '2026-09-21T12:00:00.000Z'
const revisions = { catalog: 5, groups: 9 }
const envelope = () => ({ contract_version: 4 as const, generated_at: now, revisions })
const group = { id: 'group-1', nombre: 'Grupo', categoria_id: 'category-1', categoria: 'Categoría', precio: 2, unidades_por_paquete: 6, precio_paquete: 10 }
const proposal = {
  propuesta_fingerprint: 'a'.repeat(64),
  cambio_id: 'change-1',
  c_interno: 100,
  tipo: 'precio',
  estado: 'aprobado',
  origen: 'automatico',
  seccion: 'urgente',
  datos: {},
  producto: 'Producto',
  sedes: [{ id: 'site-1', nombre: 'Sede' }],
  occurrence_count: 1,
  first_seen_at: now,
  last_seen_at: now,
  catalogo_actual: { producto: 'Producto', c_barras: null, precio: 2, marca: null, estado: 'Agrupado', categoria: 'Categoría', grupo: 'Grupo' },
  stale: false,
  publicable: true,
  block_reason: null,
  setup: null,
  price_resolution: { resolution: 'update_group_price' },
  aprobado_at: now,
  ignorado_at: null,
  version_aplicada: null,
  incorporado_at: null,
} satisfies CatalogProposal

function fixture(action: CatalogReadAction) {
  if (action === 'status') return { ...envelope(), catalog: { version_actual: 6, publicado_at: now, incluidos: 1, excluidos: 0, total: 1 } }
  if (action === 'reference') return { ...envelope(), categories: [{ id: 'category-1', nombre: 'Categoría', orden: 1 }], groups: [group] }
  if (action === 'proposals') return { ...envelope(), estado: 'aprobado', rows: [proposal], total: 1, complete: true, counts: { pendiente: 0, aprobado: 1, ignorado: 0, incorporado: 0 } }
  if (action === 'products') return { ...envelope(), rows: [], total: 0, complete: true, setup_required: [] }
  if (action === 'price_options') return { ...envelope(), propuesta_fingerprint: proposal.propuesta_fingerprint, change_id: 'change-1', change_state: 'aprobado', grupo: group, c_interno: 100, nuevo_precio: 3, members: [], options: ['update_group_price'], package_decision_required: true, prepared_resolution: null }
  return { ...envelope(), preview: { ok: true, codigo: 'CATALOG_PREVIEW_READY', version_actual: 6, version_nueva: 7, schema_version: 2, sku_actuales: 1, sku_resultantes: 1, cambios_total: 1, cambios: { agregar_producto: 0, eliminar_producto: 0, excluir_producto: 0, reincorporar_producto: 0, nombre: 0, precio: 1, codigo: 0 }, change_ids: ['change-1'], conflictos: [], errores: [] } }
}

describe('Catálogo V4 contrato frontend', () => {
  for (const action of ['status', 'reference', 'proposals', 'products', 'price_options', 'publication_preview'] as CatalogReadAction[]) {
    test(`${action} acepta envelope V4`, () => {
      const response = fixture(action)
      expect(validateCatalogRead(action, response)).toBe(response)
    })
  }

  test('rechaza V3 y propuestas sin origen autoritativo', () => {
    expect(() => validateCatalogRead('status', { ...fixture('status'), contract_version: 3 })).toThrow(CatalogContractError)
    const proposals = fixture('proposals')
    expect(() => validateCatalogRead('proposals', { ...proposals, rows: [{ ...proposal, origen: undefined }] })).toThrow(CatalogContractError)
  })

  test('proposal_action reconoce las cinco transiciones visibles de V4', () => {
    const base = { operation_id: '123e4567-e89b-12d3-a456-426614174000', expected_catalog_revision: 5, expected_groups_revision: 9, propuesta_fingerprint: 'a'.repeat(64) }
    for (const action of ['approve', 'ignore', 'reactivate', 'withdraw', 'discard'] as const) {
      expect(() => validateCatalogMutationPayload('proposal_action', { ...base, action })).not.toThrow()
    }
  })

  test('resolución atómica y propuesta administrativa exigen su configuración', () => {
    const base = { operation_id: '123e4567-e89b-12d3-a456-426614174000', expected_catalog_revision: 5, expected_groups_revision: 9 }
    const payloads: Partial<Record<CatalogMutationAction, CatalogMutations[CatalogMutationAction]>> = {
      resolve_product: { ...base, propuesta_fingerprint: 'a'.repeat(64), mode: 'new_unit', categoria_id: 'cat-1', marca: null },
      resolve_price: { ...base, propuesta_fingerprint: 'a'.repeat(64), resolution: 'separate_sku', package_action: 'not_applicable' },
      propose_product_state: { ...base, c_interno: 100, action: 'reincorporate', mode: 'existing_group', grupo_id: 'group-1', marca: null },
    }
    for (const [action, payload] of Object.entries(payloads) as [CatalogMutationAction, CatalogMutations[CatalogMutationAction]][]) {
      expect(() => validateCatalogMutationPayload(action, payload)).not.toThrow()
    }
    expect(() => validateCatalogMutationPayload('propose_product_state', { ...base, c_interno: 100, action: 'reincorporate' })).toThrow(CatalogContractError)
  })

  test('mutación exige envelope V4', () => {
    expect(validateCatalogMutation({ ...envelope(), replay: false, result: {} }).contract_version).toBe(4)
    expect(() => validateCatalogMutation({ ...envelope(), contract_version: 3, replay: false, result: {} })).toThrow(CatalogContractError)
  })

  test('normalización visual de Cambio permanece estable', () => {
    expect(catalogProposalChange(proposal)).toEqual({ kind: 'price', previous: 2, next: null })
  })
})
