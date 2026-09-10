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
    expect(ui).not.toContain('admin.package-price.v2')
    expect(ui).toContain("store.mutation('prepare_product'")
    expect(ui).toContain("store.mutation('prepare_price'")
    expect(ui).toContain("useCatalogQuery('reference', {})")
    expect(ui).toContain("useCatalogQuery('price_options'")
    expect(ui).toContain("useCatalogQuery('publication_preview', {})")
    expect(ui).toContain('store.publish()')
  })

  test('expone estados UI, reintentos y controles accesibles de staging y publicación', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    for (const state of ['QueryState', 'role="alert"', 'role="status"', 'Reintentar misma operación', 'No hay propuestas', 'configuración requerida antes de publicar', 'Existe staging preparado', 'No publicable:', 'Confirmar publicación', 'Recuperar publicación']) expect(ui).toContain(state)
    expect(ui).toContain('aria-label="Estado de propuestas"')
    expect(ui).toContain('aria-label="Superficies de Catálogo"')
    expect(ui).toContain('disabled={!admin || !!receipt.pending || (!receipt.operationId && !preview?.ok)}')
  })
  test('opera Productos sobre una carga completa local y crea propuestas de estado V3', async () => {
    const ui = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    expect(ui).toContain('useMemo')
    expect(ui).toContain('query.data.total')
    expect(ui).toContain('query.data.setup_required')
    expect(ui).toContain("store.mutation('propose_product_state'")
    expect(ui).toContain("action === 'exclude' ? 'Proponer exclusión' : 'Proponer reincorporación'")
    expect(ui).toContain('No modifica el estado del producto ahora.')
    expect(ui).not.toContain('group_products')
    expect(ui).not.toContain('catalog_change_action')
  })
})
