import { CatalogPanel } from '../features/solog/admin/catalog/CatalogPanel'
import { useAdminLayout } from '../features/solog/admin/admin.layout.context'

export function AdminCatalogPage() {
  const { admin, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null

  return (
    <CatalogPanel
      refreshOperationalState={refreshOperationalState}
      role={admin.bootstrap.usuario.rol}
    />
  )
}
