import type { MasterDataDerived, MasterDataProduct } from '../masterdata/admin.masterdata.v1'

export type ProductStateFilter = 'all' | 'incluido' | 'excluido'
export type ProductModeFilter = 'all' | MasterDataProduct['estado']
export type ProductSort = 'name' | 'code' | 'price_asc' | 'price_desc'

export function filterAndSortProducts(rows: MasterDataProduct[], derived: MasterDataDerived, filters: { search: string; state: ProductStateFilter; mode: ProductModeFilter; categoryId: string; sort: ProductSort }) {
  const term = filters.search.trim().toLocaleLowerCase('es-PE')
  return rows.filter((product) => {
    const category = derived.categoryById.get(product.categoria_id)?.nombre ?? ''
    const group = product.grupo_id ? derived.groupById.get(product.grupo_id)?.nombre ?? '' : ''
    const searchable = [product.producto, product.c_interno, product.c_barras, product.marca, category, group].filter((value): value is string | number => value !== null).join(' ').toLocaleLowerCase('es-PE')
    const state = product.estado === 'Excluido' ? 'excluido' : 'incluido'
    return (!term || searchable.includes(term)) && (filters.state === 'all' || state === filters.state) && (filters.mode === 'all' || product.estado === filters.mode) && (filters.categoryId === 'all' || product.categoria_id === filters.categoryId)
  }).sort((left, right) => filters.sort === 'code' ? left.c_interno - right.c_interno : filters.sort === 'price_asc' ? left.precio - right.precio || left.producto.localeCompare(right.producto, 'es-PE') : filters.sort === 'price_desc' ? right.precio - left.precio || left.producto.localeCompare(right.producto, 'es-PE') : left.producto.localeCompare(right.producto, 'es-PE'))
}

export function paginateProducts<T>(rows: T[], page: number, pageSize = 50) {
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
  const currentPage = Math.min(Math.max(0, page), lastPage)
  const offset = currentPage * pageSize
  return { rows: rows.slice(offset, offset + pageSize), currentPage, pageCount: lastPage + 1, offset }
}
