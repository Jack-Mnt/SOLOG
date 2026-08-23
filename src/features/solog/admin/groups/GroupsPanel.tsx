import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, Layers3, Pencil, Plus, Search, Shuffle } from 'lucide-react'
import type { SologGroupProductSearchRow, SologGroupSummary } from '../../types'
import { AdminDialog } from '../AdminDialog'
import { formatAdminCurrency } from '../format'
import { GroupDefinitionDialog } from './GroupDefinitionDialog'
import { GroupValuationDialog } from './GroupValuationDialog'
import { ProductClassificationDialog } from './ProductClassificationDialog'
import { GROUPS_PAGE_SIZE, useAdminGroups } from './useAdminGroups'
import { formatGroupValuation, getGroupValuationLines } from './valuation'

export function GroupsPanel({ refreshOperationalState }: { refreshOperationalState: () => Promise<void> }) {
  const groups = useAdminGroups(refreshOperationalState)
  const [selected, setSelected] = useState<SologGroupSummary | null>(null)
  const [definition, setDefinition] = useState<SologGroupSummary | 'new' | null>(null)
  const [classification, setClassification] = useState<{ product: SologGroupProductSearchRow | null; group: SologGroupSummary | null } | null>(null)
  const [valuation, setValuation] = useState<SologGroupSummary | null>(null)
  const rows = groups.response?.rows ?? []
  const submitFilters = (event: FormEvent) => { event.preventDefault(); groups.applyFilters() }
  const memberToSearchRow = (product: SologGroupSummary['integrantes'][number], group: SologGroupSummary): SologGroupProductSearchRow => ({ ...product, categoria_id: group.categoria_id, categoria: group.categoria, grupo_id: group.id, grupo: group.nombre, propuesta: null })
  const saveAndCloseDetail = async (payload: Parameters<typeof groups.save>[0]) => {
    const completed = await groups.save(payload)
    if (completed) setSelected(null)
    return completed
  }
  const saveValuation = async (payload: Parameters<typeof groups.saveValuation>[0]) => {
    const completed = await groups.saveValuation(payload)
    if (completed) {
      setSelected((current) => current?.id === payload.grupo_id ? {
        ...current,
        unidades_por_paquete: payload.unidades_por_paquete,
        precio_paquete: payload.precio_paquete,
      } : current)
    }
    return completed
  }
  const openValuation = (group: SologGroupSummary) => {
    groups.clearValuationError()
    setValuation(group)
  }

  return (
    <section className="content-section admin-module groups-workbench" aria-labelledby="groups-title">
      <div className="section-heading"><div><div className="section-title-row"><span className="section-icon"><Layers3 size={20} /></span><h2 id="groups-title">Grupos</h2></div><p>Administra la estructura futura de los grupos y su valorización vigente en SOLOG.</p></div><button className="button" disabled={!groups.reference} onClick={() => setDefinition('new')} type="button"><Plus size={17} />Nueva definición</button></div>
      <div className="groups-legend"><span><i className="groups-legend__published" />Publicado actual</span><span><i className="groups-legend__proposed" />Cambio futuro</span></div>
      <form className="groups-filters" onSubmit={submitFilters}><label>Buscar<span className="catalog-search__control"><Search size={16} /><input disabled={groups.status === 'loading'} onChange={(event) => groups.setDraftFilters((current) => ({ ...current, buscar: event.target.value }))} placeholder="Grupo, producto o C. interno…" value={groups.draftFilters.buscar} /></span></label><label>Categoría<select disabled={groups.status === 'loading'} onChange={(event) => groups.setDraftFilters((current) => ({ ...current, categoria_id: event.target.value }))} value={groups.draftFilters.categoria_id}><option value="">Todas</option>{groups.reference?.categorias.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label><label>Tipo<select disabled={groups.status === 'loading'} onChange={(event) => groups.setDraftFilters((current) => ({ ...current, tipo: event.target.value as '' | 'Único' | 'Agrupado' }))} value={groups.draftFilters.tipo}><option value="">Todos</option><option value="Único">Único</option><option value="Agrupado">Agrupado</option></select></label><div className="admin-report-filter-actions"><button className="button" disabled={groups.status === 'loading'} type="submit">Aplicar</button><button className="button button--secondary" disabled={groups.status === 'loading'} onClick={groups.resetFilters} type="button">Limpiar</button></div></form>
      {groups.notice ? <div className="notice notice--success" role="status"><strong>{groups.notice}</strong><button className="text-button" onClick={groups.dismissNotice}>Cerrar</button></div> : null}
      {groups.error ? <div className="notice notice--error" role="alert"><strong>No se pudo completar la operación</strong><p>{groups.error}</p></div> : null}
      {groups.status === 'loading' ? <div className="empty-state" role="status">Consultando estructura de grupos…</div> : null}
      {groups.status === 'ready' && !rows.length ? <div className="empty-state">No hay grupos con estos filtros.</div> : null}
      {groups.status === 'ready' && rows.length ? <div className="admin-report-table-wrap groups-table-wrap"><table className="admin-report-table admin-interactive-table groups-table"><caption>Grupos de conteo publicados y propuestas futuras</caption><thead><tr><th>Grupo</th><th>Categoría</th><th>Valorización</th><th>Productos</th><th>Estado</th><th>Cambios</th><th aria-label="Acción" /></tr></thead><tbody>{rows.map((group) => <tr key={group.id} onClick={() => setSelected(group)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') setSelected(group) }}><td><strong>{group.nombre}</strong></td><td>{group.categoria}</td><td className="groups-valuation-cell">{formatGroupValuation(group, true)}</td><td>{group.sku_count}</td><td><span className={`admin-state-badge admin-state-badge--${group.activo ? 'aprobado' : 'ignorado'}`}>{group.activo ? group.tipo : 'Inactivo'}</span></td><td>{group.propuestas.length ? <span className="groups-change-count">{group.propuestas.length} futura{group.propuestas.length === 1 ? '' : 's'}</span> : 'Sin cambios'}</td><td className="catalog-row-action"><ChevronRight size={17} /></td></tr>)}</tbody></table></div> : null}
      {groups.response ? <nav className="admin-report-pagination" aria-label="Paginación de grupos"><button className="button button--secondary" disabled={!groups.offset || groups.status === 'loading'} onClick={groups.previousPage}><ArrowLeft size={17} />Anterior</button><span>Página {Math.floor(groups.offset / GROUPS_PAGE_SIZE) + 1}</span><button className="button button--secondary" disabled={rows.length < GROUPS_PAGE_SIZE || groups.status === 'loading'} onClick={groups.nextPage}>Siguiente<ArrowRight size={17} /></button></nav> : null}
      {selected ? <AdminDialog className="group-detail-dialog" footer={<><button className="button button--secondary" onClick={() => setClassification({ product: null, group: selected })}><Shuffle size={17} />Buscar producto</button><button className="button" onClick={() => setDefinition(selected)}><Pencil size={17} />Proponer edición</button></>} onClose={() => setSelected(null)} title={selected.nombre} wide><div className="group-detail-summary"><article><span>Categoría</span><strong>{selected.categoria}</strong></article><article className="group-detail-valuation"><span>Valorización</span>{(() => { const lines = getGroupValuationLines(selected); return <strong>{lines.primary}{lines.secondary ? <small>{lines.secondary}</small> : null}</strong> })()}<button className="text-button" onClick={() => openValuation(selected)} type="button"><Pencil size={14} />Editar valorización</button></article><article><span>Estado</span><strong>{selected.activo ? selected.tipo : 'Inactivo'}</strong></article><article><span>Productos</span><strong>{selected.sku_count}</strong></article></div><section className="admin-detail-section"><h3>Integrantes publicados</h3>{selected.integrantes.length ? <div className="group-members">{selected.integrantes.map((product) => <button key={product.c_interno} onClick={() => setClassification({ product: memberToSearchRow(product, selected), group: selected })}><span><strong>{product.producto}</strong><small>C. interno {product.c_interno} · {product.marca ?? 'Sin marca'}</small></span><span>{formatAdminCurrency(product.precio)} · {product.estado}</span></button>)}</div> : <div className="empty-state">Este grupo no tiene integrantes publicados.</div>}</section><section className="admin-detail-section"><h3>Cambios para próxima versión</h3>{selected.propuestas.length ? <div className="group-proposals">{selected.propuestas.map((proposal) => <article key={proposal.id}><span className={`admin-state-badge admin-state-badge--${proposal.estado}`}>{proposal.estado}</span><strong>{proposal.tipo === 'definicion_grupo' ? 'Definición del grupo' : 'Clasificación de producto'}</strong><small>La estructura publicada aún no cambió.</small></article>)}</div> : <p className="helper-text">No hay propuestas pendientes o aprobadas relacionadas.</p>}</section></AdminDialog> : null}
      {valuation ? <GroupValuationDialog error={groups.valuationError} group={valuation} onClose={() => setValuation(null)} onSave={saveValuation} saving={groups.saving} /> : null}
      {definition && groups.reference ? <GroupDefinitionDialog group={definition === 'new' ? null : definition} onClose={() => setDefinition(null)} onSave={saveAndCloseDetail} reference={groups.reference} saving={groups.saving} /> : null}
      {classification && groups.reference ? <ProductClassificationDialog initialGroup={classification.group} initialProduct={classification.product} onClose={() => setClassification(null)} onSave={saveAndCloseDetail} reference={groups.reference} saving={groups.saving} /> : null}
    </section>
  )
}
