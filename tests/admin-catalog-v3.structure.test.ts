import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Catálogo V3: estructura principal', () => {
  test('la ruta carga la superficie V3 sin la página legacy', async () => {
    const app = await source('src/features/solog/admin/admin.v2.app.tsx')
    expect(app).toContain(`import("./catalogo/admin.catalogo.page.v3")`)
    expect(app).toContain('default: m.AdminCatalogV3')
  })

  test('separa Propuestas y Productos, con Productos bajo demanda y sin paginación legacy', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    expect(ui).toContain("useCatalogQuery('status', {})")
    expect(ui).toContain("useCatalogQuery('products', {})")
    expect(ui).toContain("surface === 'proposals' ? <ProposalsSurface /> : <ProductsSurface />")
    expect(ui).toContain('role="group"')
    expect(ui).not.toContain('PageControls')
    expect(ui).not.toContain('useManagement')
    expect(ui).not.toContain('limit: 50')
    expect(ui).not.toContain('offset')
  })

  test('consume los cuatro estados y conserva la clasificación y acciones de Propuestas V3', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    for (const status of ['pendiente', 'aprobado', 'ignorado', 'incorporado']) expect(ui).toContain(`{ id: '${status}'`)
    for (const urgent of ['agregar_producto', 'precio', 'reincorporar_producto']) expect(ui).toContain(`'${urgent}'`)
    for (const emerging of ['eliminar_producto', 'excluir_producto', 'nombre', 'codigo']) expect(ui).toContain(`'${emerging}'`)
    expect(ui).toContain("store.mutation('proposal_action'")
    expect(ui).toContain("run('withdraw')")
    expect(ui).toContain('Candidato automático')
    expect(ui).toContain('proposal.stale')
    expect(ui).toContain('proposal.block_reason')
    expect(ui).not.toContain('PackagePrice')
    expect(ui).not.toContain('prepare_product')
    expect(ui).not.toContain('prepare_price')
  })
})
