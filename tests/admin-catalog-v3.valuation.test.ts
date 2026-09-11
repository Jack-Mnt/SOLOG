import { describe, expect, test } from 'bun:test'
import { CatalogContractError, validateCatalogMutationPayload } from '../src/features/solog/admin/catalogo/admin.catalogo.v3'

const base = { operation_id: '123e4567-e89b-12d3-a456-426614174000', expected_catalog_revision: 7, expected_groups_revision: 3, propuesta_fingerprint: 'a'.repeat(64) }

describe('Catálogo V3: valorizado staged', () => {
  test('acepta keep, update, set y clear para estructuras existentes', () => {
    for (const payload of [
      { ...base, resolution: 'keep_structure' as const, package_action: 'keep' as const },
      { ...base, resolution: 'update_group_price' as const, package_action: 'update' as const, precio_paquete: 20 },
      { ...base, resolution: 'keep_structure' as const, package_action: 'set' as const, unidades_por_paquete: 12, precio_paquete: 42 },
      { ...base, resolution: 'update_group_price' as const, package_action: 'clear' as const },
    ]) expect(() => validateCatalogMutationPayload('prepare_price', payload)).not.toThrow()
  })
  test('solo admite set, clear o not_applicable al separar SKU', () => {
    for (const payload of [
      { ...base, resolution: 'separate_sku' as const, package_action: 'set' as const, unidades_por_paquete: 6, precio_paquete: 18 },
      { ...base, resolution: 'separate_sku' as const, package_action: 'clear' as const },
      { ...base, resolution: 'separate_sku' as const, package_action: 'not_applicable' as const },
    ]) expect(() => validateCatalogMutationPayload('prepare_price', payload)).not.toThrow()
    expect(() => validateCatalogMutationPayload('prepare_price', { ...base, resolution: 'separate_sku', package_action: 'keep' })).toThrow(CatalogContractError)
  })
  test('la superficie usa el mismo modal y solamente prepara staging', async () => {
    const source = await Bun.file('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx').text()
    expect(source).toContain('ValuationDialog')
    expect(source).toContain("store.mutation('prepare_price'")
    expect(source).not.toContain('valuation_save')
    expect(source).toContain('se aplicarán solo al publicar Catálogo')
    for (const code of ['INVALID_PACKAGE_CONFIGURATION', 'INVALID_PACKAGE_PRICE', 'PACKAGE_PRICE_DECISION_REQUIRED']) expect(source).toContain(code)
  })
})
