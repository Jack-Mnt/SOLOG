import { describe, expect, test } from 'bun:test'

describe('Grupos V1 UI', () => {
  test('usa una sola superficie de grupos con filtros y detalle bajo demanda', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    expect(ui).toContain("useGroupsQuery('groups'")
    expect(ui).toContain("useGroupsQuery('group_detail'")
    expect(ui).toContain('Buscar por nombre o máscara')
    expect(ui).toContain('Tipo derivado')
    expect(ui).toContain('Ver detalle')
    expect(ui).not.toContain('admin-groups__navigation')
  })
  test('crea y mueve varios SKU con los contratos V1, sin clasificar ni editar precio unitario', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    expect(ui).toContain("store.mutation('group_create'")
    expect(ui).toContain("store.mutation('membership_move'")
    expect(ui).toContain("store.mutation('make_unique'")
    expect(ui).toContain("store.mutation('group_update'")
    expect(ui).toContain("useGroupsQuery('products'")
    expect(ui).toContain('El movimiento es atómico')
    expect(ui).toContain('La categoría operativa de los SKU seleccionados cambiará')
    for (const legacy of ['group_change_save', 'group_products', 'update_package_price', 'PackagePrice', 'Modalidad', 'Precio unitario<input']) expect(ui).not.toContain(legacy)
  })
  test('no ofrece candidatos excluidos ni incorpora una superficie administrativa de Productos', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    const contract = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v1.ts').text()
    expect(contract).toContain("['Único', 'Agrupado']")
    expect(contract).not.toContain("'Excluido'")
    expect(ui).not.toContain('Gestionar en Catálogo')
    expect(ui).not.toContain('Clasificar')
  })
  test('presenta errores backend sin reinterpretar la autoridad', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    for (const code of ['SOLOG_MASTERDATA_REVISION_CONFLICT', 'SOLOG_LOCK_CONFLICT_RETRYABLE', 'SOLOG_CATALOG_STAGING_CONFLICT', 'SOLOG_GROUP_PRICE_MISMATCH', 'SOLOG_GROUP_NAME_CONFLICT']) expect(ui).toContain(code)
    expect(ui).toContain('Reintentar misma operación')
  })
})
