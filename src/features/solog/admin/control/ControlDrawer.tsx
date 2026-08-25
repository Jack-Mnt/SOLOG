import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, PackageSearch, RotateCcw, X } from 'lucide-react'
import { getSologDifferenceStateLabel } from '../../labels'
import type {
  SologControlDetailResponse,
  SologControlHistoryRow,
  SologObservationType,
} from '../../types'
import {
  formatAdminCurrency,
  formatSignedInteger,
} from '../format'
import {
  formatControlDate,
  getControlDifferenceClass,
  getControlObservationTypeLabel,
  getControlVerificationReasonLabel,
} from './control-format'
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

function ObservationBadge({ type }: { type: SologObservationType }) {
  return (
    <span className={`control-observation-badge control-observation-badge--${type}`}>
      {getControlObservationTypeLabel(type)}
    </span>
  )
}

function ConfirmedDifference({ value }: { value: number | null }) {
  if (value === null) return <>Sin confirmar</>
  return (
    <span className={getControlDifferenceClass(value)}>
      {formatSignedInteger(value)}
    </span>
  )
}

function ObservationTimelineItem({ row }: { row: SologControlHistoryRow }) {
  const reason = getControlVerificationReasonLabel(row.motivo_verificacion)

  return (
    <li>
      <span className={`control-timeline__marker control-timeline__marker--${row.tipo_observacion}`} aria-hidden="true" />
      <div className="control-timeline__entry">
        <div className="control-timeline__heading">
          <div className="control-timeline__identity">
            <ObservationBadge type={row.tipo_observacion} />
            <time dateTime={row.contado_at}>{formatControlDate(row.contado_at, 'text')}</time>
          </div>
          <DifferenceBadge state={row.estado_diferencia} />
        </div>
        <div className="control-timeline__values">
          <span>Teórico <strong>{row.stock_teorico}</strong></span>
          <span>Físico <strong>{row.stock_fisico}</strong></span>
          <span>Diferencia observada <strong className={getControlDifferenceClass(row.diferencia)}>{formatSignedInteger(row.diferencia)}</strong></span>
          <span>Saldo confirmado <strong><ConfirmedDifference value={row.diferencia_confirmada} /></strong></span>
        </div>
        <div className="control-timeline__context">
          <span>{row.usuario}</span>
          {reason ? <span>{reason}</span> : null}
          {row.confirmado_at ? <span>Confirmada {formatControlDate(row.confirmado_at, 'text')}</span> : null}
          {row.observacion_origen_id ? <span>Deriva de una observación anterior</span> : null}
        </div>
      </div>
    </li>
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
          <div className="control-drawer__heading">
            <h2 id="control-drawer-title">{response?.detalle.grupo ?? 'Cargando detalle…'}</h2>
            {response ? (
              <>
                <strong>{formatAdminCurrency(response.detalle.precio)}</strong>
                <span>{response.detalle.categoria}</span>
                <div className="control-drawer__badges">
                  <ObservationBadge type={response.detalle.tipo_observacion} />
                  <DifferenceBadge state={response.detalle.estado_diferencia} />
                </div>
              </>
            ) : null}
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
              <nav aria-label="Secciones del detalle" className="control-detail-tabs">
                {([
                  ['detail', 'Detalle'],
                  ['products', `Productos (${response.skus.length})`],
                  ['history', `Observaciones (${response.historial_total})`],
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
                <div className="control-detail-content">
                  <dl className="control-detail-metrics">
                    <div><dt>Teórico</dt><dd>{response.detalle.stock_teorico}</dd></div>
                    <div><dt>Físico</dt><dd>{response.detalle.stock_fisico}</dd></div>
                    <div><dt>Diferencia observada</dt><dd><span className={getControlDifferenceClass(response.detalle.diferencia)}>{formatSignedInteger(response.detalle.diferencia)}</span></dd></div>
                    <div><dt>Saldo confirmado</dt><dd><ConfirmedDifference value={response.detalle.diferencia_confirmada} /></dd></div>
                  </dl>
                  <dl className="control-detail-meta">
                    <div><dt>Tipo de observación</dt><dd>{getControlObservationTypeLabel(response.detalle.tipo_observacion)}</dd></div>
                    <div><dt>Fecha y hora</dt><dd>{formatControlDate(response.detalle.contado_at, 'text')}</dd></div>
                    <div><dt>Usuario</dt><dd>{response.detalle.usuario}</dd></div>
                    <div><dt>Sede</dt><dd>{response.detalle.sede}</dd></div>
                    <div><dt>Valor observado</dt><dd>{formatAdminCurrency(response.detalle.valor_diferencia)}</dd></div>
                    {response.detalle.motivo_verificacion ? (
                      <div><dt>Motivo de verificación</dt><dd>{getControlVerificationReasonLabel(response.detalle.motivo_verificacion)}</dd></div>
                    ) : null}
                    {response.detalle.confirmado_at ? (
                      <div><dt>Confirmada</dt><dd>{formatControlDate(response.detalle.confirmado_at, 'text')}</dd></div>
                    ) : null}
                    {response.detalle.stock_posterior !== null ? (
                      <div><dt>Stock posterior</dt><dd>{response.detalle.stock_posterior}</dd></div>
                    ) : null}
                    {response.detalle.observacion_origen_id ? (
                      <div><dt>Relación</dt><dd>Deriva de una observación anterior</dd></div>
                    ) : null}
                  </dl>
                </div>
              ) : null}

              {tab === 'products' ? (
                response.skus.length ? (
                  <div className="control-products">
                    {response.skus.map((sku) => (
                      <article key={sku.c_interno}>
                        <span className="control-products__icon"><PackageSearch size={18} /></span>
                        <div className="control-products__content">
                          <strong>{sku.producto}</strong>
                          <dl>
                            <div><dt>C. interno</dt><dd>{sku.c_interno}</dd></div>
                            <div><dt>C. barras</dt><dd>{sku.c_barras ?? 'No disponible'}</dd></div>
                          </dl>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="empty-state">No hay productos activos asociados al grupo.</div>
              ) : null}

              {tab === 'history' ? (
                <section className="control-history" aria-busy={detail.status === 'loading'}>
                  {response.historial.length ? (
                    <ol className="control-timeline" aria-label="Cronología de observaciones físicas del grupo">
                      {response.historial.map((row) => (
                        <ObservationTimelineItem key={row.detalle_id} row={row} />
                      ))}
                    </ol>
                  ) : <div className="empty-state">No hay observaciones históricas para este grupo.</div>}

                  <nav className="admin-report-pagination" aria-label="Paginación de observaciones del grupo">
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