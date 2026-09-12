import { useMemo, useState } from 'react'
import { AdminDialog } from '../admin.dialog'
import type { MasterDataDerived, MasterDataProduct, MasterDataSnapshot } from '../masterdata/admin.masterdata.v1'
import { Value } from '../admin.v2.presentation'
import { useGroupsStore } from './admin.grupos.context'
import { groupCandidates, type DerivedGroupRow } from './admin.grupos.model'
import { groupsErrorMessage } from './admin.grupos.messages'

export function GroupCandidatePicker({ snapshot, derived, selected, onChange, price, excludeGroupId }: { snapshot: MasterDataSnapshot; derived: MasterDataDerived; selected: MasterDataProduct[]; onChange: (rows: MasterDataProduct[]) => void; price?: number; excludeGroupId?: string }) {
  const [search, setSearch] = useState('')
  const selectedCodes = new Set(selected.map(product => product.c_interno))
  const candidates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-PE')
    return groupCandidates(snapshot, { price, excludeGroupId }).filter(product => {
      const group = product.grupo_id ? derived.groupById.get(product.grupo_id)?.nombre ?? '' : ''
      return !term || [product.c_interno, product.producto, product.marca, product.c_barras, group].filter((value): value is string | number => value !== null).join(' ').toLocaleLowerCase('es-PE').includes(term)
    })
  }, [derived, excludeGroupId, price, search, snapshot])
  const toggle = (product: MasterDataProduct) => onChange(selectedCodes.has(product.c_interno) ? selected.filter(item => item.c_interno !== product.c_interno) : [...selected, product])
  return <section className="admin-groups__candidates" aria-label="Seleccionar SKU compatibles">
    <label>Buscar SKU<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Código, producto, marca o grupo" /></label>
    <p>{selected.length ? `${selected.length} SKU seleccionados` : 'Selecciona SKU incluidos.'}{price !== undefined && <> · precio requerido: <Value value={price} money /></>}</p>
    <div className="admin-v2-picker">{candidates.map(product => <label key={product.c_interno}><input type="checkbox" checked={selectedCodes.has(product.c_interno)} onChange={() => toggle(product)} /><span>{product.c_interno} · {product.producto} · <Value value={product.precio} money /> · {product.grupo_id ? derived.groupById.get(product.grupo_id)?.nombre ?? 'Grupo sin nombre' : 'Sin grupo'}</span></label>)}</div>
    {!candidates.length && <p>No hay SKU incluidos compatibles para esta búsqueda.</p>}
  </section>
}

export function GroupMembersDialog({ group, snapshot, derived, onClose }: { group: DerivedGroupRow; snapshot: MasterDataSnapshot; derived: MasterDataDerived; onClose: () => void }) {
  const store = useGroupsStore()
  const [selected, setSelected] = useState<MasterDataProduct[]>([])
  const [error, setError] = useState('')
  const intent = store.intent()
  const move = async () => {
    if (!selected.length) { setError('Selecciona uno o más SKU para agregar o mover.'); return }
    try {
      setError('')
      await store.mutation('membership_move', { grupo_destino_id: group.id, member_codes: selected.map(product => product.c_interno) })
      onClose()
    } catch (reason) { setError(groupsErrorMessage(reason)) }
  }
  const separate = async (cInterno: number) => {
    try { setError(''); await store.mutation('make_unique', { c_interno: cInterno }); onClose() } catch (reason) { setError(groupsErrorMessage(reason)) }
  }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch(reason => setError(groupsErrorMessage(reason))) }
  const categoryChanges = selected.some(product => product.categoria_id !== group.categoria_id)
  return <AdminDialog title={`Integrantes · ${group.nombre}`} description={`${group.derivedType} · ${group.memberCount} SKU · precio unitario de referencia S/ ${group.precio.toFixed(2)}`} onClose={onClose} closeDisabled={!!intent?.pending} wide>
    <div className="admin-v2-table"><table><thead><tr><th scope="col">SKU</th><th scope="col">Producto</th><th scope="col">Precio</th><th scope="col">Acción</th></tr></thead><tbody>{group.members.map(member => <tr key={member.c_interno}><td>{member.c_interno}</td><th scope="row">{member.producto}</th><td><Value value={member.precio} money /></td><td>{group.derivedType === 'Agrupado' && <button type="button" className="button button--secondary" disabled={!!intent} onClick={() => void separate(member.c_interno)}>Separar / dejar como Único</button>}</td></tr>)}</tbody></table></div>
    <h3>Agregar o mover productos</h3>
    <p>El grupo destino es <strong>{group.nombre}</strong>. El movimiento es atómico: todos los SKU se mueven o no se aplica ninguno.</p>
    <GroupCandidatePicker snapshot={snapshot} derived={derived} selected={selected} onChange={setSelected} price={group.precio} excludeGroupId={group.id} />
    {categoryChanges && <p className="notice">La categoría operativa de los SKU seleccionados cambiará a {group.categoryName}.</p>}
    <button type="button" className="button" disabled={!!intent || !selected.length} onClick={() => void move()}>Agregar o mover SKU seleccionados</button>
    {error && <div className="notice notice--error" role="alert"><p>{error}</p>{intent && !intent.pending && <button type="button" className="button button--secondary" onClick={retry}>Reintentar misma operación</button>}</div>}
  </AdminDialog>
}
