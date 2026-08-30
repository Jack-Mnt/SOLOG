import { IncidentsPanel } from '../features/solog/admin/incidents/IncidentsPanel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminIncidentsPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <IncidentsPanel refreshOperationalState={refreshOperationalState} />
}
