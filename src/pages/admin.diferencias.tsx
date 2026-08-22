import { AdminReports } from '../features/solog/admin/AdminReports'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminDifferencesPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return <AdminReports refreshOperationalState={refreshOperationalState} reportType="differences" sites={admin.bootstrap.sedes} />
}
