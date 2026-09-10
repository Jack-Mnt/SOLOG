import { describe, expect, test } from 'bun:test'

describe('A4 contrato maestro V6 y frontera Catálogo V3', () => {
  test('la infraestructura V2 se conserva para Grupos, sin acceso directo a tablas', async () => {
    const api = await Bun.file('src/features/solog/api.ts').text()
    const adapter = await Bun.file('src/features/solog/admin/admin.management.v2.ts').text()
    expect(api).not.toMatch(/rpc_solog_admin'|rpc_solog_catalog'/)
    expect(adapter).toContain('rpc_solog_admin_master_read_v2')
    expect(adapter).toContain('rpc_solog_admin_master_v2')
    expect(adapter).not.toContain('.from(')
  })

  test('Grupos conserva grupos y paquete, pero no clasifica SKU hacia o desde Excluido', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    expect(ui).toContain("store.mutation('group_change_save'")
    expect(ui).toContain('member_codes: members')
    expect(ui).toContain("p.estado === 'Excluido' ? <span>Gestionar en Catálogo</span>")
    expect(ui).toContain("useState<'Único' | 'Agrupado'>")
    expect(ui).not.toContain("setMode(e.target.value as GroupProduct['estado'])")
    expect(ui).toContain("import { PackagePrice } from '../admin.package-price.v2'")
  })

  test('Catálogo activo usa V3 y la pantalla V2 retirada no conserva autoridad', async () => {
    const active = await Bun.file('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx').text()
    expect(await Bun.file('src/features/solog/admin/catalogo/admin.catalogo.v2.tsx').exists()).toBe(false)
    expect(active).toContain("useCatalogQuery('proposals'")
    expect(active).toContain("useCatalogQuery('price_options'")
    expect(active).not.toContain('useManagementQuery')
    for (const legacy of ['catalog_changes', 'group_products', 'price_mismatch_options', 'resolve_group_price', 'update_package_price', 'admin.package-price.v2']) expect(active).not.toContain(legacy)
  })

  test('Incidencias conserva Proponer eliminación humano y Catálogo lo presenta como emergente', async () => {
    const incidents = await Bun.file('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx').text()
    const catalog = await Bun.file('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx').text()
    expect(incidents).toContain("f.tipo === 'producto_ausente'")
    expect(incidents).toContain("act(f, 'propose_delete')")
    expect(incidents).toContain('Proponer eliminación no elimina ni suprime.')
    expect(catalog).toContain("['eliminar_producto', 'excluir_producto', 'nombre', 'codigo']")
  })
})