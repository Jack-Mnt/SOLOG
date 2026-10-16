import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

test('Fase 2 pagina Grupos después del filtrado completo', async () => {
  const page = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')

  expect(page).toContain('paginateAdminRows(visible, page)')
  expect(page).toContain('paginated.rows.map')
  expect(page).toContain('total={visible.length}')
  expect(page).toContain('JSON.stringify([search, categoryId, type, valuation, sort])')
  expect(page).toContain('currentPage={paginated.currentPage}')
})

test('Fase 2 pagina solo la tabla principal de Incidencias', async () => {
  const page = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')

  expect(page).toContain('paginateAdminRows(families, page)')
  expect(page).toContain('paginatedFamilies.rows.map')
  expect(page).toContain('total={families.length}')
  expect(page).toContain('JSON.stringify([type, state, siteId, allActive])')
  expect(page).not.toMatch(/page_size:\s*100/)
})

test('Dashboard V1 pagina observaciones físicas con cursores de 25', async () => {
  const [drawer, types] = await Promise.all([
    source('src/features/solog/admin/dashboard/admin.dashboard.metrics.day.tsx'),
    source('src/features/solog/admin/dashboard/admin.dashboard.metrics.types.ts'),
  ])
  expect(drawer).toContain('PAGE_SIZE = 25')
  expect(drawer).toContain("useDashboardMetrics(store, 'day_observations'")
  expect(drawer).toContain('nextCursor')
  expect(drawer).toContain('Mostrar 25 más')
  expect(drawer).not.toContain('paginateAdminRows')
  expect(types).toContain('confirmed_next_cursor: null')
})

test('Grupos e Incidencias conservan AdminPagination; Dashboard usa keyset', async () => {
  const groups = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
  const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')
  const dashboard = await source('src/features/solog/admin/dashboard/admin.dashboard.metrics.day.tsx')
  expect(groups).toContain('<AdminPagination')
  expect(incidents).toContain('<AdminPagination')
  expect(dashboard).toContain("useDashboardMetrics(store, 'day_observations'")
  expect(groups).not.toContain('admin-control__pagination')
  expect(incidents).not.toContain('admin-control__pagination')
  expect(dashboard).not.toContain('admin-control__pagination')
})
