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

    expect(css).toMatch(/\.admin-quick-filter-chip\s*\{/)
    expect(css).toMatch(/\.admin-quick-filter-chip\[aria-pressed=["']true["']\]/)
    expect(css).toMatch(/\.admin-quick-filter-chip:focus-visible/)
    expect(css).toMatch(/\.admin-quick-filter-chip\s+strong/)
    expect(control).toMatch(/className=["'][^"']*admin-quick-filter-chip[^"']*["']/)
    expect(control).toContain('tone--success')
    expect(control).toContain('tone--warning')
    expect(control).toContain('tone--info')
    expect(control).toContain('tone--danger')
    expect(products).toMatch(/className=["'][^"']*admin-quick-filter-chip[^"']*["']/)
    expect(groups).toMatch(/className=["'][^"']*admin-quick-filter-chip[^"']*["']/)
  })

  test('StateView usa la primitive común de Catálogo también en Incidencias', async () => {
    const [css, catalog, incidents] = await Promise.all([
      source('src/features/solog/admin/admin.css'),
      source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx'),
      source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx'),
    ])

    expect(css).toMatch(/\.admin-state-views\s*\{/)
    expect(css).toMatch(/\.admin-state-views\s*>\s*button\s*\{/)
    expect(css).toMatch(/\.admin-state-views\s*>\s*button\s+strong/)
    expect(css).toMatch(/\.admin-state-views\s*>\s*button\[aria-selected=["']true["']\]/)
    expect(catalog).toMatch(/className=["'][^"']*admin-state-views[^"']*["']/)
    expect(incidents).toMatch(/className=["'][^"']*admin-state-views[^"']*["']/)
  })

  test('el delta permanece frontend-only y no agrega lecturas para los contadores', async () => {
    const [products, groups, incidents] = await Promise.all([
      source('src/features/solog/admin/productos/admin.productos.v1.tsx'),
      source('src/features/solog/admin/grupos/admin.grupos.v2.tsx'),
      source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx'),
    ])

    expect(products).not.toMatch(/useCatalogQuery\(\s*["']products["']/)
    expect(groups).not.toContain('useGroupsQuery')
    expect(groups).not.toContain('groupsRead(')
    expect(incidents.match(/useManagementQuery\(\s*["']summary["']/g) ?? []).toHaveLength(1)
  })
})
