import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Admin table normalization — Phase 5 auxiliary migration + local cleanup', () => {
  test('retira admin-v2-table del CSS y de todos los consumidores Admin', async () => {
    const paths = [
      'src/features/solog/admin/admin.css',
      'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
      'src/features/solog/admin/control/admin.control.v2.tsx',
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
      'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    ]

    const contents = await Promise.all(paths.map(source))
    for (const content of contents) expect(content).not.toContain('admin-v2-table')
  })

  test('las tablas auxiliares conocidas usan la familia explícita', async () => {
    const [dashboard, catalog, groupsDialog, incidents, control] = await Promise.all([
      source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx'),
      source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx'),
      source('src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx'),
      source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx'),
      source('src/features/solog/admin/control/admin.control.v2.tsx'),
    ])

    expect(dashboard).toContain('className="admin-auxiliary-table admin-dashboard-daily__table"')
    expect(catalog).toContain('className="admin-auxiliary-table admin-catalog__table"')
    expect(groupsDialog).toContain('className="admin-auxiliary-table"')
    expect(incidents).not.toContain('admin-incidents__detail-table')
    expect(incidents).toContain('className="admin-incidents__site-repetitions"')
    expect(control).not.toContain('admin-control-chronology__table')
    expect(control).toContain('className="admin-control-chronology__timeline"')
  })

  test('CSS mantiene una base mínima para tablas auxiliares y separa main-table', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toMatch(/\.admin-main-table,\s*\n\.admin-auxiliary-table\s*\{/)
    expect(css).toMatch(/\.admin-main-table th,[\s\S]*?\.admin-auxiliary-table td\s*\{[\s\S]*?padding:\s*8px/)
    expect(css).toMatch(/\.admin-main-table thead th,\s*\n\.admin-auxiliary-table thead th\s*\{/)
    expect(css).toMatch(/\.admin-main-table tbody th\[scope="row"\],[\s\S]*?\.admin-auxiliary-table tbody th\[scope="row"\]/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?position:\s*sticky/)
    expect(css).not.toContain(':where(.admin-v2-table')
  })

  test('retira selectores locales sustituidos por el contrato normalizado', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).not.toContain('.admin__table')
    expect(css).not.toContain('.admin-catalog__product-code')
    expect(css).not.toContain('.admin-catalog__product-name')
    expect(css).not.toContain('.admin-catalog__money')
    expect(css).not.toContain('.admin-groups__row-actions')
    expect(css).not.toContain('.admin-incidents__product')
  })
})
