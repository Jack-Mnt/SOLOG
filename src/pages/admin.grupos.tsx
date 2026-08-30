import { GroupsPanel } from '../features/solog/admin/groups/GroupsPanel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminGroupsPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <GroupsPanel refreshOperationalState={refreshOperationalState} />
}
