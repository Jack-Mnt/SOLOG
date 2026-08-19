import { PageShell } from '../components/PageShell'
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
      <div className="notice" role="status">
        <strong>Estado: {bootstrap.dispositivo.estado}</strong>
        <p>
          Puedes dejar esta pantalla abierta y volver a ingresar después de la
          autorización.
        </p>
      </div>
    </PageShell>
  )
}
