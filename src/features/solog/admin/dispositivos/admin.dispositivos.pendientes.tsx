import { Check, TabletSmartphone, X } from 'lucide-react'
import type { AdminMutation } from './useAdminSolog'
import type { SologPendingDevice } from '../types'
import { formatDeviceDate } from './device-format'

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
    <section className="content-section admin-devices-section" aria-labelledby="pending-title">
      <div className="section-heading">
        <div>
          <div className="section-title-row"><span className="section-icon"><TabletSmartphone size={19} /></span><h2 id="pending-title">Solicitudes pendientes</h2></div>
          <p>Autoriza una nueva tablet o rechaza una solicitud obsoleta.</p>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="empty-state">No hay solicitudes pendientes.</div>
      ) : (
        <div className="device-request-list">
          {devices.map((device) => {
            const isAuthorizing =
              mutation?.action === 'authorize' &&
              mutation.deviceId === device.id
            const isRejecting =
              mutation?.action === 'reject' && mutation.deviceId === device.id

            return (
              <article className="device-request-card" key={device.id}>
                <div className="device-card-identity">
                  <span className="device-card-icon" aria-hidden="true"><TabletSmartphone size={19} /></span>
                  <div><h3>{device.sede}</h3><span className="device-status-badge device-status-badge--pending">Solicitud pendiente</span></div>
                </div>
                <dl className="device-request-facts">
                    <div>
                      <dt>Solicitante</dt>
                      <dd>{device.solicitante}</dd>
                    </div>
                    <div>
                      <dt>Solicitud</dt>
                      <dd>{formatDeviceDate(device.solicitado_at)}</dd>
                    </div>
                    <div>
                      <dt>Último acceso</dt>
                      <dd>{formatDeviceDate(device.ultimo_acceso_at)}</dd>
                    </div>
                </dl>
                <div className="device-request-actions">
                  <button
                    className="button"
                    disabled={mutation !== null}
                    onClick={() => onAuthorize(device)}
                    type="button"
                  >
                    <Check size={17} /> {isAuthorizing ? 'Autorizando…' : 'Autorizar tablet'}
                  </button>
                  <button
                    className="button button--secondary"
                    disabled={mutation !== null}
                    onClick={() => onReject(device)}
                    type="button"
                  >
                    <X size={17} /> {isRejecting ? 'Rechazando…' : 'Rechazar'}
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
