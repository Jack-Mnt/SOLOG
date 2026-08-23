import { CatalogPanel } from '../features/solog/admin/catalog/CatalogPanel'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminCatalogPage() {
  const { admin, operationalBootstrap, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  const currentCatalogVersion = operationalBootstrap.stock?.disponible
    ? operationalBootstrap.stock.version_catalogo
    : null

  return (
    <CatalogPanel
      currentCatalogVersion={currentCatalogVersion}
      refreshOperationalState={refreshOperationalState}
      role={admin.bootstrap.usuario.rol}
    />
  )
}
