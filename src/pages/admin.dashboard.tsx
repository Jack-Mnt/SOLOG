import {
  AdminDashboardLoading,
  AdminOverview,
} from '../features/solog/admin/AdminOverview'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'
import { useSologDashboard } from '../features/solog/admin/useSologDashboard'

export function AdminDashboardPage() {
  const { refreshOperationalState } = useAdminLayout()
  const dashboard = useSologDashboard(refreshOperationalState)

  if (dashboard.status === 'loading' && !dashboard.data) {
    return <AdminDashboardLoading />
  }

  if (dashboard.status === 'error' && !dashboard.data) {
    return (
      <div className="notice notice--error admin-dashboard-error" role="alert">
        <strong>No se pudo cargar el Dashboard</strong>
        <p>{dashboard.error}</p>
        <button className="button button--secondary" onClick={() => void dashboard.retry()} type="button">Reintentar</button>
      </div>
    )
  }

  return dashboard.data ? (
    <AdminOverview
      dashboard={dashboard.data}
      refreshOperationalState={refreshOperationalState}
    />
  ) : null
}
