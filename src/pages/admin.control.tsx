import { ControlPanel } from '../features/solog/admin/control/admin.control.panel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminControlPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <ControlPanel refreshOperationalState={refreshOperationalState} />
}
