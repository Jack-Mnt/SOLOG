import { ControlPanel } from '../features/solog/admin/control/ControlPanel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminControlPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <ControlPanel refreshOperationalState={refreshOperationalState} />
}
