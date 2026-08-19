import { getSologDifferenceStateLabel } from '../labels'
import type { SologAdminPosAdjustmentsResponse } from '../types'
import {
  formatAdminCurrency,
  formatAdminDate,
  formatSignedInteger,
} from './format'

export function AdminPosAdjustmentsReport({
  report,
}: {
  report: SologAdminPosAdjustmentsResponse
}) {
  if (report.rows.length === 0) {
    return (
      <div className="empty-state">
        No hay casos que requieran revisión de ajuste POS para estos filtros.
      </div>
    )
  }

  return (
    <div className="admin-pos-list">
      <div className="notice notice--warning">
        <strong>Consulta para revisión manual</strong>
        <p>
          SOLOG no modifica el POS ni distribuye diferencias entre productos.
        </p>
      </div>
      {report.rows.map((row) => {
        const isSingleSku = row.sku_count === 1 && row.sku_unico !== null
        const isComposite = row.sku_count > 1

        return (
          <article
            className="admin-pos-card"
            key={`${row.conteo_id}-${row.grupo_id}`}
          >
            <div className="admin-pos-heading">
              <div>
                <p>{formatAdminDate(row.contado_at)} · {row.sede}</p>
                <h3>{row.grupo}</h3>
                <span>{row.categoria}</span>
              </div>
              <span className="count-state">
                {getSologDifferenceStateLabel(row.estado_diferencia)}
              </span>
            </div>

            <div className="admin-pos-identity">
              {isSingleSku ? (
                <strong>Código interno: {row.sku_unico}</strong>
              ) : isComposite ? (
                <>
                  <strong>Grupo compuesto · {row.sku_count} SKU</strong>
                  <p>
                    La diferencia está determinada a nivel grupo. Revisa
                    manualmente los productos asociados antes de corregir el POS.
                  </p>
                </>
              ) : (
                <strong>Identificación SKU no disponible</strong>
              )}
            </div>

            <dl className="admin-pos-metrics">
              <div><dt>Teórico</dt><dd>{row.stock_teorico}</dd></div>
              <div><dt>Físico</dt><dd>{row.stock_fisico}</dd></div>
              <div><dt>Diferencia registrada</dt><dd>{formatSignedInteger(row.diferencia)}</dd></div>
              <div><dt>Valor diferencia</dt><dd>{formatAdminCurrency(row.valor_diferencia)}</dd></div>
              <div><dt>Stock posterior</dt><dd>{row.stock_posterior ?? '—'}</dd></div>
              <div><dt>Reconteo</dt><dd>{row.reconteo_stock ?? '—'}</dd></div>
            </dl>
          </article>
        )
      })}
    </div>
  )
}
