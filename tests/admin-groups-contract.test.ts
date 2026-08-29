import { describe, expect, test } from 'bun:test'

describe('contrato administrativo de Grupos', () => {
  test('guarda directamente y refresca el estado actual', async () => {
    const [api, hook] = await Promise.all([
      Bun.file('src/features/solog/api.ts').text(),
      Bun.file('src/features/solog/admin/groups/useAdminGroups.ts').text(),
    ])

    expect(api).toContain("'rpc_solog_admin', 'group_change_save'")
    expect(hook).toContain('await saveAdminGroupChange(change)')
    expect(hook).toContain('await load(appliedFilters, offset)')
    expect(hook).not.toContain('propuesta estructural')
    expect(hook).not.toContain('próxima versión')
  })

  test('la UI de Grupos no presenta un workflow de propuestas', async () => {
    const sources = await Promise.all([
      Bun.file('src/features/solog/admin/groups/GroupsPanel.tsx').text(),
      Bun.file('src/features/solog/admin/groups/GroupDefinitionDialog.tsx').text(),
      Bun.file('src/features/solog/admin/groups/ProductClassificationDialog.tsx').text(),
    ])
    const source = sources.join('\n')

    expect(source).toContain('Editar grupo')
    expect(source).toContain('Cambiar clasificación')
    expect(source).not.toMatch(/Guardar propuesta|Proponer edición|Proponer clasificación/)
    expect(source).not.toMatch(/Cambio futuro|próxima versión|Integrantes publicados/)
  })
})

describe('separación del Catálogo ConeXion', () => {
  test('expone únicamente los cinco cambios comerciales', async () => {
    const [types, filters, publication] = await Promise.all([
      Bun.file('src/features/solog/types.ts').text(),
      Bun.file('src/features/solog/admin/catalog/CatalogFilters.tsx').text(),
      Bun.file('src/features/solog/admin/catalog/CatalogPublicationDialog.tsx').text(),
    ])
    const structuralTypes = /clasificacion_producto|definicion_grupo/

    expect(types).not.toMatch(structuralTypes)
    expect(filters).not.toMatch(structuralTypes)
    expect(publication).not.toMatch(structuralTypes)
  })

  test('publishCatalog conserva conexion-admin y publish_catalog', async () => {
    const api = await Bun.file('src/features/solog/api.ts').text()

    expect(api).toContain("'conexion-admin'")
    expect(api).toContain("action: 'publish_catalog'")
  })
})
