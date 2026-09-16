import { RotateCcw } from 'lucide-react'
import { AdminNotice } from '../admin.primitives'
import { useCatalogStore } from './admin.catalogo.context'
export function CatalogMutationNotice({ onRetry }: { onRetry: () => void }) {
  const intent = useCatalogStore().intent()
  if (!intent) return null

  return <AdminNotice
    tone={intent.error ? 'error' : 'info'}
    action={!intent.pending ? <button
      type="button"
      className="button button--secondary"
      onClick={onRetry}
    ><RotateCcw size={16} aria-hidden="true" />Reintentar misma operación</button> : undefined}
  >
    {intent.error ?? 'Operación en curso…'}
  </AdminNotice>
}
