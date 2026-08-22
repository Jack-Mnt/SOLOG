import { CheckCheck, Clock3, PackageX } from 'lucide-react'
import {
  getSologAdminIncidentDecisionLabel,
  getSologAdminIncidentStatusLabel,
  getSologAdminIncidentTypeLabel,
} from '../../labels'
import type {
  SologAdminIncidentDecision,
  SologAdminIncidentRow,
} from '../../types'
import { AdminDialog } from '../AdminDialog'
import {
  canDeleteMissingProduct,
  canIgnoreMissingProduct,
  canReviewIncident,
} from '../catalog-domain'
import { formatAdminDate } from '../format'
import {
  abbreviateIdentifier,
  formatIncidentData,
} from './incident-domain'

export function IncidentDetail({
  incident,
  acting,
  onClose,
  onDecision,
}: {
  incident: SologAdminIncidentRow
  acting: boolean
  onClose: () => void
  onDecision: (decision: SologAdminIncidentDecision) => void
}) {
  const isPending = incident.estado === 'pendiente'

  return (
    <AdminDialog
      footer={(
        <>
          <button className="button button--secondary" disabled={acting} onClick={onClose} type="button">Cerrar</button>
          {isPending && canReviewIncident(incident) ? (
            <button className="button" disabled={acting} onClick={() => onDecision('reviewed')} type="button"><CheckCheck size={17} /> {getSologAdminIncidentDecisionLabel('reviewed')}</button>
          ) : null}
          {isPending && canIgnoreMissingProduct(incident) ? (
            <button className="button button--secondary" disabled={acting} onClick={() => onDecision('ignore_15d')} type="button"><Clock3 size={17} /> {getSologAdminIncidentDecisionLabel('ignore_15d')}</button>
          ) : null}
          {isPending && canDeleteMissingProduct(incident) ? (
            <button className="button button--danger" disabled={acting} onClick={() => onDecision('deleted')} type="button"><PackageX size={17} /> {getSologAdminIncidentDecisionLabel('deleted')}</button>
          ) : null}
        </>
      )}
      onClose={onClose}
      title={getSologAdminIncidentTypeLabel(incident.tipo)}
      wide
    >
      <div className="admin-detail-heading">
        <span className={`admin-state-badge admin-state-badge--${incident.estado}`}>{getSologAdminIncidentStatusLabel(incident.estado)}</span>
        <strong>{incident.producto ?? 'Producto no identificado'}</strong>
        <span>C. interno: {incident.c_interno ?? incident.c_interno_original ?? 'No disponible'}</span>
      </div>

      <dl className="admin-detail-grid">
        <div><dt>Sede</dt><dd>{incident.sede ?? 'Sin sede'}</dd></div>
        <div><dt>C. interno original</dt><dd>{incident.c_interno_original ?? 'No aplica'}</dd></div>
        <div><dt>Stock actual</dt><dd>{incident.stock_actual ?? 'No disponible'}</dd></div>
        <div><dt>Categoría</dt><dd>{incident.categoria ?? 'No disponible'}</dd></div>
        <div><dt>Grupo</dt><dd>{incident.grupo ?? 'No disponible'}</dd></div>
        <div><dt>Ocurrencias</dt><dd>{incident.occurrence_count}</dd></div>
        <div><dt>Primera detección</dt><dd>{formatAdminDate(incident.first_seen_at)}</dd></div>
        <div><dt>Última detección</dt><dd>{formatAdminDate(incident.last_seen_at)}</dd></div>
        <div title={incident.primer_snapshot_id ?? undefined}><dt>Primer snapshot</dt><dd><code>{abbreviateIdentifier(incident.primer_snapshot_id)}</code></dd></div>
        <div title={incident.ultimo_snapshot_id ?? undefined}><dt>Último snapshot</dt><dd><code>{abbreviateIdentifier(incident.ultimo_snapshot_id)}</code></dd></div>
      </dl>

      <section className="admin-technical-block">
        <h3>Datos detectados</h3>
        <pre>{formatIncidentData(incident.datos)}</pre>
      </section>
    </AdminDialog>
  )
}
