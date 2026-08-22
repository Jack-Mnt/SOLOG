import { CatalogPanel } from '../features/solog/admin/catalog/CatalogPanel'
import { useAdminLayout } from '../features/solog/admin/AdminLayoutContext'

export function AdminCatalogPage() {
  const { admin, operationalBootstrap, refreshOperationalState } = useAdminLayout()
  if (!admin.bootstrap) return null
  return (
    <CatalogPanel
      currentCatalogVersion={operationalBootstrap.stock.disponible ? operationalBootstrap.stock.version_catalogo : null}
      refreshOperationalState={refreshOperationalState}
      role={admin.bootstrap.usuario.rol}
    />
  )
}
