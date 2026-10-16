import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Admin table normalization — Phase 2 Dashboard + Control', () => {
  test('Dashboard V1 utiliza las familias main/auxiliary en sus vistas especializadas', async () => {
    const [risk, episodes, activity, day, rounds] = await Promise.all([
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.risk.tsx'),
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.episodes.tsx'),
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.activity.tsx'),
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.day.tsx'),
      source('src/features/solog/admin/dashboard/admin.dashboard.metrics.rounds.tsx'),
    ])
    expect(risk).toContain('admin-main-table')
    expect(episodes).toContain('admin-main-table')
    expect(activity).toContain('admin-main-table')
    expect(day).toContain('admin-main-table')
    expect(day).toContain('admin-auxiliary-table')
    expect(rounds).toContain('admin-auxiliary-table')
    expect(activity).toContain('<th scope="row">{shift.label}</th>')
    expect(day).toContain('<th scope="row">{row.group_name}</th>')
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

  test('Control Fase 8 reemplaza la cronología auxiliar por timeline fuera de main-table', async () => {
    const control = await source('src/features/solog/admin/control/admin.control.v2.tsx')

    expect(control).not.toContain('admin-control-chronology__table')
    expect(control).toContain('className="admin-control-chronology__timeline"')
    expect(control).toContain('useAdminQuery("control_chronology_view"')
  })

  test('Dashboard preserva matriz centrada y normaliza thead sin perder primera columna sticky', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toMatch(/\.admin-dashboard__detail > \.admin-main-table th,[\s\S]*?text-align:\s*center/)
    expect(css).toMatch(/\.admin-dashboard__detail > \.admin-main-table th:first-child\s*\{[\s\S]*?position:\s*sticky[\s\S]*?left:\s*0/)
    expect(css).toMatch(/\.admin-dashboard__detail > \.admin-main-table thead th:first-child\s*\{[\s\S]*?z-index:\s*3/)
    expect(css).toMatch(/\.admin-main-table thead th\s*\{[\s\S]*?background:\s*var\(--color-surface-secondary\)/)
  })
})
