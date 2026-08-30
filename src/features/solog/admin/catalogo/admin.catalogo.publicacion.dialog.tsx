import { AlertTriangle, ArrowRight, LoaderCircle, UploadCloud } from 'lucide-react'
import { getSologCatalogChangeTypeLabel } from '../../labels'
import type { CatalogPublicationPreview, SologCatalogChangeType, SologCatalogConflict } from '../../types'
import { AdminDialog } from '../admin.dialog'
import type { CatalogPublicationStatus } from './admin.catalogo.publicacion.hook'

const SUMMARY_ORDER: SologCatalogChangeType[] = [
  'agregar_producto',
  'eliminar_producto',
  'nombre',
  'precio',
  'codigo',
]

export function CatalogPublicationDialog({
  status,
  preview,
  error,
  validationErrors,
  conflicts,
  onClose,
  onPrepare,
  onPublish,
  onViewRelated,
}: {
  status: Exclude<CatalogPublicationStatus, 'idle'>
  preview: Extract<CatalogPublicationPreview, { ok: true }> | null
  error: string | null
  validationErrors: string[]
  conflicts: SologCatalogConflict[]
  onClose: () => void
  onPrepare: () => void
  onPublish: () => void
  onViewRelated: (changeIds: string[]) => void
}) {
  const busy = status === 'preparing' || status === 'publishing'

  if (status === 'preparing') {
    return (
      <AdminDialog closeDisabled onClose={onClose} title="Nueva versión del catálogo">
        <div className="catalog-publication-progress" role="status">
          <LoaderCircle className="icon-spin" size={30} />
          <strong>Preparando nueva versión…</strong>
          <p>El backend está validando los cambios actualmente aprobados.</p>
        </div>
      </AdminDialog>
    )
  }

  if (!preview || !preview.cambios) {
    return (
      <AdminDialog
        footer={status === 'error' ? <button className="button" onClick={onPrepare} type="button">Preparar nuevamente</button> : undefined}
        onClose={onClose}
        title="No se puede crear una nueva versión"
      >
        <div className="catalog-publication-error" role="alert">
          <AlertTriangle size={24} />
          {error ? <p>{error}</p> : null}
          {validationErrors.length > 0 ? <ul>{validationErrors.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : null}
          {conflicts.length > 0 ? <div className="catalog-conflicts"><strong>{conflicts.length} conflicto{conflicts.length === 1 ? '' : 's'} deben resolverse</strong>{conflicts.map((conflict, index) => <article key={`${conflict.codigo}-${conflict.entidad_id ?? index}`}><div><span>{conflict.entidad_tipo ? `${conflict.entidad_tipo} · ${conflict.entidad_id ?? 'sin identificador'}` : 'Validación global'}</span><strong>{conflict.mensaje}</strong><code>{conflict.codigo}</code></div>{conflict.change_ids.length ? <button className="button button--secondary" onClick={() => onViewRelated(conflict.change_ids)} type="button">Ver cambios relacionados</button> : null}</article>)}</div> : null}
        </div>
      </AdminDialog>
    )
  }

  return (
    <AdminDialog
      closeDisabled={busy}
      description="Revisa el resultado calculado por el backend antes de publicar."
      footer={(
        <>
          <button className="button button--secondary" disabled={busy} onClick={onClose} type="button">Cancelar</button>
          <button className="button" disabled={busy} onClick={onPublish} type="button">
            {status === 'publishing' ? <LoaderCircle className="icon-spin" size={18} /> : <UploadCloud size={18} />}
            {status === 'publishing' ? 'Publicando nueva versión…' : `Publicar V${preview.version_nueva}`}
          </button>
        </>
      )}
      onClose={onClose}
      title="Nueva versión del catálogo"
      wide
    >
      <div className="catalog-version-flow" aria-label={`Versión V${preview.version_actual} a V${preview.version_nueva}`}>
        <strong>V{preview.version_actual}</strong><ArrowRight size={24} /><strong>V{preview.version_nueva}</strong>
      </div>
      <div className="catalog-publication-metrics">
        <article><span>SKU actuales</span><strong>{preview.sku_actuales}</strong></article>
        <article><span>SKU resultantes</span><strong>{preview.sku_nuevos}</strong></article>
        <article><span>Cambios incluidos</span><strong>{preview.cambios_total}</strong></article>
      </div>
      <section className="admin-detail-section">
        <h3>Desglose de cambios</h3>
        <dl className="catalog-publication-summary">
          {SUMMARY_ORDER.map((type) => (
            <div key={type}><dt>{getSologCatalogChangeTypeLabel(type)}</dt><dd>{preview.cambios[type] ?? 0}</dd></div>
          ))}
        </dl>
      </section>
      <div className="notice">
        <strong>Esta acción creará una nueva versión oficial del catálogo.</strong>
        <p>Incorporará todos los cambios actualmente aprobados. Después de publicarla, ConeXion detectará la nueva versión y la descargará cuando corresponda.</p>
        <p>Los cambios pasarán a estado Incorporado cuando la publicación se complete correctamente.</p>
      </div>
    </AdminDialog>
  )
}
