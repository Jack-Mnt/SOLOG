import { SologDetailsPanel } from '../features/solog/detalles/detalles.panel'
import type { SologOperationalBootstrap } from '../features/solog/types'

export function DetailsPage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  return <SologDetailsPanel bootstrap={bootstrap} onLogout={onLogout} />
}
