import { describe, expect, test } from 'bun:test'
import { deriveMasterData, type MasterDataSnapshot } from '../src/features/solog/admin/masterdata/admin.masterdata.v1'
import { filterAndSortProducts, paginateProducts } from '../src/features/solog/admin/productos/admin.productos.model'
import { ADMIN_ROUTES, isAdminRoute } from '../src/lib/router'

const source = (path: string) => Bun.file(path).text()
const snapshot: MasterDataSnapshot = {
  contract_version: 1,
  generated_at: '2026-09-11T12:00:00Z',
  complete: true,
  categories: [{ id: 'cat-a', nombre: 'Bebidas', orden: 1 }, { id: 'cat-b', nombre: 'Snacks', orden: 2 }],
  groups: [{ id: 'group-a', nombre: 'Gaseosas', categoria_id: 'cat-a', precio: 3, unidades_por_paquete: null, precio_paquete: null }],
  products: [
    { c_interno: 30, producto: 'Cola grande', c_barras: '333', marca: 'Marca C', precio: 5, estado: 'Excluido', categoria_id: 'cat-a', grupo_id: null },
    { c_interno: 20, producto: 'Papas', c_barras: '222', marca: null, precio: 4, estado: 'Único', categoria_id: 'cat-b', grupo_id: 'group-a' },
    { c_interno: 10, producto: 'Cola chica', c_barras: '111', marca: 'Marca C', precio: 3, estado: 'Agrupado', categoria_id: 'cat-a', grupo_id: 'group-a' },
  ],
  setup_required: [],
  totals: { categories: 2, groups: 1, products: 3, included: 2, excluded: 1 },
  revisions: { groups: 2, catalog: 3, categories: 1 },
}

describe('Admin Productos con Master Data', () => {
  test('registra la ruta Productos y la ubica en Inventario entre Catálogo y Grupos', async () => {
    expect(ADMIN_ROUTES).toContain('/admin/productos')
    expect(isAdminRoute('/admin/productos')).toBe(true)
    const app = await source('src/features/solog/admin/admin.v2.app.tsx')
    expect(app).toContain('{ label: "OPERACIÓN"')
    expect(app).toContain('{ label: "INVENTARIO"')
    expect(app).toContain('{ label: "SISTEMA"')
    expect(app.indexOf('["/admin/catalogo", "Catálogo"')).toBeLessThan(app.indexOf('["/admin/productos", "Productos"'))
    expect(app.indexOf('["/admin/productos", "Productos"')).toBeLessThan(app.indexOf('["/admin/grupos", "Grupos"'))
  })

  test('filtra y ordena el conjunto completo local usando relaciones derivadas', () => {
    const derived = deriveMasterData(snapshot)
    expect(filterAndSortProducts(snapshot.products, derived, { search: 'gaseosas', state: 'all', mode: 'all', categoryId: 'all', sort: 'code' }).map(item => item.c_interno)).toEqual([10, 20])
    expect(filterAndSortProducts(snapshot.products, derived, { search: '', state: 'excluido', mode: 'all', categoryId: 'all', sort: 'name' }).map(item => item.c_interno)).toEqual([30])
    expect(filterAndSortProducts(snapshot.products, derived, { search: '', state: 'all', mode: 'all', categoryId: 'cat-a', sort: 'price_desc' }).map(item => item.c_interno)).toEqual([30, 10])
  })

  test('pagina localmente sin alterar ni truncar el dataset compartido', () => {
    const rows = Array.from({ length: 121 }, (_, index) => index + 1)
    expect(paginateProducts(rows, 0)).toEqual({ rows: rows.slice(0, 50), currentPage: 0, pageCount: 3, offset: 0 })
    expect(paginateProducts(rows, 2)).toEqual({ rows: rows.slice(100), currentPage: 2, pageCount: 3, offset: 100 })
    expect(paginateProducts(rows, 99).currentPage).toBe(2)
    expect(rows).toHaveLength(121)
  })

  test('carga Master Data solo desde Productos o el diálogo de configuración', async () => {
    const catalog = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    const products = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
    const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')
    expect(products).toContain('const masterData = useMasterData()')
    expect(setup).toContain('const masterData = useMasterData()')
    expect(catalog).not.toContain('useMasterData')
    expect(catalog).not.toContain("useCatalogQuery('reference'")
    expect(products).not.toContain("useCatalogQuery('products'")
  })

  test('onboarding conserva prepare_product y no vuelve a Catalog reference', async () => {
    const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')
    expect(setup).toContain("store.mutation('prepare_product'")
    expect(setup).toContain('masterData.snapshot.groups.map')
    expect(setup).toContain('masterData.snapshot.categories.map')
    expect(setup).not.toContain("'reference'")
    expect(setup).toContain('La configuración queda en staging')
  })
})
