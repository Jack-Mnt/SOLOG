import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Grupos V1 UI sobre Master Data', () => {
  test('usa una sola superficie derivada con tabla y filtros locales', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
    expect(ui).toContain('useMasterData()')
    expect(ui).toContain('deriveGroupRows')
    expect(ui).toContain('filterAndSortGroups')
    expect(ui).toContain('<th scope="col">Grupo</th><th scope="col">Categoría</th><th scope="col">Integrantes</th><th scope="col">Valorizado</th>')
    expect(ui).not.toContain('<th scope="col">Editar</th>')
    expect(ui).not.toContain('<th scope="col">Precio')
    expect(ui).toContain('Máscara, integrante, SKU o marca')
    expect(ui).not.toContain('useGroupsQuery')
    for (const read of ["'groups'", "'reference'", "'group_detail'", "'products'"]) expect(ui).not.toContain(`useGroupsQuery(${read}`)
  })

  test('crea y opera integrantes con mutaciones V1 sin clasificar ni editar precio unitario', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
    const members = await source('src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx')
    expect(ui).toContain("store.mutation('group_create'")
    expect(ui).toContain("store.mutation('group_update'")
    expect(members).toContain("store.mutation('membership_move'")
    expect(members).toContain("store.mutation('make_unique'")
    expect(members).toContain('El movimiento es atómico')
    expect(members).toContain('La categoría operativa de los SKU seleccionados cambiará')
    for (const legacy of ['group_change_save', 'group_products', 'update_package_price', 'PackagePrice', 'Modalidad', 'Precio unitario<input']) expect(`${ui}\n${members}`).not.toContain(legacy)
  })

  test('excluye candidatos Excluido y no crea una superficie Productos', async () => {
    const model = await source('src/features/solog/admin/grupos/admin.grupos.model.ts')
    const ui = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
    expect(model).toContain("product.estado !== 'Excluido'")
    expect(ui).not.toContain('Gestionar en Catálogo')
    expect(ui).not.toContain('Clasificar')
    expect(ui).not.toContain('Productos</')
  })

  test('presenta errores backend y retry exacto sin reinterpretar la autoridad', async () => {
    const messages = await source('src/features/solog/admin/grupos/admin.grupos.messages.ts')
    const members = await source('src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx')
    for (const code of ['SOLOG_MASTERDATA_REVISION_CONFLICT', 'SOLOG_LOCK_CONFLICT_RETRYABLE', 'SOLOG_CATALOG_STAGING_CONFLICT', 'SOLOG_GROUP_PRICE_MISMATCH', 'SOLOG_GROUP_NAME_CONFLICT']) expect(messages).toContain(code)
    expect(members).toContain('Reintentar misma operación')
  })
})
