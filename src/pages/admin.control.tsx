import { ControlPanel } from '../features/solog/admin/control/ControlPanel'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminControlPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return <ControlPanel refreshOperationalState={refreshOperationalState} sites={admin.bootstrap.sedes} />
}
