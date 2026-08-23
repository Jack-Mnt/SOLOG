import { ShieldOff, TabletSmartphone } from 'lucide-react'
import type { AdminMutation } from './useAdminSolog'
import type { SologAdminSite } from '../types'
import { formatDeviceDate } from './device-format'

export function AuthorizedDevices({
  sites,
  mutation,
  onRevoke,
}: {
  sites: SologAdminSite[]
  mutation: AdminMutation | null
  onRevoke: (site: SologAdminSite) => void
}) {
  return (
    <section className="content-section admin-devices-section" aria-labelledby="authorized-title">
      <div className="section-heading">
        <div>
          <div className="section-title-row"><span className="section-icon"><TabletSmartphone size={19} /></span><h2 id="authorized-title">Tablets por sede</h2></div>
          <p>Una tablet autorizada por sede.</p>
        </div>
      </div>
      <div className="device-site-list">
        {sites.map((site) => {
          const isRevoking =
            mutation?.action === 'revoke' &&
            mutation.deviceId === site.dispositivo?.id

          return (
            <article className={`device-site-card${site.dispositivo ? ' device-site-card--authorized' : ''}`} key={site.id}>
              <div className="device-card-identity">
                <span className="device-card-icon" aria-hidden="true"><TabletSmartphone size={19} /></span>
                <div>
                  <h3>{site.nombre}</h3>
                  <span className={`device-status-badge${site.dispositivo ? ' device-status-badge--authorized' : ''}`}>
                    {site.dispositivo ? 'Autorizada' : 'Sin tablet autorizada'}
                  </span>
                </div>
              </div>
              {site.dispositivo ? (
                <>
                  <dl className="device-card-facts">
                    <div><dt>Autorizada desde</dt><dd>{formatDeviceDate(site.dispositivo.autorizado_at)}</dd></div>
                    <div><dt>Último acceso</dt><dd>{formatDeviceDate(site.dispositivo.ultimo_acceso_at)}</dd></div>
                  </dl>
                  <button
                    className="button button--danger device-card-action"
                    disabled={mutation !== null}
                    onClick={() => onRevoke(site)}
                    type="button"
                  >
                    <ShieldOff size={16} /> {isRevoking ? 'Revocando…' : 'Revocar tablet'}
                  </button>
                </>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
