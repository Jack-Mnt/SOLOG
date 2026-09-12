import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Catálogo V3: estructura principal', () => {
  test('las rutas cargan Catálogo y Productos como módulos lazy separados', async () => {
    const app = await source('src/features/solog/admin/admin.v2.app.tsx')
    expect(app).toContain(`import("./catalogo/admin.catalogo.page.v3")`)
    expect(app).toContain('default: m.AdminCatalogV3')
    expect(app).toContain(`import("./productos/admin.productos.v1")`)
    expect(app).toContain('default: m.AdminProductsV1')
  })

  test('Catálogo conserva Propuestas y retira la pestaña y lectura Productos', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    expect(ui).toContain("useCatalogQuery('status', {})")
    expect(ui).toContain('<ProposalsSurface />')
    expect(ui).not.toContain("useCatalogQuery('products', {})")
    expect(ui).not.toContain('ProductsSurface')
    expect(ui).not.toContain('Superficies de Catálogo')
    expect(ui).not.toContain('PageControls')
    expect(ui).not.toContain('useManagement')
    expect(ui).not.toContain('limit: 50')
    expect(ui).not.toContain('offset')
  })

  test('consume los cuatro estados y conserva la clasificación y acciones de Propuestas V3', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')
    for (const status of ['pendiente', 'aprobado', 'ignorado', 'incorporado']) expect(ui).toContain(`{ id: '${status}'`)
    for (const urgent of ['agregar_producto', 'precio', 'reincorporar_producto']) expect(ui).toContain(`'${urgent}'`)
    for (const emerging of ['eliminar_producto', 'excluir_producto', 'nombre', 'codigo']) expect(ui).toContain(`'${emerging}'`)
    expect(ui).toContain("store.mutation('proposal_action'")
    expect(ui).toContain("run('withdraw')")
    expect(ui).toContain('Candidato automático')
    expect(ui).toContain('proposal.stale')
    expect(ui).toContain('proposal.block_reason')
    expect(ui).not.toContain('admin.package-price.v2')
    expect(setup).toContain("store.mutation('prepare_product'")
    expect(setup).toContain('useMasterData()')
    expect(setup).not.toContain("useCatalogQuery('reference'")
    expect(ui).toContain("store.mutation('prepare_price'")
    expect(ui).toContain("useCatalogQuery('price_options'")
    expect(ui).toContain("useCatalogQuery('publication_preview', {})")
    expect(ui).toContain('store.publish()')
  })

  test('expone estados UI, reintentos y controles accesibles de staging y publicación', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    for (const state of ['QueryState', 'role="alert"', 'role="status"', 'Reintentar misma operación', 'No hay propuestas', 'Existe staging preparado', 'No publicable:', 'Confirmar publicación', 'Recuperar publicación']) expect(ui).toContain(state)
    expect(ui).toContain('aria-label="Estado de propuestas"')
    expect(ui).toContain('disabled={!admin || !!receipt.pending || (!receipt.operationId && !preview?.ok)}')
  })

  test('Productos opera sobre Master Data completo y conserva las mutaciones Catálogo V3', async () => {
    const ui = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
    expect(ui).toContain('useMasterData()')
    expect(ui).toContain('masterData.snapshot.totals.products')
    expect(ui).toContain('masterData.snapshot.setup_required')
    expect(ui).toContain('derived.categoryById')
    expect(ui).toContain('derived.groupById')
    expect(ui).toContain("store.mutation('propose_product_state'")
    expect(ui).toContain("action === 'exclude' ? 'Proponer exclusión' : 'Proponer reincorporación'")
    expect(ui).toContain('No modifica el estado del producto ahora.')
    expect(ui).not.toContain("useCatalogQuery('products'")
    expect(ui).not.toContain('group_products')
    expect(ui).not.toContain('catalog_change_action')
  })
})
