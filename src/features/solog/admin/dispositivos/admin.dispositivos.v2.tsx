import { useState } from 'react'
import { Inbox, Tablet } from 'lucide-react'
import { useAdminStore } from '../admin.v2.context'
import { useManagement, useManagementQuery } from '../admin.management.context'
import { AdminDialog } from '../admin.dialog'
import { ReadNotice, MutationNotice } from '../admin.management.presentation'
import { adminSiteLabel, orderedAdminSites, deviceAccessLabel } from '../admin.site-ui'
import type { Device } from '../admin.management.v2'

type Action = 'authorize' | 'replace' | 'revoke' | 'reject'
const labels: Record<Action, string> = { authorize: 'Autorizar', replace: 'Reemplazar', revoke: 'Revocar', reject: 'Rechazar' }
export function AdminDevicesV2() {
  const admin = useAdminStore(), store = useManagement(), [confirmation, setConfirmation] = useState<{ device: Device; action: Action } | null>(null), [error, setError] = useState('')
  const query = useManagementQuery('list', {})
  const confirm = () => {
    if (!confirmation) return
    const { action } = confirmation
    const device = query.data?.devices.find(d => d.id === confirmation.device.id)
    if (!device) { setError('Actualiza la lista: el dispositivo ya no está disponible.'); return }
    setError('')
    void store.mutation(action, { device_id: device.id }, device.revision, device.site_id).then(() => setConfirmation(null)).catch(e => setError(e.message))
  }
  const sites = orderedAdminSites(admin.bootstrap?.allowed_sites ?? [])
  const devices = query.data?.devices ?? []
  const pending = sites.flatMap(site => devices.filter(device => device.site_id === site.id && device.estado === 'pendiente'))
  const openAction = (device: Device, action: Action) => { setError(''); setConfirmation({ device, action }) }
  return <><div className="admin-devices"><MutationNotice domain="devices" />
    {query.data ? <>
      <section className="admin-devices__section" aria-labelledby="admin-tablets-title">
        <h2 id="admin-tablets-title">Tablets por sede</h2>
        <div className="admin-devices__list">{sites.map(site => {
          const device = devices.find(item => item.site_id === site.id && item.estado === 'autorizado')
          return <article className={'admin-device-card' + (device ? ' admin-device-card--authorized' : '')} key={site.id} aria-label={'Tablet de ' + adminSiteLabel(site.nombre)}>
            <span className="admin-device-card__icon"><Tablet size={23} aria-hidden="true" /></span>
            <header><h3>{adminSiteLabel(site.nombre)}</h3><span className={'admin-device-badge ' + (device ? 'admin-device-badge--authorized' : 'admin-device-badge--empty')}>{device ? 'Autorizado' : 'Sin tablet'}</span></header>
            {device ? <>
              <div className="admin-device-card__person"><strong>{device.solicitante}</strong><p>Último acceso · {deviceAccessLabel(device.ultimo_acceso_at)}</p></div>
              <footer><button className="button button--secondary" disabled={!!store.intent('devices')} onClick={() => openAction(device, 'revoke')}>Revocar</button></footer>
            </> : <p className="admin-device-card__empty">No hay tablet autorizada.</p>}
          </article>
        })}</div>
      </section>
      <section className="admin-devices__section" aria-labelledby="admin-requests-title">
        <h2 id="admin-requests-title">Solicitudes pendientes</h2>
        <div className="admin-devices__list">{pending.map(device => {
          const hasTablet = devices.some(item => item.site_id === device.site_id && item.estado === 'autorizado')
          return <article className="admin-device-card" key={device.id} aria-label={'Solicitud de ' + adminSiteLabel(device.site)}>
            <span className="admin-device-card__icon"><Tablet size={23} aria-hidden="true" /></span>
            <header><h3>{adminSiteLabel(device.site)}</h3><span className="admin-device-badge admin-device-badge--pending">Solicitud pendiente</span></header>
            <div className="admin-device-card__person"><strong>{device.solicitante}</strong><p>Solicitado · {deviceAccessLabel(device.solicitado_at)}</p></div>
            <footer><div className="admin-v2-actions">
              <button className="button" disabled={!!store.intent('devices')} onClick={() => openAction(device, hasTablet ? 'replace' : 'authorize')}>{hasTablet ? 'Reemplazar tablet' : 'Autorizar'}</button>
              <button className="button button--secondary" disabled={!!store.intent('devices')} onClick={() => openAction(device, 'reject')}>Rechazar</button>
            </div></footer>
          </article>
        })}{!pending.length && <p className="admin-devices__empty"><Inbox size={19} aria-hidden="true" />No hay solicitudes pendientes.</p>}</div>
      </section>
    </> : <ReadNotice {...query} />}
    </div>
    {confirmation && <AdminDialog title={`${labels[confirmation.action]} dispositivo`} onClose={() => setConfirmation(null)} closeDisabled={!!store.intent('devices')?.pending}><p>{confirmation.device.site} · {confirmation.device.id}</p><p>{confirmation.action === 'replace' ? 'Se revocará el dispositivo actual y se autorizará esta solicitud en una única operación backend.' : confirmation.action === 'revoke' ? 'El dispositivo perderá autorización. El siguiente acceso protegido volverá a validarla.' : confirmation.action === 'reject' ? 'Se rechazará esta solicitud pendiente.' : 'El backend comprobará que no exista otro dispositivo autorizado.'}</p><button className="button" disabled={!!store.intent('devices')} onClick={confirm}>Confirmar {labels[confirmation.action].toLowerCase()}</button>{error && <p role="alert">{error}</p>}<MutationNotice domain="devices" onSuccess={() => setConfirmation(null)} /></AdminDialog>}
  </>
}
