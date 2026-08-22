import { AdminReports } from '../features/solog/admin/AdminReports'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminHistoryPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return <AdminReports refreshOperationalState={refreshOperationalState} reportType="history" sites={admin.bootstrap.sedes} />
}
