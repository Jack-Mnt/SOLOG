import { useState, useSyncExternalStore } from 'react'
import { AdminDialog } from '../admin.dialog'
import { useAdminQuery, useAdminStore } from '../admin.v2.context'
import type { AdminPayloads, ControlPeriod, DifferenceState } from '../admin.v2'
import { QueryState, Updated, Value } from '../admin.v2.presentation'
import { adminTimestamp, validCustomRange } from '../admin.v2.format'
import { AdminExportDialog } from './admin.control.v2.export-dialog'

const periods: [ControlPeriod, string][] = [['today', 'Hoy'], ['last_week', 'Última semana'], ['current_biweekly', 'Período actual quincenal'], ['previous_biweekly', 'Período anterior quincenal'], ['custom', 'Personalizado']]
const states: DifferenceState[] = ['Coincide', 'Recontar', 'Confirmada', 'Inconsistente']
function GroupDetail({ site, group, name, close }: { site: string; group: string; name: string; close: () => void }) {
  const query = useAdminQuery('control_detail', { site_id: site, group_id: group })
  return <AdminDialog title={`Cronología de ${name}`} description="Resultados históricos de este grupo en la sede seleccionada." onClose={close} wide className="admin-v2-drawer">
    {!query.data ? <QueryState {...query} /> : <><Updated at={query.data.generated_at} /><div className="admin-v2-table"><table><thead><tr><th>Origen</th><th>Estado vigente</th><th>Teórico de conteo</th><th>Físico de conteo</th><th>Diferencia inicial</th><th>Stock posterior</th><th>Teórico de reconteo</th><th>Físico de reconteo</th><th>Recontado</th><th>Diferencia vigente</th><th>Valorizado</th></tr></thead><tbody>{query.data.chronology.map(r => <tr key={r.case_id}><td>{adminTimestamp(r.contado_at)}</td><td>{r.estado_diferencia}</td><td><Value value={r.stock_teorico} /></td><td><Value value={r.stock_fisico} /></td><td><Value value={r.diferencia_inicial} /></td><td><Value value={r.stock_posterior} /></td><td><Value value={r.stock_teorico_reconteo} /></td><td><Value value={r.stock_reconteo} /></td><td>{adminTimestamp(r.recontado_at)}</td><td><Value value={r.diferencia} /></td><td><Value value={r.valor_diferencia} money /></td></tr>)}</tbody></table></div>{!query.data.chronology.length && <p>No hay registros.</p>}</>}
  </AdminDialog>
}
function ControlResults({ payload }: { payload: AdminPayloads['control_page'] }) {
  const query = useAdminQuery('control_page', payload)
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null)
  const data = query.data
  if (!data) return <QueryState {...query} />
  return <><Updated at={data.generated_at} /><p>{data.period.from} — {data.period.to}</p><div className="admin-v2-kpis"><span>Total: {data.summary.total}</span><span>Coincide: {data.summary.coincide}</span><span>Por recontar: {data.summary.pending_recount}</span><span>Confirmadas: {data.summary.confirmed}</span><span>Inconsistentes: {data.summary.inconsistent}</span></div>
    <div className="admin-v2-table"><table><thead><tr><th>Grupo</th><th>Categoría</th><th>Origen</th><th>Estado</th><th>Diferencia</th><th>Valorizado</th><th>Detalle</th></tr></thead><tbody>{data.items.map(row => <tr key={row.case_id}><td>{row.grupo}</td><td>{row.categoria}</td><td>{adminTimestamp(row.contado_at)}</td><td>{row.estado_diferencia}</td><td><Value value={row.diferencia} /></td><td><Value value={row.valor_diferencia} money /></td><td><button className="button button--secondary" aria-label={`Ver cronología de ${row.grupo}`} onClick={() => setGroup({ id: row.grupo_id, name: row.grupo })}>Ver</button></td></tr>)}</tbody></table></div>{!data.items.length && <p>Sin resultados para estos filtros.</p>}
    {group && <GroupDetail site={payload.site_id} group={group.id} name={group.name} close={() => setGroup(null)} />}
  </>
}
export function AdminControlV2() {
  const store = useAdminStore()
  useSyncExternalStore(store.subscribe, store.snapshot)
  const sites = store.bootstrap!.allowed_sites
  const [site, setSite] = useState(sites[0]?.id ?? '')
  const [period, setPeriod] = useState<ControlPeriod>('today')
  const [state, setState] = useState<DifferenceState | ''>('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [payload, setPayload] = useState<AdminPayloads['control_page']>({ site_id: site, period: 'today', state: null, page: 0, page_size: 100 })
  const invalid = period === 'custom' && !validCustomRange(from, to)
  const apply = () => { setPage(0); setPayload({ site_id: site, period, state: state || null, ...(search.trim() ? { search: search.trim() } : {}), page: 0, page_size: 100, ...(period === 'custom' ? { date_from: from, date_to: to } : {}) }) }
  const currentPayload = { ...payload, page }
  const cached = store.peek('control_page', currentPayload).data
  return <section><div className="admin-v2-toolbar"><h2>Consulta por sede</h2><button disabled={!site} className="button" onClick={() => setExportOpen(true)}>DESCARGAR AJUSTE</button></div>
    <form className="admin-v2-filters" onSubmit={e => { e.preventDefault(); if (!invalid) apply() }}>
      <label>Sede<select aria-label="Sede" value={site} onChange={e => { setSite(e.target.value); setPage(0); setPayload(p => ({ ...p, site_id: e.target.value, page: 0 })) }}>{sites.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      <label>Período<select aria-label="Período" value={period} onChange={e => setPeriod(e.target.value as ControlPeriod)}>{periods.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      {period === 'custom' && <><label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}
      <label>Estado<select value={state} onChange={e => setState(e.target.value as DifferenceState | '')}><option value="">Todos</option>{states.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Buscar grupo<input value={search} onChange={e => setSearch(e.target.value)} /></label><button className="button" disabled={!site || invalid}>Aplicar filtros</button>
    </form>{invalid && <p role="alert">Selecciona un rango válido de hasta 92 días.</p>}
    {site ? <><p>Consulta aplicada: {sites.find(s => s.id === payload.site_id)?.nombre}</p><ControlResults key={JSON.stringify(currentPayload)} payload={currentPayload} /><div className="admin-v2-toolbar"><button className="button button--secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page + 1}</span><button className="button button--secondary" disabled={!cached || (page + 1) * cached.page_size >= cached.summary.total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></> : <p>No hay sedes disponibles.</p>}
    {exportOpen && <AdminExportDialog siteId={site} onClose={() => setExportOpen(false)} />}
  </section>
}
