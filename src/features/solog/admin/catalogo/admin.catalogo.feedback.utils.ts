import type { CatalogStore } from './admin.catalogo.store'

export function catalogMutationError(
  store: Pick<CatalogStore, 'intent'>,
  reason: unknown,
  fallback: string,
) {
  if (store.intent()) return ''
  return reason instanceof Error ? reason.message : fallback
}
