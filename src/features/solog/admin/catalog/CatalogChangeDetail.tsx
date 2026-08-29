import { Check, EyeOff, Undo2 } from 'lucide-react'
import {
  getSologCatalogChangeSectionLabel,
  getSologCatalogChangeStatusLabel,
  getSologCatalogChangeTypeLabel,
  getSologCatalogDecisionLabel,
} from '../../labels'
import type { SologCatalogChangeRow } from '../../types'
import { AdminDialog } from '../AdminDialog'
import { formatAdminCurrency } from '../format'
import {
  formatCatalogChangeData,
  getCatalogDetectedBarcode,
  getCatalogDetectedProduct,
  getCatalogProposedPrice,
} from '../catalog-domain'
import {
  formatCatalogDate,
  getCatalogChangeFieldLabel,
  getCatalogChangeLabel,
} from './catalog-format'

function nullableCurrency(value: number | null): string {
  return value === null ? 'No disponible' : formatAdminCurrency(value)
}

function CatalogDetection({ change }: { change: SologCatalogChangeRow }) {
  return (
    <section className="catalog-detail-section">
      <h3>Detección</h3>
      <div className="catalog-detection-line">
        <strong>{change.occurrence_count}× ocurrencias</strong>
        <span>{change.sedes.length ? change.sedes.map((site) => site.nombre).join(' · ') : 'Sin sedes'}</span>
        <span>Primera: {formatCatalogDate(change.first_seen_at)}</span>
        <span>Última: {formatCatalogDate(change.last_seen_at)}</span>
        {change.aprobado_at ? <span>Aprobado: {formatCatalogDate(change.aprobado_at)}</span> : null}
        {change.ignorado_at ? <span>Ignorado: {formatCatalogDate(change.ignorado_at)}</span> : null}
        {change.incorporado_at ? <span>Incorporado: {formatCatalogDate(change.incorporado_at)}</span> : null}
        {change.version_aplicada !== null ? <strong>V{change.version_aplicada}</strong> : null}
      </div>
    </section>
  )
}

function CatalogTechnicalDetails({ change }: { change: SologCatalogChangeRow }) {
  return (
    <details className="catalog-technical-details">
      <summary>Detalles técnicos</summary>
      <dl>
        <div><dt>Fingerprint</dt><dd><code>{change.propuesta_fingerprint}</code></dd></div>
        {change.cambio_id ? <div><dt>ID de cambio</dt><dd><code>{change.cambio_id}</code></dd></div> : null}
      </dl>
      <pre>{formatCatalogChangeData(change.datos)}</pre>
    </details>
  )
}

export function CatalogChangeDetail({
  change,
  acting,
  onApprove,
  onClose,
  onIgnore,
  onWithdraw,
}: {
  change: SologCatalogChangeRow
  acting: boolean
  onApprove: () => void
  onClose: () => void
  onIgnore: () => void
  onWithdraw: () => void
}) {
  const isPending = change.estado === 'pendiente'
  const isApproved = change.estado === 'aprobado'
  const product = change.producto ?? change.catalogo_actual.producto ?? (typeof change.datos.nombre === 'string' ? change.datos.nombre : 'Entidad no identificada')
  const isNewProduct = change.tipo === 'agregar_producto'
  const isDeletion = change.tipo === 'eliminar_producto'
  const proposedPrice = getCatalogProposedPrice(change)

  return (
    <AdminDialog
      className="catalog-detail-dialog"
      footer={isPending ? (
        <>
          <button className="button button--secondary" disabled={acting} onClick={onIgnore} type="button"><EyeOff size={17} /> {getSologCatalogDecisionLabel('ignore')}</button>
          <button className="button" disabled={acting} onClick={onApprove} type="button"><Check size={17} /> {getSologCatalogDecisionLabel('approve')}</button>
        </>
      ) : isApproved ? <button className="button button--secondary" disabled={acting} onClick={onWithdraw} type="button"><Undo2 size={17} />Retirar aprobación</button> : undefined}
      onClose={onClose}
      title={getSologCatalogChangeTypeLabel(change.tipo)}
    >
      <div className="catalog-detail-hero">
        <div className="admin-badge-row">
          <span className={`admin-state-badge admin-state-badge--${change.estado}`}>{getSologCatalogChangeStatusLabel(change.estado)}</span>
          <span className={`admin-state-badge admin-state-badge--${change.seccion}`}>{getSologCatalogChangeSectionLabel(change.seccion)}</span>
          <span className="admin-state-badge">Producto</span>
        </div>
        <strong>{product}</strong>
        <span>{change.c_interno === null ? 'Código interno no disponible' : `C. interno ${change.c_interno}`}</span>
      </div>

      {isNewProduct ? (
        <>
          <p className="catalog-detail-message">Producto no presente en el catálogo actual.</p>
          <section className="catalog-detail-section">
            <h3>Nuevo producto</h3>
            <div className="catalog-new-product-summary">
              <strong>{getCatalogDetectedProduct(change) ?? product}</strong>
              <span>{proposedPrice === null ? 'Precio no disponible' : formatAdminCurrency(proposedPrice)}</span>
              <span>C. barras {getCatalogDetectedBarcode(change) ?? 'Sin código'}</span>
            </div>
            {isPending ? <p className="helper-text">Para aprobar debes completar marca, categoría y modalidad en el siguiente paso.</p> : null}
          </section>
        </>
      ) : isDeletion ? (
        <>
          <section className="catalog-detail-section">
            <h3>Producto actual</h3>
            <dl className="catalog-context-list">
              <div><dt>Categoría</dt><dd>{change.catalogo_actual.categoria ?? 'No disponible'}</dd></div>
              <div><dt>Grupo</dt><dd>{change.catalogo_actual.grupo ?? 'No disponible'}</dd></div>
              <div><dt>Precio</dt><dd>{nullableCurrency(change.catalogo_actual.precio)}</dd></div>
              <div><dt>Código de barras</dt><dd>{change.catalogo_actual.c_barras ?? 'Sin código'}</dd></div>
            </dl>
          </section>
          <p className="catalog-detail-message catalog-detail-message--warning">Este producto será retirado de la próxima versión del catálogo.</p>
        </>
      ) : (
        <>
          <section className="catalog-detail-section">
            <h3>Cambio propuesto</h3>
            <div className="catalog-comparison">
              <span>{getCatalogChangeFieldLabel(change)}</span>
              <strong title={getCatalogChangeLabel(change)}>{getCatalogChangeLabel(change)}</strong>
            </div>
          </section>
          <section className="catalog-detail-section">
            <h3>Contexto</h3>
            <dl className="catalog-context-list">
              <div><dt>Marca</dt><dd>{change.catalogo_actual.marca ?? 'No disponible'}</dd></div>
              <div><dt>Categoría</dt><dd>{change.catalogo_actual.categoria ?? 'No disponible'}</dd></div>
              <div><dt>Grupo</dt><dd>{change.catalogo_actual.grupo ?? 'No disponible'}</dd></div>
              <div><dt>Precio actual</dt><dd>{nullableCurrency(change.catalogo_actual.precio)}</dd></div>
            </dl>
          </section>
        </>
      )}

      <CatalogDetection change={change} />
      <CatalogTechnicalDetails change={change} />
    </AdminDialog>
  )
}
