import { getSologCountTypeLabel } from '../labels'
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
            <th>Fecha/hora</th>
            <th>Sede</th>
            <th>Usuario</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Grupos contados</th>
            <th>Inicio</th>
            <th>Finalización</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.conteo_id}>
              <td>{formatAdminDate(row.finalizado_at ?? row.iniciado_at)}</td>
              <td>{row.sede}</td>
              <td>{row.usuario}</td>
              <td>{getSologCountTypeLabel(row.tipo)}</td>
              <td><span className="count-state">{getAdminCountStateLabel(row.estado)}</span></td>
              <td>{row.grupos_contados}</td>
              <td>{formatAdminDate(row.iniciado_at)}</td>
              <td>{formatAdminDate(row.finalizado_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
