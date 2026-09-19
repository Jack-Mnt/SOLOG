export const ADMIN_PAGE_SIZE = 50

export type AdminPage<T> = {
  rows: T[]
  currentPage: number
  pageCount: number
  offset: number
}

export function paginateAdminRows<T>(
  rows: readonly T[],
  page: number,
  pageSize = ADMIN_PAGE_SIZE,
): AdminPage<T> {
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize))
  const lastPage = Math.max(0, Math.ceil(rows.length / normalizedPageSize) - 1)
  const currentPage = Math.min(Math.max(0, Math.trunc(page)), lastPage)
  const offset = currentPage * normalizedPageSize

  return {
    rows: rows.slice(offset, offset + normalizedPageSize),
    currentPage,
    pageCount: lastPage + 1,
    offset,
  }
}
