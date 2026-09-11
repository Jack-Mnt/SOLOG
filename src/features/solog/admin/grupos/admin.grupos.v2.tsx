import { useMemo, useState, type FormEvent } from 'react'
import { AdminDialog } from '../admin.dialog'
import { QueryState, Value } from '../admin.v2.presentation'
import { useGroupsQuery, useGroupsStore } from './admin.grupos.context'
import type { GroupsGroup, GroupsProduct } from './admin.grupos.v1'

function message(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') return 'La estructura cambió. Se recargaron los datos; revisa y vuelve a confirmar.'
  if (code === 'SOLOG_LOCK_CONFLICT_RETRYABLE') return 'Otro cambio está en curso. Puedes reintentar la misma operación.'
  if (code === 'SOLOG_CATALOG_STAGING_CONFLICT') return 'Existe una preparación activa de Catálogo sobre esta estructura. Resuélvela o retírala antes de continuar.'
  if (code === 'SOLOG_GROUP_PRICE_MISMATCH' || code === 'SOLOG_GROUP_NOT_COMPATIBLE') return 'Los SKU seleccionados no son compatibles con el precio del grupo destino.'
  if (code === 'SOLOG_GROUP_NAME_CONFLICT') return 'Ya existe una estructura activa con ese nombre. Ajusta la máscara y vuelve a intentar.'
  if (code.includes('NOOP')) return 'La operación no produjo cambios porque la estructura ya está en ese estado.'
  return error instanceof Error ? error.message : 'No se pudo guardar el cambio de Grupos.'
}
function Valuation({ group }: { group: Pick<GroupsGroup, 'unidades_por_paquete' | 'precio_paquete'> }) {
  return group.unidades_por_paquete && group.precio_paquete ? <>x{group.unidades_por_paquete} · <Value value={group.precio_paquete} money /></> : <>Sin valorizado</>
}
function MutationError({ error, retry }: { error: string; retry: () => void }) {
  const store = useGroupsStore(), intent = store.intent()
  return <div className="notice notice--error" role="alert"><p>{error}</p>{intent && <button type="button" className="button button--secondary" onClick={() => void retry()}>Reintentar misma operación</button>}</div>
}
function CandidatePicker({ selected, onChange, price }: { selected: GroupsProduct[]; onChange: (rows: GroupsProduct[]) => void; price?: number }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState(''), [offset, setOffset] = useState(0)
  const query = useGroupsQuery('products', { buscar: filter || undefined, precio: price, limit: 50, offset })
  const candidates = query.data
  const selectedCodes = new Set(selected.map(row => row.c_interno))
  const toggle = (candidate: GroupsProduct) => onChange(selectedCodes.has(candidate.c_interno) ? selected.filter(row => row.c_interno !== candidate.c_interno) : [...selected, candidate])
  return <section className="admin-groups__candidates" aria-label="Seleccionar SKU incluidos"><h3>SKU incluidos compatibles</h3><label>Buscar SKU<input value={search} onChange={event => setSearch(event.target.value)} /></label><button type="button" className="button button--secondary" onClick={() => { setFilter(search); setOffset(0) }}>Buscar SKU</button><p>{selected.length ? `${selected.length} SKU seleccionados` : 'Selecciona SKU incluidos.'}{price !== undefined && <> · precio requerido: <Value value={price} money /></>}</p>{candidates ? <><div className="admin-v2-picker">{candidates.rows.map(candidate => <label key={candidate.c_interno}><input type="checkbox" checked={selectedCodes.has(candidate.c_interno)} onChange={() => toggle(candidate)} />{candidate.c_interno} · {candidate.producto} · <Value value={candidate.precio} money /> · {candidate.grupo}</label>)}</div>{!candidates.rows.length && <p>No hay SKU compatibles para esta búsqueda.</p>}<div className="admin-groups__pager"><button type="button" className="button button--secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Anterior</button><button type="button" className="button button--secondary" disabled={candidates.rows.length < candidates.limit} onClick={() => setOffset(offset + candidates.limit)}>Siguiente</button></div></> : <QueryState {...query} />}</section>
}
function CreateGroup({ onClose }: { onClose: () => void }) {
  const store = useGroupsStore(), reference = useGroupsQuery('reference', {})
  const [name, setName] = useState(''), [category, setCategory] = useState(''), [members, setMembers] = useState<GroupsProduct[]>([]), [error, setError] = useState('')
  const selectedPrice = members[0]?.precio
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (members.length < 2) { setError('Selecciona al menos dos SKU para crear el grupo.'); return }
    try { setError(''); await store.mutation('group_create', { nombre: name.trim(), categoria_id: category, member_codes: members.map(member => member.c_interno) }); onClose() } catch (reason) { setError(message(reason)) }
  }
  return <AdminDialog title="Crear grupo" description="Crea una estructura de conteo con dos o más SKU compatibles." onClose={onClose} closeDisabled={!!store.intent()?.pending} wide>{!reference.data ? <QueryState {...reference} /> : <form className="admin-v2-form" onSubmit={event => void save(event)}><label>Nombre o máscara<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Categoría<select required value={category} onChange={event => setCategory(event.target.value)}><option value="">Seleccionar</option>{reference.data.categories.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><CandidatePicker selected={members} onChange={setMembers} price={selectedPrice} /><p>El precio unitario se toma del Catálogo y el backend confirma la compatibilidad.</p><button className="button" disabled={!!store.intent() || members.length < 2}>Crear grupo</button></form>}{error && <MutationError error={error} retry={() => store.retryMutation().then(onClose).catch(reason => setError(message(reason)))} />}</AdminDialog>
}
function EditGroup({ group, onClose }: { group: GroupsGroup; onClose: () => void }) {
  const store = useGroupsStore(), reference = useGroupsQuery('reference', {})
  const [name, setName] = useState(group.nombre), [category, setCategory] = useState(group.categoria_id), [error, setError] = useState('')
  const categoryChanged = category !== group.categoria_id
  const save = async (event: FormEvent) => {
    event.preventDefault()
    try { setError(''); await store.mutation('group_update', { grupo_id: group.id, nombre: name.trim(), categoria_id: category }); onClose() } catch (reason) { setError(message(reason)) }
  }
  return <AdminDialog title="Editar grupo" description="La máscara operativa no modifica el nombre comercial de los SKU." onClose={onClose} closeDisabled={!!store.intent()?.pending}>{!reference.data ? <QueryState {...reference} /> : <form className="admin-v2-form" onSubmit={event => void save(event)}><label>Nombre o máscara<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Categoría<select required value={category} onChange={event => setCategory(event.target.value)}>{reference.data.categories.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><p>Precio unitario: <Value value={group.precio} money /></p>{categoryChanged && <p className="notice">La categoría se aplicará a todos los integrantes del grupo.</p>}<button className="button" disabled={!!store.intent()}>Guardar cambios</button></form>}{error && <MutationError error={error} retry={() => store.retryMutation().then(onClose).catch(reason => setError(message(reason)))} />}</AdminDialog>
}
function MoveMembers({ groups, initial = [], onClose }: { groups: GroupsGroup[]; initial?: GroupsProduct[]; onClose: () => void }) {
  const store = useGroupsStore(), [members, setMembers] = useState(initial), [destination, setDestination] = useState(''), [error, setError] = useState('')
  const target = groups.find(group => group.id === destination)
  const selectedPrice = target?.precio ?? members[0]?.precio
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!target || !members.length) { setError('Selecciona uno o más SKU y el grupo destino.'); return }
    try { setError(''); await store.mutation('membership_move', { grupo_destino_id: target.id, member_codes: members.map(member => member.c_interno) }); onClose() } catch (reason) { setError(message(reason)) }
  }
  return <AdminDialog title="Mover SKU" description="El movimiento es atómico: todos los SKU se mueven o no se aplica ninguno." onClose={onClose} closeDisabled={!!store.intent()?.pending} wide><form className="admin-v2-form" onSubmit={event => void save(event)}><label>Grupo destino<select required value={destination} onChange={event => setDestination(event.target.value)}><option value="">Seleccionar</option>{groups.map(group => <option key={group.id} value={group.id}>{group.nombre} · <Value value={group.precio} money /></option>)}</select></label>{target && members.some(member => member.categoria_id !== target.categoria_id) && <p className="notice">La categoría operativa de los SKU seleccionados cambiará a {target.categoria}.</p>}<CandidatePicker selected={members} onChange={setMembers} price={selectedPrice} /><button className="button" disabled={!!store.intent() || !target || !members.length}>Mover SKU seleccionados</button></form>{error && <MutationError error={error} retry={() => store.retryMutation().then(onClose).catch(reason => setError(message(reason)))} />}</AdminDialog>
}
function GroupDetail({ groupId, onClose, onEdit, onMove }: { groupId: string; onClose: () => void; onEdit: (group: GroupsGroup) => void; onMove: () => void }) {
  const store = useGroupsStore(), query = useGroupsQuery('group_detail', { grupo_id: groupId })
  const [error, setError] = useState('')
  if (!query.data) return <AdminDialog title="Detalle de grupo" onClose={onClose} wide><QueryState {...query} /></AdminDialog>
  const group = query.data.group
  const separate = async (cInterno: number) => { try { setError(''); await store.mutation('make_unique', { c_interno: cInterno }); onClose() } catch (reason) { setError(message(reason)) } }
  return <AdminDialog title={group.nombre} description="Estructura de conteo vigente" onClose={onClose} closeDisabled={!!store.intent()?.pending} wide><dl className="admin-groups__detail"><div><dt>Máscara</dt><dd>{group.nombre}</dd></div><div><dt>Categoría</dt><dd>{group.categoria}</dd></div><div><dt>Tipo derivado</dt><dd>{group.tipo}</dd></div><div><dt>Precio unitario</dt><dd><Value value={group.precio} money /></dd></div><div><dt>Valorizado</dt><dd><Valuation group={group} /></dd></div></dl><div className="admin-groups__actions"><button type="button" className="button button--secondary" onClick={() => onEdit(group)}>Editar máscara/categoría</button><button type="button" className="button button--secondary" onClick={onMove}>Agregar o mover SKU</button></div><h3>Integrantes</h3><div className="admin-v2-table"><table><thead><tr><th>SKU</th><th>Producto</th><th>Precio</th><th>Acción</th></tr></thead><tbody>{query.data.members.map(member => <tr key={member.c_interno}><td>{member.c_interno}</td><th scope="row">{member.producto}</th><td><Value value={member.precio} money /></td><td>{group.tipo === 'Agrupado' && <button type="button" className="button button--secondary" disabled={!!store.intent()} onClick={() => void separate(member.c_interno)}>Separar / dejar como Único</button>}</td></tr>)}</tbody></table></div>{error && <MutationError error={error} retry={() => store.retryMutation().then(onClose).catch(reason => setError(message(reason)))} />}</AdminDialog>
}
function GroupsSurface() {
  const [search, setSearch] = useState(''), [filters, setFilters] = useState({ limit: 50, offset: 0 } as { buscar?: string; categoria_id?: string; tipo?: 'Único' | 'Agrupado'; limit: number; offset: number })
  const [create, setCreate] = useState(false), [detail, setDetail] = useState<string | null>(null), [edit, setEdit] = useState<GroupsGroup | null>(null), [move, setMove] = useState(false)
  const groups = useGroupsQuery('groups', filters), reference = useGroupsQuery('reference', {})
  const availableGroups = useMemo(() => groups.data?.rows ?? [], [groups.data])
  return <section><form className="admin-v2-filters admin-groups__filters" onSubmit={event => { event.preventDefault(); setFilters(current => ({ ...current, buscar: search || undefined, offset: 0 })) }}><label>Buscar grupo<input placeholder="Buscar por nombre o máscara" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Categoría<select value={filters.categoria_id ?? ''} onChange={event => setFilters(current => ({ ...current, categoria_id: event.target.value || undefined, offset: 0 }))}><option value="">Todas</option>{reference.data?.categories.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label><label>Tipo derivado<select value={filters.tipo ?? ''} onChange={event => setFilters(current => ({ ...current, tipo: event.target.value as 'Único' | 'Agrupado' || undefined, offset: 0 }))}><option value="">Todos</option><option value="Único">Único</option><option value="Agrupado">Agrupado</option></select></label><button className="button button--secondary">Buscar</button><button type="button" className="button admin-groups__create" onClick={() => setCreate(true)}>Crear grupo</button></form>{groups.data ? <><div className="admin-v2-table admin-groups__table" role="region" aria-label="Lista de grupos" tabIndex={0}><table><thead><tr><th>Máscara</th><th>Categoría</th><th>Tipo derivado</th><th>Integrantes</th><th>Precio unitario</th><th>Valorizado</th><th>Acciones</th></tr></thead><tbody>{groups.data.rows.map(group => <tr key={group.id}><th scope="row">{group.nombre}</th><td>{group.categoria}</td><td>{group.tipo}</td><td>{group.member_count}</td><td className="admin-groups__money"><Value value={group.precio} money /></td><td><Valuation group={group} /></td><td><div className="admin-groups__actions"><button type="button" className="button button--secondary" onClick={() => setDetail(group.id)}>Ver detalle</button><button type="button" className="button button--secondary" onClick={() => setEdit(group)}>Editar</button></div></td></tr>)}{!groups.data.rows.length && <tr><td colSpan={7}>No hay grupos para los filtros seleccionados.</td></tr>}</tbody></table></div><div className="admin-groups__pager"><button type="button" className="button button--secondary" disabled={!filters.offset} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}>Anterior</button><button type="button" className="button button--secondary" disabled={groups.data.rows.length < groups.data.limit} onClick={() => setFilters(current => ({ ...current, offset: current.offset + current.limit }))}>Siguiente</button></div></> : <QueryState {...groups} />}{create && <CreateGroup onClose={() => setCreate(false)} />}{detail && <GroupDetail groupId={detail} onClose={() => setDetail(null)} onEdit={group => { setDetail(null); setEdit(group) }} onMove={() => { setDetail(null); setMove(true) }} />}{edit && <EditGroup group={edit} onClose={() => setEdit(null)} />}{move && <MoveMembers groups={availableGroups} onClose={() => setMove(false)} />}</section>
}
export function AdminGroupsV2() {
  return <section className="admin-groups"><header className="admin-groups__heading"><h2>Grupos de conteo</h2><p>Organiza SKU incluidos para el conteo. Único y Agrupado se derivan de la composición.</p></header><GroupsSurface /></section>
}
