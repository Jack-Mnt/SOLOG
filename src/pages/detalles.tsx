import '../operational.css'
import '../features/solog/detalles/detalles.css'
import { SologDetailsPanel } from '../features/solog/detalles/detalles.panel'

export function DetailsPage({ userId, onLogout }: { userId: string; onLogout: () => void }) {
  return <SologDetailsPanel key={userId} userId={userId} onLogout={onLogout} />
}
