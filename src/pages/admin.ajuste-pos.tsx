import { AdminReports } from '../features/solog/admin/AdminReports'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminPosAdjustmentsPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return <AdminReports refreshOperationalState={refreshOperationalState} reportType="pos_adjustments" sites={admin.bootstrap.sedes} />
}
