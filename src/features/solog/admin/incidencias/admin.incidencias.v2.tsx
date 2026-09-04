import { useState } from 'react'
import { useAdminStore } from '../admin.v2.context'
import { useManagement, useManagementQuery } from '../admin.management.context'
import { AdminDialog } from '../admin.dialog'
import { ReadNotice, MutationNotice } from '../admin.management.presentation'
import { adminTimestamp } from '../admin.v2.format'
import type { Family } from '../admin.management.v2'

function FamilyDetail({ family, site, onClose }: { family: Family; site: string; onClose: () => void }) {
  const [page, setPage] = useState(0)
  const query = useManagementQuery('detail', { family_key: family.family_key, ...(site ? { site_id: site } : {}), page, page_size: 100 })
  return <AdminDialog title={`Repeticiones · ${family.tipo}`} onClose={onClose} wide>{query.data ? <><div className="admin-v2-table"><table><thead><tr><th>Sede</th><th>Estado</th><th>Primera detección</th><th>Última detección</th><th>Apariciones</th><th>Datos</th></tr></thead><tbody>{query.data.items.map(i => <tr key={i.id}><td>{i.sede}</td><td>{i.estado}</td><td>{adminTimestamp(i.first_seen_at)}</td><td>{adminTimestamp(i.last_seen_at)}</td><td>{i.occurrence_count}</td><td><details><summary>Ver</summary><pre className="admin-v2-json">{JSON.stringify(i.datos, null, 2)}</pre></details></td></tr>)}</tbody></table></div><div className="admin-v2-toolbar"><button className="button button--secondary" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="button button--secondary" disabled={query.data.items.length < 100} onClick={() => setPage(page + 1)}>Siguiente</button></div></> : <ReadNotice {...query} />}</AdminDialog>
}
export function AdminIncidentsV2() {
  const admin = useAdminStore(), store = useManagement(), [site, setSite] = useState(''), [family, setFamily] = useState<Family | null>(null), [error, setError] = useState('')
  const query = useManagementQuery('summary', site ? { site_id: site } : {})
  const act = (f: Family, action: 'ignore_30d' | 'reactivate' | 'propose_delete') => {
    if (!query.data) return
    setError('')
    void store.mutation(action, { family_key: f.family_key, scope: site ? 'site' : 'global', ...(site ? { site_id: site } : {}) }, query.data.revisions.incidents, site || undefined).catch(e => setError(e.message))
  }
  return <><div className="admin-v2-toolbar"><label>Ámbito de incidencias<select value={site} onChange={e => { setSite(e.target.value); setFamily(null); setError('') }}><option value="">Global · todas las sedes</option>{admin.bootstrap?.allowed_sites.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><button className="button button--secondary" onClick={query.retry}>Actualizar incidencias</button></div><p>Ignore 30d y Reactivate se aplican al ámbito seleccionado. Una supresión global u otra supresión de sede puede seguir vigente. Proponer eliminación no elimina ni suprime.</p><MutationNotice domain="incidents" />{error && <p role="alert">{error}</p>}
    {query.data ? <><p>Período operativo: {query.data.period.from} — {query.data.period.to} · America/Lima</p><div className="admin-v2-cards">{query.data.families.map(f => <article className="admin-v2-card" key={f.family_key}><h2>{f.tipo} · {f.c_interno ?? f.c_interno_original ?? 'sin código'}</h2><p>{f.cases} casos · {f.occurrences} apariciones · {f.sites} sedes</p><p>{f.pending_cases} pendientes · {f.suppressed_cases} suprimidos</p>{f.active_suppression_until && <p>Supresión presente hasta {adminTimestamp(f.active_suppression_until)}</p>}{f.deletion_proposed && <p>Eliminación propuesta en Catálogo.</p>}<div className="admin-v2-actions"><button className="button button--secondary" aria-label={`Ver repeticiones ${f.family_key}`} onClick={() => setFamily(f)}>+ Repeticiones</button><button className="button button--secondary" disabled={!!store.intent('incidents')} onClick={() => act(f, 'ignore_30d')}>Ignore 30d</button><button className="button button--secondary" disabled={!!store.intent('incidents')} onClick={() => act(f, 'reactivate')}>Reactivate</button>{f.tipo === 'producto_ausente' && f.c_interno !== null && <button className="button button--secondary" disabled={!!store.intent('incidents')} onClick={() => act(f, 'propose_delete')}>Propose deletion</button>}</div></article>)}</div>{!query.data.families.length && <p>No hay familias en este período y ámbito.</p>}</> : <ReadNotice {...query} />}{family && <FamilyDetail key={`${site}:${family.family_key}`} family={family} site={site} onClose={() => setFamily(null)} />}
  </>
}
