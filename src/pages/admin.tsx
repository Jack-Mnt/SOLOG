import { AdminOverview } from '../features/solog/admin/AdminOverview'
import { AdminReports } from '../features/solog/admin/AdminReports'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminDashboardPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null

  return (
    <>
      <AdminOverview bootstrap={admin.bootstrap} />
      <AdminReports
        refreshOperationalState={refreshOperationalState}
        reportType="summary"
        sites={admin.bootstrap.sedes}
      />
    </>
  )
}
