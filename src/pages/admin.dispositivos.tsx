import { AuthorizedDevices } from '../features/solog/admin/dispositivos/admin.dispositivos.autorizados'
import { PendingDevices } from '../features/solog/admin/dispositivos/admin.dispositivos.pendientes'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'
import { ShieldCheck } from 'lucide-react'
import type { SologAdminSite, SologPendingDevice } from '../features/solog/types'

export function AdminDevicesPage() {
  const { admin } = useAdminLayout()
  if (!admin.bootstrap) return null

  const handleAuthorize = (device: SologPendingDevice) => {
    const site = admin.bootstrap?.sedes.find((candidate) => candidate.id === device.sede_id)
    if (site?.dispositivo && !window.confirm(`${site.nombre} ya tiene una tablet autorizada.\n\nAl autorizar este nuevo dispositivo, la tablet anterior será revocada.\n\n¿Continuar?`)) return
    void admin.authorize(device.id)
  }

  const handleRevoke = (site: SologAdminSite) => {
    if (!site.dispositivo) return
    if (!window.confirm(`¿Revocar la tablet autorizada de ${site.nombre}?\n\nLa sede no podrá iniciar nuevos conteos desde ese dispositivo.`)) return
    void admin.revoke(site.dispositivo.id)
  }

  const handleReject = (device: SologPendingDevice) => {
    if (!window.confirm(`¿Rechazar la solicitud de tablet para ${device.sede}?`)) return
    void admin.reject(device.id)
  }

  return (
    <div className="devices-workspace">
      <AuthorizedDevices mutation={admin.mutation} onRevoke={handleRevoke} sites={admin.bootstrap.sedes} />
      <PendingDevices devices={admin.bootstrap.dispositivos_pendientes} mutation={admin.mutation} onAuthorize={handleAuthorize} onReject={handleReject} />
      <aside className="device-policy-note" aria-label="Política de tablets por sede">
        <ShieldCheck aria-hidden="true" size={19} />
        <div>
          <strong>Una tablet por sede</strong>
          <p>Cada sede solo puede tener una tablet autorizada. Si se autoriza una nueva tablet, la anterior será revocada automáticamente.</p>
        </div>
      </aside>
    </div>
  )
}
