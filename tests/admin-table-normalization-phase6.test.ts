import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const adminTableFiles = [
  'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
  'src/features/solog/admin/control/admin.control.v2.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
  'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
]

describe('Admin table normalization — Phase 6 global review', () => {
  test('cada módulo principal usa una única main table y la familia legacy desaparece', async () => {
    const [dashboard, control, catalog, products, groups, incidents, css] = await Promise.all([
      source(adminTableFiles[0]),
      source(adminTableFiles[1]),
      source(adminTableFiles[2]),
      source(adminTableFiles[3]),
      source(adminTableFiles[4]),
      source(adminTableFiles[6]),
      source('src/features/solog/admin/admin.css'),
    ])

    for (const module of [dashboard, control, catalog, products, groups, incidents]) {
      expect(module.match(/admin-main-table/g) ?? []).toHaveLength(1)
    }

    for (const content of [...await Promise.all(adminTableFiles.map(source)), css]) {
      expect(content).not.toContain('admin-v2-table')
    }
  })

  test('las tablas auxiliares vigentes permanecen aisladas y Fase 8 retira dos superficies tabulares', async () => {
    const [dashboard, control, catalog, groupsDialog, incidents] = await Promise.all([
      source(adminTableFiles[0]),
      source(adminTableFiles[1]),
      source(adminTableFiles[2]),
      source(adminTableFiles[5]),
      source(adminTableFiles[6]),
    ])

    expect(dashboard.match(/admin-auxiliary-table/g) ?? []).toHaveLength(1)
    expect(control.match(/admin-auxiliary-table/g) ?? []).toHaveLength(0)
    expect(catalog.match(/admin-auxiliary-table/g) ?? []).toHaveLength(1)
    expect(groupsDialog.match(/admin-auxiliary-table/g) ?? []).toHaveLength(1)
    expect(incidents.match(/admin-auxiliary-table/g) ?? []).toHaveLength(0)
    expect(control).toContain('className="admin-control-chronology__timeline"')
    expect(incidents).toContain('className="admin-incidents__site-repetitions"')
  })

  test('el contrato CSS global conserva sticky, densidad, números, acciones e identidad', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toMatch(/\.admin-main-table th,[\s\S]*?padding:\s*8px 12px/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?position:\s*sticky/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?font-size:\s*0\.75rem/)
    expect(css).toMatch(/\.admin-main-table tbody tr:hover\s*\{[\s\S]*?var\(--color-surface-secondary\)/)
    expect(css).toMatch(/\.admin-table-number\s*\{[\s\S]*?text-align:\s*right[\s\S]*?tabular-nums/)
    expect(css).toMatch(/\.admin-table-action-cell\s*\{[\s\S]*?text-align:\s*center/)
    expect(css).toMatch(/\.admin-table-actions\s*\{[\s\S]*?gap:\s*6px/)
    expect(css).toContain('.admin-table-cell-stack')
    expect(css).toContain('.admin-table-cell-primary')
    expect(css).toContain('.admin-table-cell-secondary')
  })

  test('IconButton y las dos excepciones conservan el contrato congelado', async () => {
    const [primitive, dashboard, groups, css] = await Promise.all([
      source('src/features/solog/admin/admin.primitives.tsx'),
      source(adminTableFiles[0]),
      source(adminTableFiles[4]),
      source('src/features/solog/admin/admin.css'),
    ])

    expect(primitive).toContain("'default' | 'primary' | 'warning' | 'danger'")
    expect(dashboard).toContain('className="admin__percentage-action"')
    expect(css).toMatch(/\.admin__percentage-action\s*\{/)
    expect(groups).toContain('className="button button--secondary admin-groups__members"')
    expect(groups).toContain('PackageOpen')
  })

  test('no quedan selectores locales reemplazados por la normalización', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    for (const selector of [
      '.admin__table',
      '.admin-catalog__product-code',
      '.admin-catalog__product-name',
      '.admin-catalog__money',
      '.admin-groups__row-actions',
      '.admin-incidents__product',
    ]) {
      expect(css).not.toContain(selector)
    }
  })
})
