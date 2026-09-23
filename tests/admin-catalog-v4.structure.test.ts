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

  test('Ignorados se reactivan y Aprobados distinguen origen automático de administrativo', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    expect(ui).toMatch(/run\(\s*["']reactivate["']\s*\)/)
    expect(ui).toMatch(/run\(\s*["']withdraw["']\s*\)/)
    expect(ui).toContain('proposal.origen === "automatico"')
    expect(ui).toContain('onClick={() => run("ignore")}')
    expect(ui).toMatch(/run\(\s*["']discard["']\s*\)/)
    expect(ui).toContain('Volver a pendiente')
    expect(ui).toContain('Descartar propuesta')
  })

  test('resolución de precio diferencia resolve/prepare y muestra equivalencias o conflictos de grupo', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    expect(ui).toContain('? store.mutation("resolve_price", payload)')
    expect(ui).toContain(': store.mutation("prepare_price", payload)')
    expect(ui).toContain('options.equivalent_proposals.length + 1')
    expect(ui).toContain('options.conflicting_proposals.length > 0')
    expect(ui).toMatch(/propuestas de\s+precio equivalentes del grupo/)
    expect(ui).toMatch(/propuestas de precio incompatibles/)
  })

  test('publicación prioriza éxito y trata cero aprobadas como estado informativo', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    expect(ui).toContain('completed && receipt.result')
    expect(ui).toContain('preview.codigo === "NO_APPROVED_CATALOG_CHANGES"')
    expect(ui).toContain('No hay cambios aprobados para publicar.')
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
