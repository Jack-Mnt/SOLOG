import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('Admin table normalization — Phase 4 Grupos + Incidencias', () => {
  test('Grupos usa main table, conserva Integrantes especializado y normaliza valorizado/acciones', async () => {
    const groups = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')

    expect(groups).toContain('className="admin-main-table"')
    expect(groups).toContain('<th scope="col" className="admin-table-number">Valorizado</th>')
    expect(groups).toContain('<th scope="col" className="admin-table-action-cell">Acciones</th>')
    expect(groups).toContain('className="button button--secondary admin-groups__members"')
    expect(groups).toContain('className="admin-groups__valuation admin-table-number"')
    expect(groups).toContain('className="admin-table-actions"')
    expect(groups.match(/<IconButton/g) ?? []).toHaveLength(2)
  })

  test('Incidencias usa main table y mantiene la tabla de detalle en la familia auxiliar', async () => {
    const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')

    expect(incidents).toContain('className="admin-main-table"')
    expect(incidents).toContain('className="admin-auxiliary-table admin-incidents__detail-table"')
    expect(incidents).not.toContain('className="admin-table-section admin__table"')
    expect(incidents).toContain('<th scope="col">Tipo</th>')
    expect(incidents).toContain('<th scope="col">Producto</th>')
    expect(incidents).toContain('<th scope="col">Sedes</th>')
    expect(incidents).toContain('className="admin-table-action-cell">Acciones</th>')
  })

  test('Incidencias comparte identidad principal/secundaria y usa la primitive IconButton por semántica', async () => {
    const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')

    expect(incidents).toContain('admin-table-cell-stack')
    expect(incidents).toContain('admin-table-cell-primary')
    expect(incidents).toContain('admin-table-cell-secondary')
    expect(incidents).toContain('className="admin-table-actions"')
    expect(incidents).toContain('variant="warning"')
    expect(incidents).toContain('variant="danger"')
    expect(incidents).toContain('aria-label="Ignorar 30 días"')
    expect(incidents).toContain('aria-label="Proponer eliminación"')
    expect(incidents).toContain('aria-label="Reactivar incidencia"')
  })

  test('CSS de Grupos deja que main-table gobierne densidad, thead y hover', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toContain('.admin-groups__table .admin-main-table:focus-visible')
    expect(css).not.toMatch(/\.admin-groups__table thead\s*\{/)
    expect(css).not.toMatch(/\.admin-groups__table th,\s*\n\.admin-groups__table td\s*\{/)
    expect(css).not.toMatch(/\.admin-groups__table tbody tr:hover\s*\{/)
  })
})
