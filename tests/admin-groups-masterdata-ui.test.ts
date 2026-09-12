import { describe, expect, test } from 'bun:test'
import { deriveMasterData, type MasterDataSnapshot } from '../src/features/solog/admin/masterdata/admin.masterdata.v1'
import { deriveGroupRows, filterAndSortGroups, groupCandidates } from '../src/features/solog/admin/grupos/admin.grupos.model'

const source = (path: string) => Bun.file(path).text()
const snapshot: MasterDataSnapshot = {
  contract_version: 1,
  generated_at: '2026-09-12T12:00:00Z',
  complete: true,
  categories: [{ id: 'cat-a', nombre: 'Bebidas', orden: 0 }, { id: 'cat-b', nombre: 'Snacks', orden: 1 }],
  groups: [
    { id: 'group-a', nombre: 'Gaseosas', categoria_id: 'cat-a', precio: 3, unidades_por_paquete: 12, precio_paquete: 30 },
    { id: 'group-b', nombre: 'Papas únicas', categoria_id: 'cat-b', precio: 4, unidades_por_paquete: null, precio_paquete: null },
  ],
  products: [
    { c_interno: 10, producto: 'Cola chica', c_barras: '111', marca: 'Marca C', precio: 3, estado: 'Agrupado', categoria_id: 'cat-a', grupo_id: 'group-a' },
    { c_interno: 11, producto: 'Cola grande', c_barras: '112', marca: 'Marca C', precio: 3, estado: 'Agrupado', categoria_id: 'cat-a', grupo_id: 'group-a' },
    { c_interno: 20, producto: 'Papas', c_barras: null, marca: null, precio: 4, estado: 'Único', categoria_id: 'cat-b', grupo_id: 'group-b' },
    { c_interno: 30, producto: 'Excluido', c_barras: null, marca: null, precio: 3, estado: 'Excluido', categoria_id: 'cat-a', grupo_id: null },
  ],
  setup_required: [],
  totals: { categories: 2, groups: 2, products: 4, included: 3, excluded: 1 },
  revisions: { groups: 4, catalog: 8, categories: 2 },
}

describe('Grupos derivados de Master Data', () => {
  test('deriva integrantes, conteo, tipo y categoría sin lectura remota', () => {
    const derived = deriveMasterData(snapshot)
    const rows = deriveGroupRows(snapshot, derived)
    expect(rows.find(group => group.id === 'group-a')).toMatchObject({ categoryName: 'Bebidas', memberCount: 2, derivedType: 'Agrupado' })
    expect(rows.find(group => group.id === 'group-b')).toMatchObject({ categoryName: 'Snacks', memberCount: 1, derivedType: 'Único' })
  })

  test('busca por máscara, integrante y SKU; filtra y ordena localmente', () => {
    const derived = deriveMasterData(snapshot)
    const rows = deriveGroupRows(snapshot, derived)
    expect(filterAndSortGroups(rows, { search: '11', categoryId: 'all', type: 'all', valuation: 'all', sort: 'name' }).map(group => group.id)).toEqual(['group-a'])
    expect(filterAndSortGroups(rows, { search: 'papas', categoryId: 'cat-b', type: 'Único', valuation: 'none', sort: 'members_desc' }).map(group => group.id)).toEqual(['group-b'])
    expect(filterAndSortGroups(rows, { search: '', categoryId: 'all', type: 'all', valuation: 'configured', sort: 'category' }).map(group => group.id)).toEqual(['group-a'])
    expect(filterAndSortGroups(rows, { search: '', categoryId: 'all', type: 'all', valuation: 'all', sort: 'valuation' }).map(group => group.id)).toEqual(['group-a', 'group-b'])
  })

  test('los candidatos son incluidos, compatibles y ajenos al grupo destino', () => {
    expect(groupCandidates(snapshot).map(product => product.c_interno)).toEqual([10, 11, 20])
    expect(groupCandidates(snapshot, { price: 3, excludeGroupId: 'group-a' })).toEqual([])
    expect(groupCandidates(snapshot, { price: 4, excludeGroupId: 'group-a' }).map(product => product.c_interno)).toEqual([20])
  })
})

describe('Categorías desde Grupos', () => {
  test('limita la UI a create, rename y reorder completo', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.categories.dialog.tsx')
    expect(ui).toContain("store.mutation('category_create'")
    expect(ui).toContain("store.mutation('category_rename'")
    expect(ui).toContain("store.mutation('category_reorder', { category_ids: order })")
    expect(ui).toContain('categoryCounts')
    for (const forbidden of ['category_delete', 'category_merge', 'category_disable', 'category_enable']) expect(ui).not.toContain(forbidden)
  })

  test('la UI activa no importa el hook de lecturas Grupos V1', async () => {
    const files = await Promise.all([
      source('src/features/solog/admin/grupos/admin.grupos.v2.tsx'),
      source('src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx'),
      source('src/features/solog/admin/grupos/admin.categories.dialog.tsx'),
    ])
    const active = files.join('\n')
    expect(active).not.toContain('useGroupsQuery')
    expect(active).not.toContain('groupsRead(')
    expect(active).toContain("store.mutation('group_create'")
    expect(active).toContain("store.mutation('membership_move'")
  })
})
