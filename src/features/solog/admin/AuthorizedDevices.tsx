import { formatAdminDate } from './format'
import type { AdminMutation } from './useAdminSolog'
import type { SologAdminSite } from '../types'

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
    <section className="content-section" aria-labelledby="authorized-title">
      <div className="section-heading">
        <div>
          <h2 id="authorized-title">Tablets por sede</h2>
          <p>Dispositivos actualmente autorizados por el backend.</p>
        </div>
      </div>
      <div className="admin-pending-list">
        {sites.map((site) => {
          const isRevoking =
            mutation?.action === 'revoke' &&
            mutation.deviceId === site.dispositivo?.id

          return (
            <article className="admin-pending-card" key={site.id}>
              <div>
                <h3>{site.nombre}</h3>
                {site.dispositivo ? (
                  <dl className="admin-device-details">
                    <div><dt>Estado</dt><dd>Autorizada</dd></div>
                    <div><dt>Autorizada</dt><dd>{formatAdminDate(site.dispositivo.autorizado_at)}</dd></div>
                    <div><dt>Último acceso</dt><dd>{formatAdminDate(site.dispositivo.ultimo_acceso_at)}</dd></div>
                  </dl>
                ) : (
                  <p className="admin-device-empty">Sin tablet autorizada</p>
                )}
              </div>
              {site.dispositivo ? (
                <button
                  className="button button--danger"
                  disabled={mutation !== null}
                  onClick={() => onRevoke(site)}
                >
                  {isRevoking ? 'Revocando…' : 'Revocar tablet'}
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
