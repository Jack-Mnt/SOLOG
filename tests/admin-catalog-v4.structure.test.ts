import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Catálogo V4: estructura principal', () => {
  test('Admin carga Catálogo V4 y mantiene Productos separado', async () => {
    const app = await source('src/features/solog/admin/admin.v2.app.tsx')
    expect(app).toMatch(/import\(\s*["']\.\/catalogo\/admin\.catalogo\.page\.v4["']\s*\)/)
    expect(app).toMatch(/default:\s*m\.AdminCatalogV4/)
    expect(app).toMatch(/import\(\s*["']\.\/productos\/admin\.productos\.v1["']\s*\)/)
  })

  test('Propuestas usa origen autoritativo y no expone Descartados', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    for (const status of ['pendiente', 'aprobado', 'ignorado', 'incorporado']) expect(ui).toMatch(new RegExp(`\\{\\s*id:\\s*["']${status}["']`))
    expect(ui).not.toMatch(/id:\s*["']descartado["']/)
    expect(ui).toContain('proposal.origen === "automatico"')
    expect(ui).toContain('"Administrativo"')
    expect(ui).not.toContain('proposal.cambio_id === null ? "Automático"')
  })

  test('Pendientes puede aprobar desde tabla y complejos abren su resolución', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    expect(ui).toContain('title="Aprobar"')
    expect(ui).toContain('onApprove={approve}')
    expect(ui).toContain('flow="resolve"')
    expect(ui).toContain('Configurar y aprobar')
    expect(ui).toContain('Resolver y aprobar')
    expect(ui).toMatch(/store\s*\.\s*mutation\(\s*["']proposal_action["']/)
  })

  test('Ignorados se reactivan y Aprobados pueden volver o descartarse', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    expect(ui).toMatch(/run\(\s*["']reactivate["']\s*\)/)
    expect(ui).toMatch(/run\(\s*["']withdraw["']\s*\)/)
    expect(ui).toMatch(/run\(\s*["']discard["']\s*\)/)
    expect(ui).toContain('Volver a pendiente')
    expect(ui).toContain('Descartar propuesta')
    expect(ui).toContain('Esta acción es terminal')
  })

  test('resolución de precio diferencia resolve_price de prepare_price', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    expect(ui).toContain('flow === "resolve" ? "resolve_price" : "prepare_price"')
    expect(ui).toContain('flow === "resolve" ? "Resolver y aprobar" : "Guardar resolución"')
  })

  test('Productos configura reincorporación antes de aprobar', async () => {
    const products = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
    const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')
    expect(products).toContain('flow="propose_reincorporation"')
    expect(products).toContain('Configurar reincorporación')
    expect(setup).toMatch(/store\.mutation\(\s*['"]propose_product_state['"]/)
    expect(setup).toContain("action: 'reincorporate'")
    expect(setup).toContain("flow === 'resolve' ? 'resolve_product' : 'prepare_product'")
  })

  test('no requiere CSS nuevo para V4', async () => {
    const css = await source('src/features/solog/admin/admin.css')
    expect(css).toContain('.admin-table-actions')
    expect(css).toContain('.admin-catalog__table')
  })
})
