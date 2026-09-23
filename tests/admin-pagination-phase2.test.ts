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
  expect(page).toMatch(/page_size:\s*100/)
})

test('Fase 2 pagina Dashboard DailyDrawer con bootstrap y páginas remotas de Fase 8.2B', async () => {
  const page = await source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx')

  expect(page).toContain('useAdminQuery("daily_detail_bootstrap"')
  expect(page).toContain('"daily_detail_page"')
  expect(page).toContain('DAILY_DETAIL_PAGE_SIZE = 25')
  expect(page).not.toContain('paginateAdminRows')
  expect(page).toContain('const total = stateCounts[selectedState]')
  expect(page).toContain('currentPage={currentPage}')
  expect(page).toContain('pageSize={DAILY_DETAIL_PAGE_SIZE}')
  expect(page).toContain('ariaLabel="Paginación del detalle diario"')
})

test('Fase 2 reutiliza AdminPagination y no introduce clases visuales nuevas', async () => {
  const groups = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
  const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')
  const dashboard = await source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx')

  for (const page of [groups, incidents, dashboard]) {
    expect(page).toContain('<AdminPagination')
  }
  expect(groups).not.toContain('admin-control__pagination')
  expect(incidents).not.toContain('admin-control__pagination')
  expect(dashboard).not.toContain('admin-control__pagination')
})
