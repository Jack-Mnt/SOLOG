import { AuthorizedDevices } from '../features/solog/admin/AuthorizedDevices'
import { PendingDevices } from '../features/solog/admin/PendingDevices'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'
import type { SologAdminSite, SologPendingDevice } from '../features/solog/types'

export function AdminDevicesPage() {
  const { admin } = useAdminLayout()
  if (!admin.bootstrap) return null

  const handleAuthorize = (device: SologPendingDevice) => {
    const site = admin.bootstrap?.sedes.find((candidate) => candidate.id === device.sede_id)
    if (site?.tablet && !window.confirm(`${site.nombre} ya tiene una tablet autorizada.\n\nAl autorizar este nuevo dispositivo, la tablet anterior será revocada.\n\n¿Continuar?`)) return
    void admin.authorize(device.id)
  }

  const handleRevoke = (site: SologAdminSite) => {
    if (!site.tablet) return
    if (!window.confirm(`¿Revocar la tablet autorizada de ${site.nombre}?\n\nLa sede no podrá iniciar nuevos conteos desde ese dispositivo.`)) return
    void admin.revoke(site.tablet.id)
  }

  const handleReject = (device: SologPendingDevice) => {
    if (!window.confirm(`¿Rechazar la solicitud de tablet para ${device.sede}?`)) return
    void admin.reject(device.id)
  }

  return (
    <>
      <AuthorizedDevices mutation={admin.mutation} onRevoke={handleRevoke} sites={admin.bootstrap.sedes} />
      <PendingDevices devices={admin.bootstrap.dispositivos_pendientes} mutation={admin.mutation} onAuthorize={handleAuthorize} onReject={handleReject} />
    </>
  )
}
