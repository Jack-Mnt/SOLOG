import { getSologDifferenceStateLabel } from '../labels'
import type { SologAdminDifferencesResponse } from '../types'
import {
  formatAdminCurrency,
  formatAdminDate,
  formatSignedInteger,
} from './format'

export function AdminDifferencesReport({
  report,
}: {
  report: SologAdminDifferencesResponse
}) {
  if (report.rows.length === 0) {
    return (
      <div className="empty-state">No hay diferencias para estos filtros.</div>
    )
  }

  return (
    <div className="admin-report-table-wrap">
      <table className="admin-report-table">
        <caption>Diferencias del período seleccionado</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Sede</th>
            <th>Grupo</th>
            <th>Categoría</th>
            <th>Teórico</th>
            <th>Físico</th>
            <th>Diferencia</th>
            <th>Valor diferencia</th>
            <th>Estado</th>
            <th>Stock posterior</th>
            <th>Reconteo</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={`${row.conteo_id}-${row.grupo_id}`}>
              <td>{formatAdminDate(row.contado_at)}</td>
              <td>{row.sede}</td>
              <td>{row.grupo}</td>
              <td>{row.categoria}</td>
              <td>{row.stock_teorico}</td>
              <td>{row.stock_fisico}</td>
              <td>{formatSignedInteger(row.diferencia)}</td>
              <td>{formatAdminCurrency(row.valor_diferencia)}</td>
              <td><span className="count-state">{getSologDifferenceStateLabel(row.estado_diferencia)}</span></td>
              <td>{row.stock_posterior ?? '—'}</td>
              <td>{row.reconteo_stock ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
