import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import {
  getSologCatalogChangeStatusLabel,
  getSologCatalogChangeTypeLabel,
} from '../../labels'
import type {
  SologCatalogChangeRow,
  SologCatalogChangeStatus,
  SologCatalogNewProductConfig,
} from '../../types'
import { CatalogChangeDetail } from './CatalogChangeDetail'
import { CatalogFilters } from './CatalogFilters'
import { CatalogPublicationCard } from './CatalogPublicationCard'
import { CatalogPublicationDialog } from './CatalogPublicationDialog'
import { NewProductApprovalForm } from './NewProductApprovalForm'
import {
  getCatalogChangeSummary,
  requiresNewProductConfiguration,
} from '../catalog-domain'
import { formatAdminDate } from '../format'
import {
  CATALOG_CHANGES_PAGE_SIZE,
  useCatalogChanges,
} from './useCatalogChanges'
import { useCatalogPublication } from './useCatalogPublication'

const STATUS_TABS: SologCatalogChangeStatus[] = [
  'pendiente',
  'aprobado',
  'ignorado',
  'incorporado',
]

const COUNT_CARDS = [
  ['urgentes_pendientes', 'Cambios urgentes'],
  ['cambios_pendientes', 'Cambios pendientes'],
  ['aprobado', 'Aprobados'],
  ['ignorado', 'Ignorados'],
  ['incorporado', 'Incorporados'],
] as const

function CatalogTable({
  caption,
  rows,
  onSelect,
}: {
  caption: string
  rows: SologCatalogChangeRow[]
  onSelect: (row: SologCatalogChangeRow) => void
}) {
  if (rows.length === 0) return <div className="empty-state">No hay cambios en esta sección.</div>
  return (
    <div className="admin-report-table-wrap">
      <table className="admin-report-table admin-interactive-table">
        <caption>{caption}</caption>
        <thead><tr><th>Tipo</th><th>Producto / C. interno</th><th>Cambio</th><th>Sedes</th><th>Última detección</th><th>Ocurrencias</th><th>Estado</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.propuesta_fingerprint}
              onClick={() => onSelect(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(row)
              }}
              role="button"
              tabIndex={0}
            >
              <td>{getSologCatalogChangeTypeLabel(row.tipo)}</td>
              <td><strong>{row.producto ?? row.catalogo_actual.producto ?? 'Sin producto'}</strong><small>{row.c_interno}</small></td>
              <td className="admin-change-summary">{getCatalogChangeSummary(row)}</td>
              <td>{row.sedes.length ? row.sedes.map((site) => site.nombre).join(', ') : 'Sin sedes'}</td>
              <td>{formatAdminDate(row.last_seen_at)}</td>
              <td>{row.occurrence_count}</td>
              <td><span className={`admin-state-badge admin-state-badge--${row.estado}`}>{getSologCatalogChangeStatusLabel(row.estado)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CatalogPanel({
  refreshOperationalState,
  role,
}: {
  refreshOperationalState: () => Promise<void>
  role: 'admin' | 'moderador'
}) {
  const catalog = useCatalogChanges({ refreshOperationalState })
  const [selected, setSelected] = useState<SologCatalogChangeRow | null>(null)
  const [configuring, setConfiguring] = useState<SologCatalogChangeRow | null>(null)
  const rows = catalog.response?.rows ?? []
  const counts = catalog.response?.counts ?? {}
  const splitPending =
    catalog.appliedFilters.estado === 'pendiente' &&
    catalog.appliedFilters.seccion === ''
  const handlePublished = useCallback(() => {
    setSelected(null)
    setConfiguring(null)
    catalog.selectStatus('incorporado')
  }, [catalog])
  const handlePublicationRejected = useCallback(() => {
    void catalog.refresh()
    void refreshOperationalState()
  }, [catalog, refreshOperationalState])
  const publication = useCatalogPublication({
    onPublished: handlePublished,
    onRejected: handlePublicationRejected,
  })

  const ignoreChange = async (change: SologCatalogChangeRow) => {
    if (!window.confirm('¿Ignorar este cambio?\n\nEsta propuesta exacta dejará de aparecer como pendiente.\n\nSi ConeXion detecta posteriormente un valor diferente para el mismo producto, ese nuevo cambio podrá aparecer nuevamente.')) return
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: 'ignore',
    })
    if (completed) setSelected(null)
  }

  const approveChange = async (change: SologCatalogChangeRow) => {
    if (requiresNewProductConfiguration(change)) {
      setSelected(null)
      setConfiguring(change)
      void catalog.loadReference()
      return
    }
    if (!window.confirm('¿Aprobar este cambio para la próxima versión?\n\nAprobar no modifica el catálogo actual. El cambio quedará pendiente de incorporación hasta que Administración publique una nueva versión.')) return
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: 'approve',
    })
    if (completed) setSelected(null)
  }

  const approveNewProduct = async (
    change: SologCatalogChangeRow,
    config: SologCatalogNewProductConfig,
  ) => {
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: 'approve',
      config,
    })
    if (completed) setConfiguring(null)
  }

  return (
    <section className="content-section admin-module" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div>
          <div className="section-title-row"><span className="section-icon"><BookOpenCheck size={20} /></span><h2 id="catalog-title">Catálogo</h2></div>
          <p>Propuestas detectadas para una futura versión del catálogo.</p>
        </div>
        <button className="button button--secondary" disabled={catalog.status === 'loading'} onClick={() => void catalog.refresh()} type="button"><RefreshCw className={catalog.status === 'loading' ? 'icon-spin' : undefined} size={17} /> Refrescar</button>
      </div>

      <div className="admin-module-counts admin-module-counts--five">
        {COUNT_CARDS.map(([key, label]) => <article className={key === 'urgentes_pendientes' ? 'admin-count-card--urgent' : undefined} key={key}><span>{label}</span><strong>{counts[key] ?? 0}</strong></article>)}
      </div>

      <div className="notice"><strong>Aprobado no significa incorporado.</strong><p>Los cambios aprobados no modifican el catálogo actual; se acumulan hasta que Administración decida crear una nueva versión.</p></div>

      <CatalogPublicationCard
        approvedCount={counts.aprobado ?? 0}
        isAdmin={role === 'admin'}
        notice={publication.notice}
        onDismissNotice={publication.dismissNotice}
        onPrepare={() => void publication.prepare()}
        preparing={publication.status === 'preparing' || publication.status === 'publishing'}
      />

      <div className="admin-report-tabs" role="tablist" aria-label="Estado de cambios de catálogo">
        {STATUS_TABS.map((status) => (
          <button aria-selected={catalog.draftFilters.estado === status} className={`admin-tab${catalog.draftFilters.estado === status ? ' admin-tab--active' : ''}`} key={status} onClick={() => catalog.selectStatus(status)} role="tab" type="button">{getSologCatalogChangeStatusLabel(status)}</button>
        ))}
      </div>

      <CatalogFilters filters={catalog.draftFilters} loading={catalog.status === 'loading'} onApply={catalog.applyFilters} onReset={catalog.resetFilters} onUpdate={catalog.updateFilters} />

      {catalog.notice ? <div className="notice notice--success" role="status"><strong>{catalog.notice}</strong><button className="text-button" onClick={catalog.dismissNotice}>Cerrar</button></div> : null}
      {catalog.error ? <div className="notice notice--error" role="alert"><strong>No se pudieron cargar los cambios de catálogo</strong><p>{catalog.error}</p></div> : null}
      {catalog.status === 'loading' ? <div className="empty-state" role="status">Consultando cambios de catálogo…</div> : null}
      {catalog.status === 'ready' && rows.length === 0 ? <div className="empty-state">No hay cambios de catálogo con los filtros seleccionados.</div> : null}

      {catalog.status === 'ready' && rows.length > 0 && splitPending ? (
        <div className="admin-catalog-groups">
          <section><h3>Cambios urgentes</h3><CatalogTable caption="Cambios urgentes pendientes" onSelect={setSelected} rows={rows.filter((row) => row.seccion === 'urgente')} /></section>
          <section><h3>Cambios pendientes</h3><CatalogTable caption="Cambios no urgentes pendientes" onSelect={setSelected} rows={rows.filter((row) => row.seccion === 'pendiente')} /></section>
        </div>
      ) : null}
      {catalog.status === 'ready' && rows.length > 0 && !splitPending ? <CatalogTable caption="Cambios de catálogo" onSelect={setSelected} rows={rows} /> : null}

      {catalog.response ? (
        <nav className="admin-report-pagination" aria-label="Paginación de catálogo">
          <button className="button button--secondary" disabled={catalog.offset === 0 || catalog.status === 'loading'} onClick={catalog.previousPage} type="button"><ArrowLeft size={17} /> Anterior</button>
          <span>Página {Math.floor(catalog.offset / CATALOG_CHANGES_PAGE_SIZE) + 1}</span>
          <button className="button button--secondary" disabled={rows.length < CATALOG_CHANGES_PAGE_SIZE || catalog.status === 'loading'} onClick={catalog.nextPage} type="button">Siguiente <ArrowRight size={17} /></button>
        </nav>
      ) : null}

      {selected ? <CatalogChangeDetail acting={catalog.actingFingerprint === selected.propuesta_fingerprint} change={selected} onApprove={() => void approveChange(selected)} onClose={() => setSelected(null)} onIgnore={() => void ignoreChange(selected)} /> : null}
      {configuring ? <NewProductApprovalForm change={configuring} key={configuring.propuesta_fingerprint} onClose={() => setConfiguring(null)} onLoadReference={() => void catalog.loadReference()} onSubmit={(config) => void approveNewProduct(configuring, config)} reference={catalog.reference} referenceError={catalog.referenceError} referenceStatus={catalog.referenceStatus} submitting={catalog.actingFingerprint === configuring.propuesta_fingerprint} /> : null}
      {publication.status !== 'idle' ? (
        <CatalogPublicationDialog
          error={publication.error}
          onClose={publication.resetDialog}
          onPrepare={() => void publication.prepare()}
          onPublish={() => void publication.publish()}
          preview={publication.preview}
          status={publication.status}
          validationErrors={publication.validationErrors}
        />
      ) : null}
    </section>
  )
}
