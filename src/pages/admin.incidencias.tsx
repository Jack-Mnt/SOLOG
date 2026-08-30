import { IncidentsPanel } from '../features/solog/admin/incidencias/admin.incidencias.panel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminIncidentsPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <IncidentsPanel refreshOperationalState={refreshOperationalState} />
}
