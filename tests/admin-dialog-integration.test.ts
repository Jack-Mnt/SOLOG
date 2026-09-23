import { describe, expect, test } from 'bun:test'

async function source(path: string) {
  return Bun.file(path).text()
}

describe('AdminDialog integración anidada', () => {
  test('Catálogo conserva detalle → configuración de producto y detalle → resolución de precio', async () => {
    const catalog = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const setup = await source(
      'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
    )

    expect(catalog).toContain('<AdminDialog')
    expect(catalog).toContain('<ProductSetupDialog')
    expect(catalog).toContain('onClose={() => setSetup(false)}')
    expect(catalog).toContain('<PriceResolutionDialog')
    expect(catalog).toContain('onClose={() => setPrice(false)}')
    expect(setup).toContain('<AdminDialog')
  })

  test('resolución de precio conserva el tercer nivel hacia ValuationDialog', async () => {
    const catalog = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const valuation = await source(
      'src/features/solog/admin/admin.valuation-dialog.tsx',
    )

    expect(catalog).toMatch(/onClick=\{\(\) => \{[\s\S]*?setValuationError\(""\);[\s\S]*?setValuation\(true\);[\s\S]*?\}\}/)
    expect(catalog).toContain('<ValuationDialog')
    expect(catalog).toContain('onClose={() => setValuation(false)}')
    expect(valuation).toContain('<AdminDialog')
  })

  test('los consumidores anidados no implementan un trap o Escape paralelo', async () => {
    const paths = [
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
      'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
      'src/features/solog/admin/admin.valuation-dialog.tsx',
    ]

    for (const path of paths) {
      const current = await source(path)
      expect(current).not.toContain("addEventListener('keydown'")
      expect(current).not.toContain('addEventListener("keydown"')
    }
  })

  test('StrictMode no reemplaza el disparador original durante la doble ejecución de efectos', async () => {
    const main = await source('src/main.tsx')
    const dialog = await source(
      'src/features/solog/admin/admin.dialog.tsx',
    )

    expect(main).toContain('<StrictMode>')
    const focus = await source(
      'src/features/solog/admin/admin.dialog.focus.ts',
    )
    expect(dialog).toContain('returnFocusRef.current === null')
    expect(focus).toContain('lifecycleRef.current !== lifecycle')
  })

  test('AdminSort conserva su Escape local y AdminDialog respeta defaultPrevented', async () => {
    const primitives = await source(
      'src/features/solog/admin/admin.primitives.tsx',
    )
    const dialog = await source(
      'src/features/solog/admin/admin.dialog.tsx',
    )

    expect(primitives).toContain("event.key === 'Escape' && open")
    expect(primitives).toContain('event.preventDefault()')
    expect(dialog).toContain('event.defaultPrevented')
  })
})
