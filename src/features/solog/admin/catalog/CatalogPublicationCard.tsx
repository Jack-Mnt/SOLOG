import { BookPlus, LoaderCircle } from 'lucide-react'

export function CatalogPublicationCard({
  approvedCount,
  currentVersion,
  nextVersion,
  isAdmin,
  preparing,
  notice,
  onDismissNotice,
  onPrepare,
}: {
  approvedCount: number
  currentVersion: number | null
  nextVersion: number | null
  isAdmin: boolean
  preparing: boolean
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
          {currentVersion === null ? 'Versión actual no disponible' : `Actual V${currentVersion}`}
        </p>
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
