import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Delta post-revisión: primitives compartidas Admin', () => {
  test('QuickFilterChip usa una primitive común y preserva Control como consumidor de referencia', async () => {
    const [css, control, products, groups] = await Promise.all([
      source('src/features/solog/admin/admin.css'),
      source('src/features/solog/admin/control/admin.control.v2.tsx'),
      source('src/features/solog/admin/productos/admin.productos.v1.tsx'),
      source('src/features/solog/admin/grupos/admin.grupos.v2.tsx'),
    ])

    expect(css).toContain('.admin-quick-filter-chip {')
    expect(css).toContain('.admin-quick-filter-chip[aria-pressed="true"]')
    expect(css).toContain('.admin-quick-filter-chip:focus-visible')
    expect(css).toContain('.admin-quick-filter-chip strong')
    expect(control).toContain('admin-control__chip admin-quick-filter-chip')
    expect(products).toContain('className="admin-quick-filter-chip"')
    expect(groups).toContain('className="admin-quick-filter-chip"')
  })

  test('StateView usa la primitive común de Catálogo también en Incidencias', async () => {
    const [css, catalog, incidents] = await Promise.all([
      source('src/features/solog/admin/admin.css'),
      source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx'),
      source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx'),
    ])

    expect(css).toContain('.admin-state-views {')
    expect(css).toContain('.admin-state-views > button {')
    expect(css).toContain('.admin-state-views > button strong')
    expect(css).toContain('.admin-state-views > button[aria-selected="true"]')
    expect(css).not.toContain('.admin-catalog__views button {')
    expect(catalog).toContain('admin-catalog__views admin-state-views')
    expect(incidents).toContain('admin-incidents__state-views admin-state-views')
  })

  test('el delta permanece frontend-only y no agrega lecturas para los contadores', async () => {
    const [products, groups, incidents] = await Promise.all([
      source('src/features/solog/admin/productos/admin.productos.v1.tsx'),
      source('src/features/solog/admin/grupos/admin.grupos.v2.tsx'),
      source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx'),
    ])

    expect(products).not.toContain("useCatalogQuery('products'")
    expect(groups).not.toContain('useGroupsQuery')
    expect(groups).not.toContain('groupsRead(')
    expect(incidents.match(/useManagementQuery\("summary"/g) ?? []).toHaveLength(1)
  })
})
