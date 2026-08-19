import { getSologDifferenceStateLabel } from '../labels'
import type { SologAdminHistoryResponse } from '../types'
import {
  formatAdminCurrency,
  formatAdminDate,
  formatSignedInteger,
} from './format'

export function AdminHistoryReport({
  report,
  internalCode,
}: {
  report: SologAdminHistoryResponse
  internalCode: string
}) {
  if (report.rows.length === 0) {
    return (
      <div className="empty-state">
        No hay registros históricos para estos filtros.
      </div>
    )
  }

  return (
    <>
      {internalCode ? (
        <div className="notice admin-report-context">
          <strong>Filtro por código interno: {internalCode}</strong>
          <p>
            El backend devuelve la historia del grupo relacionado; una fila no
            representa necesariamente un SKU individual.
          </p>
        </div>
      ) : null}
      <div className="admin-report-table-wrap">
        <table className="admin-report-table">
          <caption>Historial de observaciones físicas</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Sede</th>
              <th>Grupo</th>
              <th>Categoría</th>
              <th>Usuario</th>
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
                <td>{row.usuario}</td>
                <td>{row.stock_teorico}</td>
                <td>{row.stock_fisico}</td>
                <td>{formatSignedInteger(row.diferencia)}</td>
                <td>{formatAdminCurrency(row.valor_diferencia)}</td>
                <td>
                  <span className="count-state">
                    {getSologDifferenceStateLabel(row.estado_diferencia)}
                  </span>
                </td>
                <td>{row.stock_posterior ?? '—'}</td>
                <td>{row.reconteo_stock ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
