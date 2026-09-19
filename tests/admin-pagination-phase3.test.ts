import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

test('Fase 3 pagina Urgentes y Emergentes de forma independiente a 25', async () => {
  const page = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')

  expect(page).toContain('key={`${status}:urgent`}')
  expect(page).toContain('key={`${status}:emerging`}')
  expect(page).toContain('const CATALOG_PROPOSAL_PAGE_SIZE = 25')
  expect(page).toContain('paginateAdminRows(rows, page, CATALOG_PROPOSAL_PAGE_SIZE)')
  expect(page).toContain('paginated.rows.map')
  expect(page).toContain('pageSize={CATALOG_PROPOSAL_PAGE_SIZE}')
  expect(page).toContain('if (paginated.currentPage !== page) setPage(paginated.currentPage)')
  expect(page).toContain('total={rows.length}')
})

test('Fase 3 mantiene el total de cada sección y no añade clases visuales nuevas', async () => {
  const page = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')

  expect(page).toContain('<span>{rows.length}</span>')
  expect(page).toContain('<AdminPagination')
  expect(page).not.toContain('admin-control__pagination')
  expect(page).not.toContain('admin-catalog__pagination')
})
