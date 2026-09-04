import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { useAdminQuery } from '../admin.v2.context'
import type { Biweekly, DashboardCards } from '../admin.v2'
import { QueryState, Updated, Value } from '../admin.v2.presentation'
import { adminTimestamp } from '../admin.v2.format'
import { AdminExportDialog } from '../control/admin.control.v2.export-dialog'

function DailyDrawer({ site, date, close }: { site: string; date: string; close: () => void }) {
  const query = useAdminQuery('daily_detail', { site_id: site, origin_date: date })
  const data = query.data
  return <AdminDialog title={`Conteos originados el ${date}`} description="Estado vigente de los conteos de esta fecha. Zona horaria America/Lima." onClose={close} wide className="admin-v2-drawer">
    {!data ? <QueryState {...query} /> : <><Updated at={data.generated_at} /><div className="admin-v2-kpis"><span>Por recontar: {data.summary.pending_recount}</span><span>Confirmadas: {data.summary.confirmed}</span><span>Inconsistentes: {data.summary.inconsistent}</span></div>
      <div className="admin-v2-table"><table><thead><tr><th>Grupo / estado</th><th>Stock teórico / posterior aplicable</th><th>Stock físico / reconteo aplicable</th><th>Diferencia</th><th>Valorizado</th></tr></thead><tbody>{data.items.map(row => <tr key={row.case_id}><td>{row.grupo} · {row.estado}</td><td><Value value={row.theoretical} /></td><td><Value value={row.physical} /></td><td><Value value={row.difference} /></td><td><Value value={row.value} money /></td></tr>)}</tbody></table></div>{!data.items.length && <p>No hay conteos originados este día.</p>}</>}
  </AdminDialog>
}
function Grid({ site }: { site: string }) {
  const [period, setPeriod] = useState<Biweekly>('current_biweekly')
  const [date, setDate] = useState<string | null>(null)
  const query = useAdminQuery('shift_grid', { site_id: site, period })
  const data = query.data
  return <section aria-label="Cobertura por turnos"><label>Quincena de turnos <select value={period} onChange={e => { setPeriod(e.target.value as Biweekly); setDate(null) }}><option value="current_biweekly">Período actual quincenal</option><option value="previous_biweekly">Período anterior quincenal</option></select></label>
    {!data ? <QueryState {...query} /> : <><Updated at={data.generated_at} /><p>{data.period.from} — {data.period.to}</p><div className="admin-v2-table"><table><caption>Día 07:30–15:30 · Noche 15:30–00:00 · Madrugada 00:00–07:30 (Lima)</caption><thead><tr><th>Turno</th>{data.data.totals.map(total => <th key={total.date}>{total.date}</th>)}</tr></thead><tbody>
      {([['day', 'Día'], ['night', 'Noche'], ['early', 'Madrugada']] as const).map(([shift, label]) => <tr key={shift}><th>{label}</th>{data.data.totals.map(total => {
        const cell = data.data.shifts.find(s => s.date === total.date && s.shift === shift)
        return <td key={total.date} title={cell ? `${cell.numerator}/${cell.denominator} · ${adminTimestamp(cell.calculated_at)}` : 'Corte no disponible'}>{cell ? `${cell.percentage}%` : '—'}</td>
      })}</tr>)}
      <tr><th>Total</th>{data.data.totals.map(total => <td key={total.date} title={`${total.numerator}/${total.denominator}`}><span>{total.percentage}%</span> <button className="icon-button" aria-label={`Abrir día ${total.date}`} onClick={() => setDate(total.date)}>+</button></td>)}</tr>
    </tbody></table></div></>}
    {date && data && <DailyDrawer key={`${site}|${date}`} site={site} date={date} close={() => setDate(null)} />}
  </section>
}
function SiteCard({ site }: { site: DashboardCards['sites'][number] }) {
  const [expanded, setExpanded] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const complete = site.period_coverage.complete
  const percent = complete ? site.daily_coverage.percent : site.period_coverage.percent
  const counted = complete ? site.daily_coverage.counted_today : site.period_coverage.counted
  const total = complete ? site.daily_coverage.total : site.period_coverage.total
  return <article className="admin-v2-card" aria-label={`Sede ${site.site}`}><header><h2>{site.site}</h2><button className="icon-button" aria-label={`${expanded ? 'Ocultar' : 'Ver'} turnos de ${site.site}`} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? <ChevronUp /> : <ChevronDown />}</button></header>
    {complete && <p>Cobertura quincenal: <strong>Completada</strong></p>}<p>{complete ? 'Cobertura diaria' : 'Cobertura quincenal'}: {counted} / {total} · {percent}%</p><progress aria-label={complete ? 'Cobertura diaria' : 'Cobertura quincenal'} max={100} value={percent} />
    <p>Por recontar: {site.pending_recount}</p><p>Snapshot: {site.snapshot ? adminTimestamp(site.snapshot.confirmado_at) : 'Sin snapshot confirmado'}</p>
    <button className="button button--secondary" onClick={() => setExportOpen(true)}>DESCARGAR AJUSTE</button>
    {expanded && <Grid site={site.site_id} />}{exportOpen && <AdminExportDialog siteId={site.site_id} onClose={() => setExportOpen(false)} />}
  </article>
}
export function AdminDashboardV2() {
  const query = useAdminQuery('dashboard_cards', {})
  return query.data ? <><Updated at={query.data.generated_at} /><section className="admin-v2-cards" aria-label="Resumen por sede">{query.data.sites.map(site => <SiteCard key={site.site_id} site={site} />)}</section>{!query.data.sites.length && <p>No hay sedes disponibles.</p>}</> : <QueryState {...query} />
}
