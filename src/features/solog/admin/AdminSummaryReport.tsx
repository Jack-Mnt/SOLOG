import { getCoveragePercentage } from './format'
import type { SologAdminSummaryResponse } from '../types'

export function AdminSummaryReport({
  report,
}: {
  report: SologAdminSummaryResponse
}) {
  if (report.rows.length === 0) {
    return (
      <div className="empty-state">
        No hay datos para el período seleccionado.
      </div>
    )
  }

  return (
    <div className="admin-report-summary-list">
      {report.rows.map((row) => (
        <article className="admin-report-summary-card" key={row.sede_id}>
          <div className="admin-report-summary-heading">
            <h3>{row.sede}</h3>
            <strong>
              {row.grupos_contados} / {row.grupos_totales} grupos
            </strong>
            <span>
              {getCoveragePercentage(row.grupos_contados, row.grupos_totales)}%
            </span>
          </div>
          <dl className="admin-report-metrics">
            <div><dt>Sesiones</dt><dd>{row.sesiones}</dd></div>
            <div><dt>Coincide</dt><dd>{row.coincide}</dd></div>
            <div><dt>Pendiente</dt><dd>{row.pendiente}</dd></div>
            <div><dt>Probablemente explicada</dt><dd>{row.probablemente_explicada}</dd></div>
            <div><dt>Parcialmente explicada</dt><dd>{row.parcialmente_explicada}</dd></div>
            <div><dt>Persistente</dt><dd>{row.persistente}</dd></div>
            <div><dt>Confirmada por reconteo</dt><dd>{row.confirmada_reconteo}</dd></div>
            <div><dt>Conteos inconsistentes</dt><dd>{row.conteos_inconsistentes}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  )
}
