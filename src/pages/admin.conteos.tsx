import { AdminReports } from '../features/solog/admin/AdminReports'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminCountsPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return <AdminReports refreshOperationalState={refreshOperationalState} reportType="counts" sites={admin.bootstrap.sedes} />
}
