import { useState } from 'react'
import { useAdminStore } from '../admin.v2.context'
import { useManagement, useManagementQuery } from '../admin.management.context'
import { AdminDialog } from '../admin.dialog'
import { ReadNotice, MutationNotice } from '../admin.management.presentation'
import { adminTimestamp } from '../admin.v2.format'
import type { Device } from '../admin.management.v2'

type Action = 'authorize' | 'replace' | 'revoke' | 'reject'
const labels: Record<Action, string> = { authorize: 'Autorizar', replace: 'Reemplazar', revoke: 'Revocar', reject: 'Rechazar' }
export function AdminDevicesV2() {
  const admin = useAdminStore(), store = useManagement(), [site, setSite] = useState(''), [confirmation, setConfirmation] = useState<{ device: Device; action: Action } | null>(null), [error, setError] = useState('')
  const query = useManagementQuery('list', site ? { site_id: site } : {})
  const confirm = () => {
    if (!confirmation) return
    const { action } = confirmation
    const device = query.data?.devices.find(d => d.id === confirmation.device.id)
    if (!device) { setError('Actualiza la lista: el dispositivo ya no está disponible.'); return }
    setError('')
    void store.mutation(action, { device_id: device.id }, device.revision, device.site_id).then(() => setConfirmation(null)).catch(e => setError(e.message))
  }
  const result = store.results.get('devices')
  return <><div className="admin-v2-toolbar"><label>Sede de dispositivos<select value={site} onChange={e => { setSite(e.target.value); setConfirmation(null); setError('') }}><option value="">Todas las sedes</option>{admin.bootstrap?.allowed_sites.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><button className="button button--secondary" onClick={query.retry}>Actualizar dispositivos</button></div><p>Un dispositivo autorizado por sede. Autorizar no reemplaza; usa Reemplazar para la sustitución explícita.</p><MutationNotice domain="devices" />
    {result && (!site || result.site_id === site) && <section className="admin-v2-card" role="status"><h2>Última operación confirmada</h2><p>Sede: {admin.bootstrap?.allowed_sites.find(s => s.id === result.site_id)?.nombre} · revisión {result.revisions.devices}</p><p>Autorizado: {result.authorized_device?.id ?? 'ninguno'}</p><p>Pendientes: {result.pending_devices?.map(d => d.id).join(', ') || 'ninguno'}</p></section>}
    {query.data ? <div className="admin-v2-cards">{admin.bootstrap?.allowed_sites.filter(s => !site || s.id === site).map(s => <section className="admin-v2-card" key={s.id}><h2>{s.nombre}</h2>{query.data!.devices.filter(d => d.site_id === s.id).map(d => <article key={d.id}><h3>{d.estado === 'autorizado' ? 'Autorizado' : 'Solicitud pendiente'}</h3><p>{d.id}</p><p>Solicitante: {d.solicitante} · {adminTimestamp(d.solicitado_at)}</p><p>Último acceso: {adminTimestamp(d.ultimo_acceso_at)} · revisión {d.revision}</p><div className="admin-v2-actions">{(d.estado === 'autorizado' ? ['revoke'] as Action[] : ['authorize', 'replace', 'reject'] as Action[]).map(action => <button className="button button--secondary" key={action} disabled={!!store.intent('devices')} onClick={() => { setError(''); setConfirmation({ device: d, action }) }}>{labels[action]}</button>)}</div></article>)}{!query.data!.devices.some(d => d.site_id === s.id) && <p>Sin dispositivos autorizados ni solicitudes.</p>}</section>)}</div> : <ReadNotice {...query} />}
    {confirmation && <AdminDialog title={`${labels[confirmation.action]} dispositivo`} onClose={() => setConfirmation(null)} closeDisabled={!!store.intent('devices')?.pending}><p>{confirmation.device.site} · {confirmation.device.id}</p><p>{confirmation.action === 'replace' ? 'Se revocará el dispositivo actual y se autorizará esta solicitud en una única operación backend.' : confirmation.action === 'revoke' ? 'El dispositivo perderá autorización. El siguiente acceso protegido volverá a validarla.' : confirmation.action === 'reject' ? 'Se rechazará esta solicitud pendiente.' : 'El backend comprobará que no exista otro dispositivo autorizado.'}</p><button className="button" disabled={!!store.intent('devices')} onClick={confirm}>Confirmar {labels[confirmation.action].toLowerCase()}</button>{error && <p role="alert">{error}</p>}<MutationNotice domain="devices" onSuccess={() => setConfirmation(null)} /></AdminDialog>}
  </>
}
