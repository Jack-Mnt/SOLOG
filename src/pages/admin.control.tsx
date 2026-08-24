import { ControlPanel } from '../features/solog/admin/control/ControlPanel'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminControlPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <ControlPanel refreshOperationalState={refreshOperationalState} />
}
