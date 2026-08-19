import { formatAdminDate } from './format'
import type { AdminMutation } from './useAdminSolog'
import type { SologPendingDevice } from '../types'

export function PendingDevices({
  devices,
  mutation,
  onAuthorize,
  onReject,
}: {
  devices: SologPendingDevice[]
  mutation: AdminMutation | null
  onAuthorize: (device: SologPendingDevice) => void
  onReject: (device: SologPendingDevice) => void
}) {
  return (
    <section className="content-section" aria-labelledby="pending-title">
      <div className="section-heading">
        <div>
          <h2 id="pending-title">Solicitudes pendientes</h2>
          <p>Autoriza una nueva tablet o rechaza una solicitud obsoleta.</p>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="empty-state">No hay solicitudes pendientes.</div>
      ) : (
        <div className="admin-pending-list">
          {devices.map((device) => {
            const isAuthorizing =
              mutation?.action === 'authorize' &&
              mutation.deviceId === device.id
            const isRejecting =
              mutation?.action === 'reject' && mutation.deviceId === device.id

            return (
              <article className="admin-pending-card" key={device.id}>
                <div>
                  <h3>{device.sede}</h3>
                  <dl className="admin-device-details">
                    <div>
                      <dt>Solicitante</dt>
                      <dd>{device.solicitante}</dd>
                    </div>
                    <div>
                      <dt>Solicitud</dt>
                      <dd>{formatAdminDate(device.solicitado_at)}</dd>
                    </div>
                    <div>
                      <dt>Último acceso</dt>
                      <dd>{formatAdminDate(device.ultimo_acceso_at)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="admin-pending-actions">
                  <button
                    className="button"
                    disabled={mutation !== null}
                    onClick={() => onAuthorize(device)}
                  >
                    {isAuthorizing ? 'Autorizando…' : 'Autorizar tablet'}
                  </button>
                  <button
                    className="button button--secondary"
                    disabled={mutation !== null}
                    onClick={() => onReject(device)}
                  >
                    {isRejecting ? 'Rechazando…' : 'Rechazar'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
