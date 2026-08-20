import type { SologAdminCountsResponse } from '../types'
import { formatAdminDate, getAdminCountStateLabel } from './format'

export function AdminCountsReport({
  report,
}: {
  report: SologAdminCountsResponse
}) {
  if (report.rows.length === 0) {
    return <div className="empty-state">No hay conteos para estos filtros.</div>
  }

  return (
    <div className="admin-report-table-wrap">
      <table className="admin-report-table">
        <caption>Conteos del período seleccionado</caption>
        <thead>
          <tr>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Sede</th>
            <th>Usuario</th>
            <th>Estado</th>
            <th>Grupos registrados</th>
            <th>Snapshot</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.conteo_id}>
              <td>{formatAdminDate(row.iniciado_at)}</td>
              <td>{formatAdminDate(row.finalizado_at)}</td>
              <td>{row.sede}</td>
              <td>{row.usuario}</td>
              <td><span className="count-state">{getAdminCountStateLabel(row.estado)}</span></td>
              <td>{row.grupos_registrados}</td>
              <td><code>{row.snapshot_referencia_id}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
