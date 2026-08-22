import { ArrowLeft, ArrowRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import {
  getSologAdminIncidentStatusLabel,
  getSologAdminIncidentTypeLabel,
} from '../../labels'
import type {
  SologAdminIncidentDecision,
  SologAdminIncidentRow,
  SologAdminSite,
} from '../../types'
import { formatAdminDate } from '../format'
import { IncidentDetail } from './IncidentDetail'
import { IncidentFilters } from './IncidentFilters'
import { getIncidentSummary } from './incident-domain'
import {
  ADMIN_INCIDENTS_PAGE_SIZE,
  useAdminIncidents,
} from './useAdminIncidents'

const DECISION_CONFIRMATIONS: Record<SologAdminIncidentDecision, string> = {
  reviewed: '¿Marcar esta incidencia como revisada?\n\nSi vuelve a detectarse, aparecerá nuevamente como pendiente.',
  ignore_15d: '¿Ignorar esta incidencia durante 15 días?\n\nLas nuevas detecciones del mismo C. interno + tipo permanecerán suprimidas durante ese periodo.',
  deleted: '¿Confirmar producto eliminado?\n\nEsto indica que Administración confirmó que el producto fue eliminado manualmente del POS.\n\nNo se eliminará inmediatamente del catálogo. Se creará una propuesta de eliminación en el módulo Catálogo.',
}

const COUNT_CARDS = [
  ['pendiente', 'Pendientes'],
  ['revisada', 'Revisadas'],
  ['suprimida', 'Suprimidas'],
  ['eliminada', 'Eliminadas'],
] as const

export function IncidentsPanel({
  sites,
  refreshOperationalState,
}: {
  sites: SologAdminSite[]
  refreshOperationalState: () => Promise<void>
}) {
  const incidents = useAdminIncidents({ refreshOperationalState })
  const [selected, setSelected] = useState<SologAdminIncidentRow | null>(null)
  const rows = incidents.response?.rows ?? []
  const counts = incidents.response?.counts ?? {}

  const handleDecision = async (decision: SologAdminIncidentDecision) => {
    if (!selected || !window.confirm(DECISION_CONFIRMATIONS[decision])) return
    const completed = await incidents.applyDecision({
      incident_id: selected.id,
      decision,
    })
    if (completed) setSelected(null)
  }

  return (
    <section className="content-section admin-module" aria-labelledby="incidents-title">
      <div className="section-heading">
        <div>
          <div className="section-title-row"><span className="section-icon"><TriangleAlert size={20} /></span><h2 id="incidents-title">Incidencias</h2></div>
          <p>Problemas operativos detectados por ConeXion que requieren revisión administrativa.</p>
        </div>
        <button className="button button--secondary" disabled={incidents.status === 'loading'} onClick={() => void incidents.refresh()} type="button">
          <RefreshCw className={incidents.status === 'loading' ? 'icon-spin' : undefined} size={17} /> Refrescar
        </button>
      </div>

      <div className="admin-module-counts">
        {COUNT_CARDS.map(([key, label]) => <article key={key}><span>{label}</span><strong>{counts[key] ?? 0}</strong></article>)}
      </div>

      <IncidentFilters
        filters={incidents.draftFilters}
        loading={incidents.status === 'loading'}
        onApply={incidents.applyFilters}
        onReset={incidents.resetFilters}
        onUpdate={incidents.updateFilters}
        sites={sites}
      />

      {incidents.notice ? <div className="notice notice--success" role="status"><strong>{incidents.notice}</strong><button className="text-button" onClick={incidents.dismissNotice}>Cerrar</button></div> : null}
      {incidents.error ? <div className="notice notice--error" role="alert"><strong>No se pudieron cargar las incidencias</strong><p>{incidents.error}</p></div> : null}
      {incidents.status === 'loading' ? <div className="empty-state" role="status">Consultando incidencias…</div> : null}
      {incidents.status === 'ready' && rows.length === 0 ? <div className="empty-state">No hay incidencias pendientes con los filtros seleccionados.</div> : null}

      {incidents.status === 'ready' && rows.length > 0 ? (
        <div className="admin-report-table-wrap">
          <table className="admin-report-table admin-interactive-table">
            <caption>Incidencias administrativas</caption>
            <thead><tr><th>Tipo</th><th>Producto / C. interno</th><th>Sede</th><th>Resumen</th><th>Última detección</th><th>Ocurrencias</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelected(row)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td>{getSologAdminIncidentTypeLabel(row.tipo)}</td>
                  <td><strong>{row.producto ?? 'Sin producto'}</strong><small>{row.c_interno ?? row.c_interno_original ?? 'Sin código'}</small></td>
                  <td>{row.sede ?? 'Sin sede'}</td>
                  <td className="admin-table-summary">{getIncidentSummary(row)}</td>
                  <td>{formatAdminDate(row.last_seen_at)}</td>
                  <td>{row.occurrence_count}</td>
                  <td><span className={`admin-state-badge admin-state-badge--${row.estado}`}>{getSologAdminIncidentStatusLabel(row.estado)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {incidents.response ? (
        <nav className="admin-report-pagination" aria-label="Paginación de incidencias">
          <button className="button button--secondary" disabled={incidents.offset === 0 || incidents.status === 'loading'} onClick={incidents.previousPage} type="button"><ArrowLeft size={17} /> Anterior</button>
          <span>Página {Math.floor(incidents.offset / ADMIN_INCIDENTS_PAGE_SIZE) + 1}</span>
          <button className="button button--secondary" disabled={rows.length < ADMIN_INCIDENTS_PAGE_SIZE || incidents.status === 'loading'} onClick={incidents.nextPage} type="button">Siguiente <ArrowRight size={17} /></button>
        </nav>
      ) : null}

      {selected ? (
        <IncidentDetail
          acting={incidents.actingId === selected.id}
          incident={selected}
          onClose={() => setSelected(null)}
          onDecision={(decision) => void handleDecision(decision)}
        />
      ) : null}
    </section>
  )
}
