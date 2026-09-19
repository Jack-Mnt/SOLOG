import { expect, test } from 'bun:test'
import { paginateAdminRows } from '../src/features/solog/admin/admin.pagination'

test('paginación Admin limita, corrige página y admite tamaños específicos', () => {
  const rows = Array.from({ length: 121 }, (_, index) => index + 1)

  expect(paginateAdminRows(rows, 0)).toEqual({
    rows: rows.slice(0, 50),
    currentPage: 0,
    pageCount: 3,
    offset: 0,
  })
  expect(paginateAdminRows(rows, 99).currentPage).toBe(2)
  expect(paginateAdminRows(rows, 1, 25)).toEqual({
    rows: rows.slice(25, 50),
    currentPage: 1,
    pageCount: 5,
    offset: 25,
  })
  expect(rows).toHaveLength(121)
})

test('primitive de paginación conserva las clases visuales normalizadas', async () => {
  const primitive = await Bun.file('src/features/solog/admin/admin.primitives.tsx').text()
  const css = await Bun.file('src/features/solog/admin/admin.css').text()

  expect(primitive).toContain('className="admin-pagination"')
  expect(primitive.match(/button button--secondary navigation-button/g)?.length).toBe(2)
  expect(primitive).toContain('if (total <= pageSize || pageCount <= 1) return null')
  expect(css).toContain('.admin-pagination {')
  expect(css).toContain('.admin-v2-workspace .navigation-button {')
  expect(css).not.toContain('.admin-control__pagination')
})
