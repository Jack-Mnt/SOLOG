import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, PackageSearch, RotateCcw, X } from 'lucide-react'
import { getSologDifferenceStateLabel } from '../../labels'
import type { SologControlDetailResponse } from '../../types'
import {
  formatAdminCurrency,
  formatAdminDate,
  formatSignedInteger,
} from '../format'
import {
  SOLOG_CONTROL_HISTORY_PAGE_SIZE,
  useSologControlDetail,
} from './useSologControlDetail'

type DrawerTab = 'detail' | 'products' | 'history'

function DifferenceBadge({ state }: { state: SologControlDetailResponse['detalle']['estado_diferencia'] }) {
  return (
    <span className={`control-state-badge control-state-badge--${state}`}>
      {getSologDifferenceStateLabel(state)}
    </span>
  )
}

export function ControlDrawer({
  detailId,
  onClose,
  refreshOperationalState,
}: {
  detailId: string
  onClose: () => void
  refreshOperationalState: () => Promise<void>
}) {
  const [tab, setTab] = useState<DrawerTab>('detail')
  const detail = useSologControlDetail({ detailId, refreshOperationalState })
  const response = detail.response

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="control-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside aria-labelledby="control-drawer-title" aria-modal="true" className="control-drawer" role="dialog">
        <header className="control-drawer__header">
          <div>
            <span>Observación de inventario</span>
            <h2 id="control-drawer-title">{response?.detalle.grupo ?? 'Cargando detalle…'}</h2>
          </div>
          <button aria-label="Cerrar detalle" className="icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>

        <div className="control-drawer__body">
          {detail.status === 'loading' && !response ? (
            <div className="control-detail-skeleton" role="status" aria-label="Cargando detalle">
              <span /><span /><span /><span />
            </div>
          ) : null}

          {detail.error ? (
            <div className="notice notice--error control-local-error" role="alert">
              <div><strong>No se pudo cargar el detalle</strong><p>{detail.error}</p></div>
              <button className="button button--secondary" onClick={detail.retry} type="button">
                <RotateCcw size={16} /> Reintentar
              </button>
            </div>
          ) : null}

          {response ? (
            <>
              <div className="control-detail-identity">
                <DifferenceBadge state={response.detalle.estado_diferencia} />
                <strong>{response.detalle.grupo}</strong>
                <span>{response.detalle.categoria} · {response.detalle.sede}</span>
              </div>

              <nav aria-label="Secciones del detalle" className="control-detail-tabs">
                {([
                  ['detail', 'Detalle'],
                  ['products', `Productos (${response.skus.length})`],
                  ['history', `Historial (${response.historial_total})`],
                ] as const).map(([value, label]) => (
                  <button
                    aria-current={tab === value ? 'page' : undefined}
                    className={tab === value ? 'is-active' : undefined}
                    key={value}
                    onClick={() => setTab(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {tab === 'detail' ? (
                <dl className="control-detail-grid">
                  <div><dt>Fecha y hora</dt><dd>{formatAdminDate(response.detalle.contado_at)}</dd></div>
                  <div><dt>Usuario</dt><dd>{response.detalle.usuario}</dd></div>
                  <div><dt>Teórico</dt><dd>{response.detalle.stock_teorico}</dd></div>
                  <div><dt>Físico</dt><dd>{response.detalle.stock_fisico}</dd></div>
                  <div><dt>Diferencia</dt><dd>{formatSignedInteger(response.detalle.diferencia)}</dd></div>
                  <div><dt>Valor diferencia</dt><dd>{formatAdminCurrency(response.detalle.valor_diferencia)}</dd></div>
                  <div><dt>Stock posterior</dt><dd>{response.detalle.stock_posterior ?? 'Sin registro'}</dd></div>
                  <div><dt>Reconteo</dt><dd>{response.detalle.reconteo_stock ?? 'Sin reconteo'}</dd></div>
                  <div><dt>Fecha de reconteo</dt><dd>{formatAdminDate(response.detalle.recontado_at)}</dd></div>
                </dl>
              ) : null}

              {tab === 'products' ? (
                response.skus.length ? (
                  <div className="control-products">
                    {response.skus.map((sku) => (
                      <article key={sku.c_interno}>
                        <span className="control-products__icon"><PackageSearch size={18} /></span>
                        <div><strong>{sku.producto}</strong><small>{sku.marca ?? 'Sin marca'}</small></div>
                        <dl>
                          <div><dt>C. interno</dt><dd>{sku.c_interno}</dd></div>
                          <div><dt>C. barras</dt><dd>{sku.c_barras ?? 'No disponible'}</dd></div>
                          <div><dt>Precio</dt><dd>{formatAdminCurrency(sku.precio)}</dd></div>
                          <div><dt>Estado</dt><dd>{sku.estado}</dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state">No hay productos activos asociados al grupo.</div>
              ) : null}

              {tab === 'history' ? (
                <section className="control-history" aria-busy={detail.status === 'loading'}>
                  {response.historial.length ? (
                    <div className="admin-report-table-wrap">
                      <table className="admin-report-table">
                        <caption>Historial del grupo en esta sede</caption>
                        <thead><tr><th>Fecha</th><th>Teórico</th><th>Físico</th><th>Diferencia</th><th>Estado</th><th>Usuario</th></tr></thead>
                        <tbody>
                          {response.historial.map((row) => (
                            <tr key={row.detalle_id}>
                              <td>{formatAdminDate(row.contado_at)}</td>
                              <td>{row.stock_teorico}</td>
                              <td>{row.stock_fisico}</td>
                              <td>{formatSignedInteger(row.diferencia)}</td>
                              <td><DifferenceBadge state={row.estado_diferencia} /></td>
                              <td>{row.usuario}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="empty-state">No hay observaciones históricas para este grupo.</div>}

                  <nav className="admin-report-pagination" aria-label="Paginación del historial del grupo">
                    <button className="button button--secondary" disabled={detail.offset === 0 || detail.status === 'loading'} onClick={detail.previousPage} type="button"><ArrowLeft size={16} /> Anterior</button>
                    <span>{response.historial_total === 0 ? '0' : `${detail.offset + 1}–${Math.min(detail.offset + response.historial.length, response.historial_total)}`} de {response.historial_total}</span>
                    <button className="button button--secondary" disabled={detail.offset + SOLOG_CONTROL_HISTORY_PAGE_SIZE >= response.historial_total || detail.status === 'loading'} onClick={detail.nextPage} type="button">Siguiente <ArrowRight size={16} /></button>
                  </nav>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
