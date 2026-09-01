import { PageShell } from '../components/page-shell'
import type { SologOperationalBootstrap } from '../features/solog/types'

export function DevicePendingPage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  return (
    <PageShell
      description="Un administrador debe autorizar esta tablet antes de contar."
      eyebrow={bootstrap.sede.nombre}
      onLogout={onLogout}
      title="Tablet pendiente"
    >
      <div className="device-pending-panel" role="status">
        <span className="device-pending-panel__icon" aria-hidden="true">
          <Tablet size={36} />
        </span>
        <div>
          <span className="status-badge"><ShieldCheck size={15} /> Estado: {bootstrap.dispositivo.estado}</span>
          <h2>Solicitud registrada</h2>
          <p>
            Puedes dejar esta pantalla abierta y volver a ingresar después de la
            autorización.
          </p>
        </div>
      </div>
    </PageShell>
  )
}
import { Tablet, ShieldCheck } from 'lucide-react'
