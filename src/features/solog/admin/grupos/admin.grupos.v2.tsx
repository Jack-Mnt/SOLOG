import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Tags, Users } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { ValuationDialog, type ValuationDecision } from '../admin.valuation-dialog'
import { useMasterData } from '../masterdata/admin.masterdata.context'
import type { MasterDataGroup, MasterDataProduct } from '../masterdata/admin.masterdata.v1'
import { QueryState, Value } from '../admin.v2.presentation'
import { AdminCategoriesDialog } from './admin.categories.dialog'
import { useGroupsStore } from './admin.grupos.context'
import { GroupCandidatePicker, GroupMembersDialog } from './admin.grupos.members-dialog'
import { deriveGroupRows, filterAndSortGroups, type DerivedGroupRow, type GroupDerivedType, type GroupSort, type GroupValuationFilter } from './admin.grupos.model'
import { groupsErrorMessage } from './admin.grupos.messages'

function Valuation({ group }: { group: Pick<MasterDataGroup, 'unidades_por_paquete' | 'precio_paquete'> }) {
  return group.unidades_por_paquete !== null && group.precio_paquete !== null ? <>x{group.unidades_por_paquete} · <Value value={group.precio_paquete} money /></> : <>Sin paquete</>
}

function MutationError({ error, retry }: { error: string; retry: () => void }) {
  const intent = useGroupsStore().intent()
  return <div className="notice notice--error" role="alert"><p>{error}</p>{intent && !intent.pending && <button type="button" className="button button--secondary" onClick={retry}>Reintentar misma operación</button>}</div>
}

function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const masterData = useMasterData()
  const store = useGroupsStore()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [members, setMembers] = useState<MasterDataProduct[]>([])
  const [error, setError] = useState('')
  const selectedPrice = members[0]?.precio
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (members.length < 2) { setError('Selecciona al menos dos SKU para crear el grupo.'); return }
    try {
      setError('')
      await store.mutation('group_create', { nombre: name.trim(), categoria_id: categoryId, member_codes: members.map(member => member.c_interno) })
      onClose()
    } catch (reason) { setError(groupsErrorMessage(reason)) }
  }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch(reason => setError(groupsErrorMessage(reason))) }
  return <AdminDialog title="Crear grupo" description="Crea una estructura de conteo con dos o más SKU incluidos y compatibles." onClose={onClose} closeDisabled={!!store.intent()?.pending} wide>
    {!masterData.snapshot || !masterData.derived ? <QueryState error={masterData.error} retry={masterData.retry} /> : <form className="admin-v2-form" onSubmit={event => void save(event)}>
      <label>Nombre o máscara<input required value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Categoría<select required value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Seleccionar</option>{masterData.snapshot.categories.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
      <GroupCandidatePicker snapshot={masterData.snapshot} derived={masterData.derived} selected={members} onChange={setMembers} price={selectedPrice} />
      <p>El precio unitario se toma del Catálogo y el backend confirma la compatibilidad.</p>
      <button className="button" disabled={!!store.intent() || !name.trim() || !categoryId || members.length < 2}>Crear grupo</button>
    </form>}
    {error && <MutationError error={error} retry={retry} />}
  </AdminDialog>
}

function EditGroupDialog({ group, onClose }: { group: DerivedGroupRow; onClose: () => void }) {
  const masterData = useMasterData()
  const store = useGroupsStore()
  const [name, setName] = useState(group.nombre)
  const [categoryId, setCategoryId] = useState(group.categoria_id)
  const [error, setError] = useState('')
  const categoryChanged = categoryId !== group.categoria_id
  const save = async (event: FormEvent) => {
    event.preventDefault()
    try { setError(''); await store.mutation('group_update', { grupo_id: group.id, nombre: name.trim(), categoria_id: categoryId }); onClose() } catch (reason) { setError(groupsErrorMessage(reason)) }
  }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch(reason => setError(groupsErrorMessage(reason))) }
  return <AdminDialog title="Editar máscara y categoría" description="La máscara operativa no modifica el nombre comercial de los SKU." onClose={onClose} closeDisabled={!!store.intent()?.pending}>
    {!masterData.snapshot ? <QueryState error={masterData.error} retry={masterData.retry} /> : <form className="admin-v2-form" onSubmit={event => void save(event)}>
      <label>Nombre o máscara<input required value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Categoría<select required value={categoryId} onChange={event => setCategoryId(event.target.value)}>{masterData.snapshot.categories.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
      <p>Precio unitario: <Value value={group.precio} money /> · solo lectura.</p>
      {categoryChanged && <p className="notice">La categoría se aplicará a todos los integrantes del grupo.</p>}
      <button className="button" disabled={!!store.intent() || !name.trim() || !categoryId}>Guardar cambios</button>
    </form>}
    {error && <MutationError error={error} retry={retry} />}
  </AdminDialog>
}

function GroupValuationDialog({ group, onClose }: { group: DerivedGroupRow; onClose: () => void }) {
  const store = useGroupsStore()
  const [error, setError] = useState('')
  const save = async (decision: ValuationDecision) => {
    try {
      setError('')
      await store.mutation('valuation_save', decision.enabled ? { grupo_id: group.id, enabled: true, unidades_por_paquete: decision.unitsPerPackage!, precio_paquete: decision.packagePrice! } : { grupo_id: group.id, enabled: false })
      onClose()
    } catch (reason) { setError(groupsErrorMessage(reason)) }
  }
  const retry = () => { setError(''); void store.retryMutation().then(onClose).catch(reason => setError(groupsErrorMessage(reason))) }
  return <ValuationDialog unitPrice={group.precio} initial={{ unitsPerPackage: group.unidades_por_paquete, packagePrice: group.precio_paquete }} description="Este cambio se aplica inmediatamente en Grupos y se confirma con la fuente autoritativa." pending={!!store.intent()?.pending} error={error} onRetry={store.intent() ? retry : undefined} onClose={onClose} onConfirm={decision => void save(decision)} />
}

export function AdminGroupsV2() {
  const masterData = useMasterData()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [type, setType] = useState<'all' | GroupDerivedType>('all')
  const [valuation, setValuation] = useState<GroupValuationFilter>('all')
  const [sort, setSort] = useState<GroupSort>('name')
  const [create, setCreate] = useState(false)
  const [members, setMembers] = useState<string | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const [valuationGroup, setValuationGroup] = useState<string | null>(null)
  const [categories, setCategories] = useState(false)
  const rows = useMemo(() => masterData.snapshot && masterData.derived ? deriveGroupRows(masterData.snapshot, masterData.derived) : [], [masterData.derived, masterData.snapshot])
  const visible = useMemo(() => filterAndSortGroups(rows, { search, categoryId, type, valuation, sort }), [categoryId, rows, search, sort, type, valuation])
  if (!masterData.snapshot || !masterData.derived) return <section className="admin-groups"><QueryState error={masterData.error} retry={masterData.retry} /></section>
  const byId = new Map(rows.map(group => [group.id, group]))
  const selectedMembers = members ? byId.get(members) : undefined
  const selectedEdit = edit ? byId.get(edit) : undefined
  const selectedValuation = valuationGroup ? byId.get(valuationGroup) : undefined
  return <section className="admin-groups">
    <header className="admin-groups__heading"><div><h2>Grupos de conteo</h2><p>Máscara y composición derivadas del Master Data compartido. El precio unitario es informativo.</p></div><div className="admin-groups__heading-actions"><button type="button" className="button button--secondary" onClick={() => setCategories(true)}><Tags size={17} aria-hidden="true" />Administrar categorías</button><button type="button" className="button" onClick={() => setCreate(true)}>Crear grupo</button></div></header>
    <form className="admin-v2-filters admin-groups__filters" onSubmit={event => event.preventDefault()}>
      <label>Buscar<input placeholder="Máscara, integrante, SKU o marca" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Categoría<select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="all">Todas</option>{masterData.snapshot.categories.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
      <label>Integrantes<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="all">Todos</option><option value="Único">Único</option><option value="Agrupado">2+ SKU</option></select></label>
      <label>Valorizado<select value={valuation} onChange={event => setValuation(event.target.value as GroupValuationFilter)}><option value="all">Todos</option><option value="configured">Configurado</option><option value="none">Sin valorizado</option></select></label>
      <label>Orden<select value={sort} onChange={event => setSort(event.target.value as GroupSort)}><option value="name">Grupo</option><option value="category">Categoría</option><option value="type">Tipo derivado</option><option value="unit_price">Precio unitario</option><option value="valuation">Valorizado primero</option><option value="members_desc">Más integrantes</option><option value="members_asc">Menos integrantes</option></select></label>
    </form>
    <p>{visible.length} de {rows.length} grupos.</p>
    <div className="admin-v2-table admin-groups__table" role="region" aria-label="Lista de grupos" tabIndex={0}><table><thead><tr><th scope="col">Grupo</th><th scope="col">Categoría</th><th scope="col">Integrantes</th><th scope="col">Valorizado</th></tr></thead><tbody>{visible.map(group => <tr key={group.id}><th scope="row"><span>{group.nombre}</span><button type="button" className="icon-button" aria-label={`Editar máscara y categoría de ${group.nombre}`} onClick={() => setEdit(group.id)}><Pencil size={16} /></button></th><td>{group.categoryName}</td><td><button type="button" className="button button--secondary" onClick={() => setMembers(group.id)}><Users size={16} aria-hidden="true" />{group.derivedType === 'Único' ? 'Único' : `${group.memberCount} SKU`}</button></td><td className="admin-groups__valuation"><span><Value value={group.precio} money /> / unidad</span><small><Valuation group={group} /></small><button type="button" className="icon-button" aria-label={`Editar valorizado de ${group.nombre}`} onClick={() => setValuationGroup(group.id)}><Pencil size={16} /></button></td></tr>)}{!visible.length && <tr><td colSpan={4}>No hay grupos para los filtros seleccionados.</td></tr>}</tbody></table></div>
    {create && <CreateGroupDialog onClose={() => setCreate(false)} />}
    {selectedMembers && <GroupMembersDialog group={selectedMembers} snapshot={masterData.snapshot} derived={masterData.derived} onClose={() => setMembers(null)} />}
    {selectedEdit && <EditGroupDialog group={selectedEdit} onClose={() => setEdit(null)} />}
    {selectedValuation && <GroupValuationDialog group={selectedValuation} onClose={() => setValuationGroup(null)} />}
    {categories && <AdminCategoriesDialog onClose={() => setCategories(false)} />}
  </section>
}
