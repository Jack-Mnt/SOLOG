import { GroupsPanel } from '../features/solog/admin/grupos/admin.grupos.panel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminGroupsPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <GroupsPanel refreshOperationalState={refreshOperationalState} />
}
