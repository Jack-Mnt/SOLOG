import { Check, EyeOff } from 'lucide-react'
import {
  getSologCatalogChangeSectionLabel,
  getSologCatalogChangeStatusLabel,
  getSologCatalogChangeTypeLabel,
  getSologCatalogDecisionLabel,
} from '../../labels'
import type { SologCatalogChangeRow } from '../../types'
import { AdminDialog } from '../AdminDialog'
import { formatAdminCurrency, formatAdminDate } from '../format'
import {
  formatCatalogChangeData,
  getCatalogChangeSummary,
} from '../catalog-domain'

function nullableCurrency(value: number | null): string {
  return value === null ? 'No disponible' : formatAdminCurrency(value)
}

export function CatalogChangeDetail({
  change,
  acting,
  onApprove,
  onClose,
  onIgnore,
}: {
  change: SologCatalogChangeRow
  acting: boolean
  onApprove: () => void
  onClose: () => void
  onIgnore: () => void
}) {
  const isPending = change.estado === 'pendiente'

  return (
    <AdminDialog
      footer={(
        <>
          <button className="button button--secondary" disabled={acting} onClick={onClose} type="button">Cerrar</button>
          {isPending ? <button className="button button--secondary" disabled={acting} onClick={onIgnore} type="button"><EyeOff size={17} /> {getSologCatalogDecisionLabel('ignore')}</button> : null}
          {isPending ? <button className="button" disabled={acting} onClick={onApprove} type="button"><Check size={17} /> {getSologCatalogDecisionLabel('approve')}</button> : null}
        </>
      )}
      onClose={onClose}
      title={getSologCatalogChangeTypeLabel(change.tipo)}
      wide
    >
      <div className="admin-detail-heading">
        <div className="admin-badge-row">
          <span className={`admin-state-badge admin-state-badge--${change.seccion}`}>{getSologCatalogChangeSectionLabel(change.seccion)}</span>
          <span className={`admin-state-badge admin-state-badge--${change.estado}`}>{getSologCatalogChangeStatusLabel(change.estado)}</span>
        </div>
        <strong>{change.producto ?? change.catalogo_actual.producto ?? 'Producto no identificado'}</strong>
        <span>C. interno: {change.c_interno}</span>
      </div>

      <section className="admin-detail-section">
        <h3>Catálogo actual</h3>
        <dl className="admin-detail-grid">
          <div><dt>Nombre</dt><dd>{change.catalogo_actual.producto ?? 'No disponible'}</dd></div>
          <div><dt>Marca</dt><dd>{change.catalogo_actual.marca ?? 'No disponible'}</dd></div>
          <div><dt>Categoría</dt><dd>{change.catalogo_actual.categoria ?? 'No disponible'}</dd></div>
          <div><dt>Precio</dt><dd>{nullableCurrency(change.catalogo_actual.precio)}</dd></div>
          <div><dt>Código</dt><dd>{change.catalogo_actual.c_barras ?? 'Sin código'}</dd></div>
          <div><dt>Estado</dt><dd>{change.catalogo_actual.estado ?? 'No disponible'}</dd></div>
          <div><dt>Grupo</dt><dd>{change.catalogo_actual.grupo ?? 'No disponible'}</dd></div>
        </dl>
      </section>

      <section className="admin-detail-section">
        <h3>Cambio propuesto</h3>
        <p className="admin-change-summary">{getCatalogChangeSummary(change)}</p>
        <pre className="admin-json-data">{formatCatalogChangeData(change.datos)}</pre>
      </section>

      <section className="admin-detail-section">
        <h3>Detección y decisión</h3>
        <dl className="admin-detail-grid">
          <div><dt>Sedes</dt><dd>{change.sedes.length ? change.sedes.map((site) => site.nombre).join(', ') : 'Sin sedes'}</dd></div>
          <div><dt>Ocurrencias</dt><dd>{change.occurrence_count}</dd></div>
          <div><dt>Primera detección</dt><dd>{formatAdminDate(change.first_seen_at)}</dd></div>
          <div><dt>Última detección</dt><dd>{formatAdminDate(change.last_seen_at)}</dd></div>
          {change.aprobado_at ? <div><dt>Aprobado</dt><dd>{formatAdminDate(change.aprobado_at)}</dd></div> : null}
          {change.ignorado_at ? <div><dt>Ignorado</dt><dd>{formatAdminDate(change.ignorado_at)}</dd></div> : null}
          {change.incorporado_at ? <div><dt>Fecha de incorporación</dt><dd>{formatAdminDate(change.incorporado_at)}</dd></div> : null}
          {change.version_aplicada !== null ? <div><dt>Versión aplicada</dt><dd>Incorporado en V{change.version_aplicada}</dd></div> : null}
        </dl>
      </section>
    </AdminDialog>
  )
}
