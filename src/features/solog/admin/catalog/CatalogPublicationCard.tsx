import { BookPlus, LoaderCircle } from 'lucide-react'

export function CatalogPublicationCard({
  approvedCount,
  isAdmin,
  preparing,
  notice,
  onDismissNotice,
  onPrepare,
}: {
  approvedCount: number
  isAdmin: boolean
  preparing: boolean
  notice: string | null
  onDismissNotice: () => void
  onPrepare: () => void
}) {
  return (
    <section className="catalog-publication-card" aria-labelledby="catalog-publication-title">
      <div>
        <span className="eyebrow">Aprobados pendientes de actualización</span>
        <h3 id="catalog-publication-title">{approvedCount} {approvedCount === 1 ? 'cambio' : 'cambios'}</h3>
        <p>Solo los cambios aprobados participan en la próxima versión oficial.</p>
      </div>
      <div className="catalog-publication-card__action">
        {isAdmin ? (
          <button
            className="button"
            disabled={approvedCount === 0 || preparing}
            onClick={onPrepare}
            type="button"
          >
            {preparing ? <LoaderCircle className="icon-spin" size={18} /> : <BookPlus size={18} />}
            {preparing ? 'Preparando nueva versión…' : 'Crear nuevo catálogo'}
          </button>
        ) : <p className="helper-text">Solo un administrador puede publicar una nueva versión del catálogo.</p>}
      </div>
      {notice ? <div className="notice notice--success catalog-publication-card__notice" role="status"><strong>{notice}</strong><button className="text-button" onClick={onDismissNotice} type="button">Cerrar</button></div> : null}
    </section>
  )
}
