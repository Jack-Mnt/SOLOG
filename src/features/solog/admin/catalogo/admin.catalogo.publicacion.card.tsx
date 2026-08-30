import { BookPlus, LoaderCircle } from 'lucide-react'
import { formatCatalogDate } from './admin.catalogo.format'

export function CatalogPublicationCard({
  approvedCount,
  currentVersion,
  nextVersion,
  isAdmin,
  preparing,
  publishedAt,
  statusError,
  statusLoading,
  notice,
  onDismissNotice,
  onPrepare,
}: {
  approvedCount: number
  currentVersion: number | null
  nextVersion: number | null
  isAdmin: boolean
  preparing: boolean
  publishedAt: string | null
  statusError: string | null
  statusLoading: boolean
  notice: string | null
  onDismissNotice: () => void
  onPrepare: () => void
}) {
  return (
    <section className="catalog-publication-strip" aria-labelledby="catalog-publication-title">
      <div className="catalog-publication-strip__content">
        <span className="eyebrow" id="catalog-publication-title">Próxima versión</span>
        <p>
          <strong>{approvedCount} {approvedCount === 1 ? 'cambio aprobado' : 'cambios aprobados'}{approvedCount > 0 ? ' listos' : ''}</strong>
          <span aria-hidden="true"> · </span>
          {statusLoading && currentVersion === null
            ? 'Consultando catálogo actual…'
            : currentVersion === null
              ? 'Catálogo actual no disponible'
              : `Catálogo actual V${currentVersion}`}
          {currentVersion !== null && publishedAt ? ` · Publicado ${formatCatalogDate(publishedAt)}` : null}
        </p>
        {statusError ? <small className="catalog-publication-strip__error" role="alert">{statusError}</small> : null}
      </div>
      <div className="catalog-publication-strip__action">
        {isAdmin ? (
          <button
            className="button"
            disabled={approvedCount === 0 || preparing}
            onClick={onPrepare}
            type="button"
          >
            {preparing ? <LoaderCircle className="icon-spin" size={18} /> : <BookPlus size={18} />}
            {preparing ? 'Preparando nueva versión…' : nextVersion === null ? 'Crear catálogo' : `Crear V${nextVersion}`}
          </button>
        ) : <p className="helper-text">Solo un administrador puede publicar una nueva versión del catálogo.</p>}
      </div>
      {notice ? <div className="notice notice--success catalog-publication-strip__notice" role="status"><strong>{notice}</strong><button className="text-button" onClick={onDismissNotice} type="button">Cerrar</button></div> : null}
    </section>
  )
}
