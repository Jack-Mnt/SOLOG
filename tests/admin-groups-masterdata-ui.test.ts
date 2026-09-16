import { describe, expect, test } from 'bun:test'
import { deriveMasterData, type MasterDataSnapshot } from '../src/features/solog/admin/masterdata/admin.masterdata.v1'
import { MasterDataStore, type MasterDataMutateTransport, type MasterDataReadTransport } from '../src/features/solog/admin/masterdata/admin.masterdata.store'
import { deriveGroupRows, filterAndSortGroups, groupCandidates } from '../src/features/solog/admin/grupos/admin.grupos.model'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'

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
    expect(filterAndSortGroups(rows, { search: '', categoryId: 'all', type: 'all', valuation: 'all', sort: 'unit_price' }).map(group => group.id)).toEqual(['group-a', 'group-b'])
    const tied = rows.map(group => ({ ...group, precio: 3 })).reverse()
    expect(filterAndSortGroups(tied, { search: '', categoryId: 'all', type: 'all', valuation: 'all', sort: 'unit_price' }).map(group => group.nombre)).toEqual(['Gaseosas', 'Papas únicas'])
  })

  test('los candidatos son incluidos, compatibles y ajenos al grupo destino', () => {
    expect(groupCandidates(snapshot).map(product => product.c_interno)).toEqual([10, 11, 20])
    expect(groupCandidates(snapshot, { price: 3, excludeGroupId: 'group-a' })).toEqual([])
    expect(groupCandidates(snapshot, { price: 4, excludeGroupId: 'group-a' }).map(product => product.c_interno)).toEqual([20])
  })
})

describe('Categorías desde Grupos', () => {
  test('limita la UI a create, rename y reorder completo sin permitir NOOP', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.categories.dialog.tsx')
    expect(ui).toMatch(/store\s*\.\s*mutation\(\s*["']category_create["']/)
    expect(ui).toMatch(/store\s*\.\s*mutation\(\s*["']category_rename["']/)
    expect(ui).toMatch(/store\s*\.\s*mutation\(\s*["']category_reorder["']\s*,\s*\{\s*category_ids:\s*order\s*\}\s*\)/s)
    expect(ui).toContain('categoryCounts')
    expect(ui).toContain('!hasCurrentOrderDraft')
    expect(ui).toContain('setOrderDraft({ revision: categoryRevision, ids: next })')
    expect(ui).toContain('order.length !== masterData.snapshot.categories.length')
    expect(ui).toMatch(/if\s*\(\s*action\s*===\s*["']category_create["']\s*\)[\s\S]*?setCreateName\(\s*["']{2}\s*\)/)
    expect(ui).toMatch(/if\s*\(\s*action\s*===\s*["']category_rename["']\s*\)[\s\S]*?setEditing\(null\)[\s\S]*?setEditName\(\s*["']{2}\s*\)/)
    expect(ui).toMatch(/if\s*\(\s*action\s*===\s*["']category_reorder["']\s*\)[\s\S]*?setOrderDraft\(null\)/)
    for (const forbidden of ['category_delete', 'category_merge', 'category_disable', 'category_enable']) expect(ui).not.toContain(forbidden)
  })

  test('retry de create, rename y reorder conserva exactamente operation_id y payload', async () => {
    const cases = [
      ['category_create', { nombre: 'Nueva' }],
      ['category_rename', { category_id: 'cat-a', nombre: 'Bebidas frías' }],
      ['category_reorder', { category_ids: ['cat-b', 'cat-a'] }],
    ] as const
    for (const [action, input] of cases) {
      let attempts = 0
      let current = snapshot
      const payloads: Record<string, unknown>[] = []
      const read = (async () => current) as MasterDataReadTransport
      const mutate = (async (_action, payload) => {
        payloads.push(structuredClone(payload))
        if (!attempts++) throw Object.assign(new Error('Lock'), { code: 'SOLOG_LOCK_CONFLICT_RETRYABLE' })
        current = { ...snapshot, revisions: { ...snapshot.revisions, categories: 3 } }
        return { contract_version: 1 as const, generated_at: snapshot.generated_at, replay: true, result: {}, revisions: current.revisions }
      }) as MasterDataMutateTransport
      const store = new MasterDataStore('admin-test', () => bootstrapFixture(), () => {}, read, mutate)
      await store.ensureLoaded()
      await expect(store.mutation(action, input)).rejects.toThrow('Lock')
      await store.retryMutation()
      expect(payloads).toHaveLength(2)
      expect(payloads[1]).toEqual(payloads[0])
      expect(payloads[1].operation_id).toBe(payloads[0].operation_id)
      expect(store.intent()).toBeUndefined()
    }
  })

  test('Valorizado contiene precio unitario, paquete y edición independiente', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
    expect(ui).toContain('className="admin-groups__valuation"')
    expect(ui).toContain('<Value value={group.precio} money /> / unidad')
    expect(ui).toMatch(/<small>\s*<Valuation\s+group=\{group\}\s*\/>\s*<\/small>/)
    expect(ui).toContain('Sin paquete')
    expect(ui).not.toContain('<th scope="col">Editar</th>')
    expect(ui).toContain('Editar valorizado de')
    expect(ui).not.toContain('value={group.precio} onChange')
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
    expect(active).toMatch(/store\.mutation\(\s*["']group_create["']/)
    expect(active).toMatch(/store\.mutation\(\s*["']membership_move["']/)
  })
})
describe('Composición F3 de Grupos e Incidencias', () => {
  test('Grupos conserva los filtros locales con QuickFilterChip y acciones separadas', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
    expect(ui).toContain('admin-groups__quick-filter-sets')
    expect(ui).toContain('aria-label="Integrantes"')
    expect(ui).toContain('aria-label="Valorizado"')
    expect(ui).toContain('aria-pressed={type === value}')
    expect(ui).toContain('aria-pressed={valuation === value}')
    expect(ui).toContain('<th scope="col">Acciones</th>')
    expect(ui).toContain('<Package')
    expect(ui).toContain('<PackageOpen')
    expect(ui).toContain('aria-label={`Ver integrantes de ${group.nombre}`}')
    expect(ui).toContain('<CircleDollarSign')
    expect(ui).toContain('setEdit(group.id)')
    expect(ui).toContain('setValuationGroup(group.id)')
  })

  test('Incidencias parte de Pendientes y deriva las StateView desde summary', async () => {
    const ui = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')
    expect(ui).toMatch(/useState<IncidentState>\(\s*["']pendiente["']\s*\)/)
    expect(ui).toMatch(/\{\s*state:\s*["']pendiente["']\s*,\s*label:\s*["']Pendientes["']\s*\}/)
    expect(ui).toMatch(/\{\s*state:\s*["']suprimida["']\s*,\s*label:\s*["']Suprimidas["']\s*\}/)
    expect(ui).toMatch(/\{\s*state:\s*["']resuelta["']\s*,\s*label:\s*["']Resueltas["']\s*\}/)
    expect(ui).toContain('item.family_state === state')
    expect(ui).toContain('role="tablist"')
    expect(ui).toContain('role="tab"')
    expect(ui).toContain('aria-selected={state === view.state}')
    expect(ui).toContain('tabIndex={state === view.state ? 0 : -1}')
    expect(ui).toContain('"Home"')
    expect(ui).toContain('"End"')
    expect(ui).toContain('const stateCounts = useMemo')
    expect(ui).toContain('(item) => type === "all" || item.tipo === type')
    expect(ui).toContain('<strong>{stateCounts[view.state]}</strong>')
    expect(ui).toMatch(/useManagementQuery\(\s*["']summary["']\s*,\s*site\s*\?\s*\{\s*site_id:\s*site\s*\}\s*:\s*\{\s*\}\s*\)/s)
    expect(ui.match(/useManagementQuery\(\s*["']summary["']/g) ?? []).toHaveLength(1)
  })

  test('Grupos calcula contadores por eje ignorando solo el QuickFilterChip propio', async () => {
    const ui = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
    expect(ui).toContain('const typeCounts = useMemo')
    expect(ui).toMatch(/type:\s*["']all["']/)
    expect(ui).toContain('valuation,')
    expect(ui).toContain('<strong>{typeCounts[value]}</strong>')
    expect(ui).toContain('const valuationCounts = useMemo')
    expect(ui).toMatch(/valuation:\s*["']all["']/)
    expect(ui).toContain('<strong>{valuationCounts[value]}</strong>')

    const derived = deriveMasterData(snapshot)
    const rows = deriveGroupRows(snapshot, derived)

    const typeAvailable = filterAndSortGroups(rows, {
      search: '',
      categoryId: 'all',
      type: 'all',
      valuation: 'configured',
      sort: 'name',
    })
    expect({
      all: typeAvailable.length,
      Único: typeAvailable.filter(group => group.derivedType === 'Único').length,
      Agrupado: typeAvailable.filter(group => group.derivedType === 'Agrupado').length,
    }).toEqual({ all: 1, Único: 0, Agrupado: 1 })

    const valuationAvailable = filterAndSortGroups(rows, {
      search: '',
      categoryId: 'all',
      type: 'Único',
      valuation: 'all',
      sort: 'name',
    })
    expect({
      all: valuationAvailable.length,
      configured: valuationAvailable.filter(group => group.unidades_por_paquete !== null && group.precio_paquete !== null).length,
      none: valuationAvailable.filter(group => group.unidades_por_paquete === null || group.precio_paquete === null).length,
    }).toEqual({ all: 1, configured: 0, none: 1 })
  })
})
