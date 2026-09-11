import { describe, expect, test } from 'bun:test'
import { suggestedPackagePrice, validateValuationDecision, valuationPresets } from '../src/features/solog/admin/admin.valuation'

describe('Configuración de valorizado compartida', () => {
  test('representa OFF como null/null y ON exige un par completo válido', () => {
    expect(validateValuationDecision({ enabled: false, unitsPerPackage: null, packagePrice: null })).toBe(true)
    expect(validateValuationDecision({ enabled: true, unitsPerPackage: 6, packagePrice: 18 })).toBe(true)
    expect(validateValuationDecision({ enabled: true, unitsPerPackage: null, packagePrice: null })).toBe(false)
  })
  test('ofrece x6, x10, x12, x20 y admite Otro entero mayor que uno', () => {
    expect(valuationPresets).toEqual([6, 10, 12, 20])
    expect(validateValuationDecision({ enabled: true, unitsPerPackage: 7, packagePrice: 21 })).toBe(true)
    expect(validateValuationDecision({ enabled: true, unitsPerPackage: 1, packagePrice: 3 })).toBe(false)
    expect(validateValuationDecision({ enabled: true, unitsPerPackage: 2.5, packagePrice: 3 })).toBe(false)
    expect(validateValuationDecision({ enabled: true, unitsPerPackage: 6, packagePrice: 0 })).toBe(false)
  })
  test('calcula una sugerencia auxiliar sin sustituir el precio manual', async () => {
    expect(suggestedPackagePrice(12, 3.5)).toBe(42)
    const source = await Bun.file('src/features/solog/admin/admin.valuation-dialog.tsx').text()
    expect(source).toContain('if (!priceEdited) setPackagePrice')
    expect(source).toContain('No reemplaza un precio ingresado manualmente')
  })
  test('permanece desacoplado de RPC y stores', async () => {
    const source = await Bun.file('src/features/solog/admin/admin.valuation-dialog.tsx').text()
    for (const forbidden of ['rpc_solog', 'useGroupsStore', 'useCatalogStore', 'valuation_save', 'prepare_price']) expect(source).not.toContain(forbidden)
  })
})
