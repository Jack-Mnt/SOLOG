import { IncidentsPanel } from '../features/solog/admin/incidents/IncidentsPanel'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminIncidentsPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return <IncidentsPanel refreshOperationalState={refreshOperationalState} sites={admin.bootstrap.sedes} />
}
