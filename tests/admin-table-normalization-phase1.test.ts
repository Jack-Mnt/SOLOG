import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Admin table normalization — Phase 1 infrastructure', () => {
  test('separa tablas principales y auxiliares manteniendo compatibilidad transitoria', async () => {
    const [css, control] = await Promise.all([
      source('src/features/solog/admin/admin.css'),
      source('src/features/solog/admin/control/admin.control.v2.tsx'),
    ])

    expect(css).toContain('.admin-main-table,')
    expect(css).toMatch(/\.admin-auxiliary-table/)
    expect(css).toMatch(/\.admin-v2-table/)
    expect(control).toContain('className="admin-main-table"')
    expect(control).toContain('className="admin-auxiliary-table admin-control-chronology__table"')
  })

  test('admin-main-table congela densidad, sticky header, hover y utilities comunes', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toMatch(/\.admin-main-table th,[\s\S]*?padding:\s*8px 12px/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?position:\s*sticky/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?font-size:\s*0\.75rem/)
    expect(css).toMatch(/\.admin-main-table tbody tr:hover\s*\{[\s\S]*?var\(--color-surface-secondary\)/)
    expect(css).toContain('.admin-table-cell-stack')
    expect(css).toContain('.admin-table-cell-primary')
    expect(css).toContain('.admin-table-cell-secondary')
    expect(css).toContain('.admin-table-number')
    expect(css).toContain('.admin-table-action-cell')
    expect(css).toContain('.admin-table-actions')
  })

  test('IconButton soporta Warning como variante contractual', async () => {
    const [primitive, css] = await Promise.all([
      source('src/features/solog/admin/admin.primitives.tsx'),
      source('src/features/solog/admin/admin.css'),
    ])

    expect(primitive).toContain("'default' | 'primary' | 'warning' | 'danger'")
    expect(primitive).toContain("variant === 'warning' ? 'icon-button--warning' : ''")
    expect(css).toMatch(/\.icon-button--warning\s*\{/)
    expect(css).toMatch(/\.icon-button--warning:hover:not\(:disabled\)/)
  })

  test('percentage action existe como acción reutilizable independiente de IconButton', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toMatch(/\.admin__percentage-action\s*\{/)
    expect(css).toMatch(/\.admin__percentage-action:hover:not\(:disabled\)/)
    expect(css).toMatch(/\.admin__percentage-action:focus-visible/)
  })
})
