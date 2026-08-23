import { GroupsPanel } from '../features/solog/admin/groups/GroupsPanel'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminGroupsPage() {
  const { refreshOperationalState } = useAdminLayout()
  return <GroupsPanel refreshOperationalState={refreshOperationalState} />
}
