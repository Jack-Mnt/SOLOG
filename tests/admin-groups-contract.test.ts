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

  test('Grupos activo lee Master Data y usa V1 solo para mutaciones', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    const adapter = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v1.ts').text()
    expect(ui).toContain('useMasterData()')
    expect(ui).not.toContain('useGroupsQuery')
    expect(ui).toContain("store.mutation('group_create'")
    expect(adapter).toContain('rpc_solog_admin_groups_read_v1')
    expect(adapter).toContain('rpc_solog_admin_groups_v1')
    for (const legacy of ['group_change_save', 'group_products', 'update_package_price', 'PackagePrice', 'useManagement']) expect(ui).not.toContain(legacy)
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
    expect(incidents).toMatch(/family\.tipo === ['"]producto_ausente['"]/)
    expect(incidents).toMatch(/act\(item, ['"]propose_delete['"]\)/)
    expect(incidents).toContain('Proponer eliminación no')
    expect(incidents).toContain('La propuesta de eliminación quedó pendiente para revisión en Catálogo.')
    expect(catalog).toMatch(/eliminar_producto[\s\S]*excluir_producto[\s\S]*nombre[\s\S]*codigo/)
  })
})
