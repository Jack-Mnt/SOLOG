import { useState, type FormEvent } from 'react'
import { PageControls, ReadNotice, MutationNotice } from '../admin.management.presentation'
import { PackagePrice } from '../admin.package-price.v2'
import { AdminDialog } from '../admin.dialog'
import { useManagement, useManagementQuery } from '../admin.management.context'
import type { MasterGroup, MasterProduct, ReadPayloads, Mutations, GroupProduct } from '../admin.management.v2'

function ProductPicker({ selected, onChange }: { selected: number[]; onChange: (v: number[]) => void }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState(''), [offset, setOffset] = useState(0)
  const query = useManagementQuery('group_products', { buscar: filter, limit: 50, offset })
  return <section><h3>Integrantes iniciales</h3><label>Buscar SKU<input value={search} onChange={e => setSearch(e.target.value)} /></label><button type="button" className="button button--secondary" onClick={() => { setFilter(search); setOffset(0) }}>Buscar integrantes</button><p>Seleccionados: {selected.join(', ') || 'ninguno'}</p>{query.data ? <><div className="admin-v2-picker">{query.data.rows.map(p => <label key={p.c_interno}><input type="checkbox" checked={selected.includes(p.c_interno)} onChange={e => onChange(e.target.checked ? [...selected, p.c_interno] : selected.filter(c => c !== p.c_interno))} />{p.c_interno} · {p.producto} · {p.precio}</label>)}</div><PageControls offset={offset} length={query.data.rows.length} onChange={setOffset} /></> : <ReadNotice {...query} />}</section>
}
function GroupEditor({ group, product, onClose }: { group?: MasterGroup | null; product?: MasterProduct; onClose: () => void }) {
  const store = useManagement(), reference = useManagementQuery('reference', {})
  const [name, setName] = useState(group?.nombre ?? ''), [category, setCategory] = useState(group?.categoria_id ?? ''), [price, setPrice] = useState(String(group?.precio ?? ''))
  const [mode, setMode] = useState<GroupProduct['estado']>(product?.estado ?? 'Único'), [destination, setDestination] = useState(product?.grupo_id ?? ''), [members, setMembers] = useState<number[]>([]), [error, setError] = useState('')
  const busy = !!store.intent('master')
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!reference.data) return
    const payload: Mutations['group_change_save'] = product ? mode === 'Agrupado' ? { kind: 'classification', c_interno: product.c_interno, estado: mode, grupo_conteo_id: destination } : { kind: 'classification', c_interno: product.c_interno, estado: mode, grupo_conteo_id: null } : { kind: 'definition', ...(group ? { grupo_id: group.id } : { member_codes: members }), nombre: name.trim(), categoria_id: category, precio: Number(price) }
    setError('')
    try { await store.mutation('group_change_save', payload, reference.data.revisions.groups); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'No se guardó') }
  }
  return <AdminDialog title={product ? `Clasificar ${product.producto}` : group ? 'Editar grupo' : 'Crear grupo'} onClose={onClose} closeDisabled={!!store.intent('master')?.pending} wide>
    {!reference.data ? <ReadNotice {...reference} /> : <form onSubmit={e => void save(e)} className="admin-v2-form">
      {product ? <><label>Modalidad<select value={mode} onChange={e => setMode(e.target.value as GroupProduct['estado'])}><option>Único</option><option>Agrupado</option><option>Excluido</option></select></label>{mode === 'Agrupado' && <label>Grupo destino<select required value={destination} onChange={e => setDestination(e.target.value)}><option value="">Seleccionar</option>{reference.data.groups.map(g => <option key={g.id} value={g.id}>{g.nombre} · {g.precio}</option>)}</select></label>}<p>El backend valida compatibilidad y normaliza los grupos de origen y destino.</p></> : <><label>Nombre<input required value={name} onChange={e => setName(e.target.value)} /></label><label>Categoría<select required value={category} onChange={e => setCategory(e.target.value)}><option value="">Seleccionar</option>{reference.data.categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Precio unitario<input required disabled={!!group} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>{!group && <ProductPicker selected={members} onChange={setMembers} />}</>}
      <button className="button" disabled={busy || (!product && !group && !members.length)}>Guardar cambio</button>
    </form>}{error && <p role="alert">{error}</p>}<MutationNotice domain="master" onSuccess={onClose} />
  </AdminDialog>
}
function Products() {
  const [search, setSearch] = useState(''), [filters, setFilters] = useState<ReadPayloads['group_products']>({ limit: 50, offset: 0 }), [selected, setSelected] = useState<MasterProduct | null>(null)
  const query = useManagementQuery('group_products', filters)
  return <section><form className="admin-v2-filters" onSubmit={e => { e.preventDefault(); setFilters({ ...filters, buscar: search, offset: 0 }) }}><label>Buscar producto<input value={search} onChange={e => setSearch(e.target.value)} /></label><label>Estado<select value={filters.estado ?? ''} onChange={e => setFilters({ ...filters, estado: e.target.value as GroupProduct['estado'] || undefined, offset: 0 })}><option value="">Todos</option><option>Único</option><option>Agrupado</option><option>Excluido</option></select></label><button className="button">Buscar</button></form>{query.data ? <><div className="admin-v2-table"><table><thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th>Grupo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{query.data.rows.map(p => <tr key={p.c_interno}><td>{p.c_interno}</td><td>{p.producto}</td><td>{p.categoria}</td><td>{p.grupo ?? '—'}</td><td>{p.estado}</td><td><button className="button button--secondary" onClick={() => setSelected(p)}>Clasificar</button></td></tr>)}</tbody></table></div><PageControls offset={filters.offset} length={query.data.rows.length} onChange={offset => setFilters({ ...filters, offset })} /></> : <ReadNotice {...query} />}{selected && <GroupEditor product={selected} onClose={() => setSelected(null)} />}</section>
}
function Groups() {
  const [search, setSearch] = useState(''), [filters, setFilters] = useState<ReadPayloads['groups']>({ limit: 50, offset: 0 }), [editor, setEditor] = useState<MasterGroup | null | undefined>(undefined), [expanded, setExpanded] = useState<string | null>(null), [pack, setPack] = useState<string | null>(null)
  const query = useManagementQuery('groups', filters), reference = useManagementQuery('reference', {})
  return <section><form className="admin-v2-filters" onSubmit={e => { e.preventDefault(); setFilters({ ...filters, buscar: search, offset: 0 }) }}><label>Buscar grupo<input value={search} onChange={e => setSearch(e.target.value)} /></label><label>Categoría<select value={filters.categoria_id ?? ''} onChange={e => setFilters({ ...filters, categoria_id: e.target.value || undefined, offset: 0 })}><option value="">Todas</option>{reference.data?.categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Tipo<select value={filters.tipo ?? ''} onChange={e => setFilters({ ...filters, tipo: e.target.value as 'Único' | 'Agrupado' || undefined, offset: 0 })}><option value="">Todos</option><option>Único</option><option>Agrupado</option></select></label><button className="button">Buscar</button><button type="button" className="button" onClick={() => setEditor(null)}>Crear grupo</button></form>
    {query.data ? <><div className="admin-v2-cards">{query.data.rows.map(g => <article className="admin-v2-card" key={g.id}><h3>{g.nombre}</h3><p>{g.categoria} · {g.tipo} · {g.precio} · {g.sku_count} SKU</p><div className="admin-v2-actions"><button className="button button--secondary" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>Integrantes</button><button className="button button--secondary" onClick={() => setEditor(g)}>Editar</button><button className="button button--secondary" onClick={() => setPack(g.id)}>Precio por paquete</button></div>{expanded === g.id && <ul>{g.integrantes.map(p => <li key={p.c_interno}>{p.c_interno} · {p.producto} · {p.precio} · {p.estado}</li>)}</ul>}</article>)}</div><PageControls offset={filters.offset} length={query.data.rows.length} onChange={offset => setFilters({ ...filters, offset })} /></> : <ReadNotice {...query} />}{editor !== undefined && <GroupEditor group={editor} onClose={() => setEditor(undefined)} />}{pack && <PackagePrice groupId={pack} onClose={() => setPack(null)} />}
  </section>
}
export function AdminGroupsV2() {
  const [tab, setTab] = useState<'groups' | 'products'>('groups')
  return <><div className="admin-v2-toolbar"><button className="button button--secondary" onClick={() => setTab('groups')}>Grupos</button><button className="button button--secondary" onClick={() => setTab('products')}>Productos</button></div><MutationNotice domain="master" />{tab === 'groups' ? <Groups /> : <Products />}</>
}
