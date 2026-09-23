import { describe, expect, test } from 'bun:test'
import { deriveMasterData, type MasterDataSnapshot } from '../src/features/solog/admin/masterdata/admin.masterdata.v1'
import { paginateAdminRows } from '../src/features/solog/admin/admin.pagination'
import { filterAndSortProducts } from '../src/features/solog/admin/productos/admin.productos.model'
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
    expect(filterAndSortProducts(snapshot.products, derived, { search: 'gaseosas', mode: 'all', categoryId: 'all', sort: 'code' }).map(item => item.c_interno)).toEqual([10, 20])
    expect(filterAndSortProducts(snapshot.products, derived, { search: '', mode: 'Excluido', categoryId: 'all', sort: 'name' }).map(item => item.c_interno)).toEqual([30])
    expect(filterAndSortProducts(snapshot.products, derived, { search: '', mode: 'all', categoryId: 'cat-a', sort: 'price_desc' }).map(item => item.c_interno)).toEqual([30, 10])
  })

  test('pagina localmente sin alterar ni truncar el dataset compartido', () => {
    const rows = Array.from({ length: 121 }, (_, index) => index + 1)
    expect(paginateAdminRows(rows, 0)).toEqual({ rows: rows.slice(0, 50), currentPage: 0, pageCount: 3, offset: 0 })
    expect(paginateAdminRows(rows, 2)).toEqual({ rows: rows.slice(100), currentPage: 2, pageCount: 3, offset: 100 })
    expect(paginateAdminRows(rows, 99).currentPage).toBe(2)
    expect(rows).toHaveLength(121)
  })

  test('carga Master Data solo desde Productos o el diálogo de configuración', async () => {
    const catalog = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx')
    const products = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
    const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')
    expect(products).toMatch(/const\s+masterData\s*=\s*useMasterData\(\s*\)/)
    expect(setup).toMatch(/const\s+masterData\s*=\s*useMasterData\(\s*\)/)
    expect(catalog).not.toContain('useMasterData')
    expect(catalog).not.toMatch(/useCatalogQuery\(\s*["']reference["']/)
    expect(products).not.toMatch(/useCatalogQuery\(\s*["']products["']/)
  })

  test('configuración soporta prepare, resolve y reincorporación administrativa sin Catalog reference', async () => {
    const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')
    expect(setup).toContain("flow === 'resolve' ? 'resolve_product' : 'prepare_product'")
    expect(setup).toContain("flow === 'propose_reincorporation'")
    expect(setup).toMatch(/store\.mutation\(\s*['"]propose_product_state['"]/)
    expect(setup).toMatch(/masterData\.snapshot\?\.groups\.filter\(\(group\) => group\.precio === target\.precio\)/)
    expect(setup).toContain('masterData.snapshot.categories.map')
    expect(setup).not.toMatch(/["']reference["']/)
    expect(setup).toContain('La propuesta quedará aprobada solo si esta configuración se guarda correctamente.')
  })

  test('QuickFilterChip muestra contadores derivados sin lectura adicional y conserva filtros restantes', async () => {
    const ui = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
    expect(ui).toMatch(/const\s+modeCounts\s*=\s*useMemo\s*\(/)
    expect(ui).toMatch(/mode:\s*["']all["']/)
    expect(ui).toMatch(/categoryId:\s*categoryFilter/)
    expect(ui).toContain('<strong>{modeCounts[value]}</strong>')
    expect(ui).not.toMatch(/useCatalogQuery\(\s*["']products["']/)

    const derived = deriveMasterData(snapshot)
    const available = filterAndSortProducts(snapshot.products, derived, { search: 'cola', mode: 'all', categoryId: 'cat-a', sort: 'name' })
    const counts = {
      all: available.length,
      Único: available.filter(product => product.estado === 'Único').length,
      Agrupado: available.filter(product => product.estado === 'Agrupado').length,
      Excluido: available.filter(product => product.estado === 'Excluido').length,
    }
    expect(counts).toEqual({ all: 2, Único: 0, Agrupado: 1, Excluido: 1 })
  })

  test('conserva la configuración pendiente como acción persistente del toolbar', async () => {
    const ui = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
    expect(ui).toContain('const [setupListOpen, setSetupListOpen] = useState(false);')
    expect(ui).toContain('className="admin-toolbar__actions"')
    expect(ui).toContain('disabled={setupRequired.length === 0}')
    expect(ui).toContain('ProductSetupPendingDialog')
    expect(ui).toContain('setSetup({ ...item, propuesta_fingerprint: item.propuesta_fingerprint });')
    expect(ui).not.toContain('admin-catalog__section--urgent')
  })
})
