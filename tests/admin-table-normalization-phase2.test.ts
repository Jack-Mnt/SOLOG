import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Admin table normalization — Phase 2 Dashboard + Control', () => {
  test('Dashboard usa main table, row headers y percentage action y mantiene DailyDrawer como tabla auxiliar', async () => {
    const [dashboard, css] = await Promise.all([
      source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx'),
      source('src/features/solog/admin/admin.css'),
    ])

    expect(dashboard).toContain('className="admin-main-table"')
    expect(dashboard).toContain('<th scope="row">{label}</th>')
    expect(dashboard).toContain('<th scope="row">Total</th>')
    expect(dashboard).toContain('className="admin__percentage-action"')
    expect(dashboard).toContain('className="admin-auxiliary-table"')
    expect(css).toContain('.admin-dashboard__detail > .admin-main-table')
    expect(css).not.toContain('.admin-dashboard__detail > .admin-v2-table')
    expect(css).not.toContain('.admin-dashboard__detail > .admin-main-table .icon-button')
  })

  test('Control normaliza headers, row identity, numéricos y acción de detalle', async () => {
    const control = await source('src/features/solog/admin/control/admin.control.v2.tsx')

    expect(control).toContain('className="admin-table-section"')
    expect(control).not.toContain('className="admin-table-section admin__table"')
    expect(control).toContain('<th scope="col">Registrado</th>')
    expect(control).toContain('<th scope="col">Grupo</th>')
    expect(control).toContain('<th scope="row">{row.group_name}</th>')
    expect(control).toContain('className="admin-table-number">Diferencia</th>')
    expect(control).toContain('className="admin-table-number">Valorizado</th>')
    expect(control).toContain('className="admin-table-action-cell">Detalle</th>')
    expect(control).toContain('<div className="admin-table-actions">')
    expect(control).toContain('<IconButton')
    expect(control).toContain('title="Ver detalle"')
  })

  test('Control mantiene la cronología como tabla auxiliar fuera del alcance principal', async () => {
    const control = await source('src/features/solog/admin/control/admin.control.v2.tsx')

    expect(control).toContain('className="admin-auxiliary-table admin-control-chronology__table"')
    expect(control).toContain('useAdminQuery("control_chronology"')
  })

  test('Dashboard preserva matriz centrada y normaliza thead sin perder primera columna sticky', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toMatch(/\.admin-dashboard__detail > \.admin-main-table th,[\s\S]*?text-align:\s*center/)
    expect(css).toMatch(/\.admin-dashboard__detail > \.admin-main-table th:first-child\s*\{[\s\S]*?position:\s*sticky[\s\S]*?left:\s*0/)
    expect(css).toMatch(/\.admin-dashboard__detail > \.admin-main-table thead th:first-child\s*\{[\s\S]*?z-index:\s*3/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?background:\s*var\(--color-surface-secondary\)/)
  })
})
