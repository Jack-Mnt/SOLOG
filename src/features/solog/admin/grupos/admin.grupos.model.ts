import type { MasterDataDerived, MasterDataGroup, MasterDataProduct, MasterDataSnapshot } from '../masterdata/admin.masterdata.v1'

export type GroupDerivedType = 'Único' | 'Agrupado'
export type GroupValuationFilter = 'all' | 'configured' | 'none'
export type GroupSort = 'name' | 'category' | 'type' | 'unit_price' | 'valuation' | 'members_asc' | 'members_desc'

export interface DerivedGroupRow extends MasterDataGroup {
  categoryName: string
  members: MasterDataProduct[]
  memberCount: number
  derivedType: GroupDerivedType
}

export function deriveGroupRows(snapshot: MasterDataSnapshot, derived: MasterDataDerived): DerivedGroupRow[] {
  return snapshot.groups.map(group => {
    const members = derived.productsByGroupId.get(group.id) ?? []
    return {
      ...group,
      categoryName: derived.categoryById.get(group.categoria_id)?.nombre ?? 'Sin categoría',
      members,
      memberCount: members.length,
      derivedType: members.length === 1 ? 'Único' : 'Agrupado',
    }
  })
}

export function filterAndSortGroups(rows: DerivedGroupRow[], filters: { search: string; categoryId: string; type: 'all' | GroupDerivedType; valuation: GroupValuationFilter; sort: GroupSort }) {
  const term = filters.search.trim().toLocaleLowerCase('es-PE')
  return rows.filter(group => {
    const searchable = [group.nombre, group.categoryName, ...group.members.flatMap(member => [member.c_interno, member.producto, member.marca, member.c_barras])].filter((value): value is string | number => value !== null).join(' ').toLocaleLowerCase('es-PE')
    const configured = group.unidades_por_paquete !== null && group.precio_paquete !== null
    return (!term || searchable.includes(term))
      && (filters.categoryId === 'all' || group.categoria_id === filters.categoryId)
      && (filters.type === 'all' || group.derivedType === filters.type)
      && (filters.valuation === 'all' || filters.valuation === 'configured' && configured || filters.valuation === 'none' && !configured)
  }).sort((left, right) => filters.sort === 'category'
    ? left.categoryName.localeCompare(right.categoryName, 'es-PE') || left.nombre.localeCompare(right.nombre, 'es-PE')
    : filters.sort === 'type'
      ? left.derivedType.localeCompare(right.derivedType, 'es-PE') || left.nombre.localeCompare(right.nombre, 'es-PE')
      : filters.sort === 'unit_price'
        ? left.precio - right.precio || left.nombre.localeCompare(right.nombre, 'es-PE')
      : filters.sort === 'valuation'
        ? Number(right.unidades_por_paquete !== null) - Number(left.unidades_por_paquete !== null) || left.nombre.localeCompare(right.nombre, 'es-PE')
    : filters.sort === 'members_asc'
      ? left.memberCount - right.memberCount || left.nombre.localeCompare(right.nombre, 'es-PE')
      : filters.sort === 'members_desc'
        ? right.memberCount - left.memberCount || left.nombre.localeCompare(right.nombre, 'es-PE')
          : left.nombre.localeCompare(right.nombre, 'es-PE'))
}

export function groupCandidates(snapshot: MasterDataSnapshot, options: { price?: number; excludeGroupId?: string } = {}) {
  return snapshot.products.filter(product => product.estado !== 'Excluido'
    && (options.price === undefined || product.precio === options.price)
    && (options.excludeGroupId === undefined || product.grupo_id !== options.excludeGroupId))
}
