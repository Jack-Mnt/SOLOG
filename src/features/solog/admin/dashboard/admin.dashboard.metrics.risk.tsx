import { useEffect, useState } from 'react'
import { ChevronDown, Info, RotateCcw } from 'lucide-react'
import { AdminSort } from '../admin.primitives'
import { QueryState } from '../admin.v2.presentation'
import { useDashboardMetrics } from './admin.dashboard.metrics.hooks'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type { MetricsQuality, MetricsSort, RiskRow } from './admin.dashboard.metrics.types'

const PAGE_SIZE = 6
const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 })
const penFormat = new Intl.NumberFormat('es-PE', {
  style: 'currency', currency: 'PEN', minimumFractionDigits: 2, maximumFractionDigits: 2,
})
const riskLabels = {
  bajo: 'Bajo',
  medio_bajo: 'Medio bajo',
  medio: 'Medio',
  medio_alto: 'Medio alto',
  alto: 'Alto',
  muy_alto: 'Muy alto',
} as const
const riskTones = {
  bajo: 'low', medio_bajo: 'low', medio: 'medium',
  medio_alto: 'medium', alto: 'high', muy_alto: 'critical',
} as const

const riskSortOptions: readonly { value: MetricsSort; label: string }[] = [
  { value: 'risk', label: 'Mayor riesgo' },
  { value: 'value', label: 'Mayor valorizado' },
  { value: 'difference', label: 'Mayor diferencia' },
]

function signed(value: number): string {
  return (value > 0 ? '+' : '') + numberFormat.format(value)
}
function pen(value: number | null): string {
  return value === null ? 'N/D' : penFormat.format(value)
}
function movementLabel(value: RiskRow['movement_quality']): string {
  if (value === 'complete') return 'Medido'
  if (value === 'partial') return 'Parcial'
  return 'C24 insuficiente · C=1'
}
function qualityText(value: MetricsQuality): string {
  if (value === 'complete') return 'Datos completos'
  if (value === 'partial') return 'Datos parciales'
  return 'Sin datos verificables'
}

interface AccumulatedRisk {
  rows: RiskRow[]
  total: number
  nextCursor: string | null
  seen: string[]
  quality: MetricsQuality
}

/** Ranking autoritativo, páginas keyset de 6 sin reconstruir C×D×V en frontend. */
export function DashboardRiskPanel({
  siteId, store,
}: {
  siteId: string
  store: DashboardMetricsStore
}) {
  const [sort, setSort] = useState<MetricsSort>('risk')
  const [cursor, setCursor] = useState<string | null>(null)
  const [pages, setPages] = useState<AccumulatedRisk | null>(null)
  const query = useDashboardMetrics(store, 'risk', {
    site_id: siteId, sort, limit: PAGE_SIZE, cursor,
  })

  useEffect(() => {
    const received = query.data
    if (!received) return
    const page = received.data
    queueMicrotask(() => setPages(previous => {
      if (cursor === null) {
        return {
          rows: page.rows, total: page.total, nextCursor: page.next_cursor,
          quality: received.quality, seen: [],
        }
      }
      // La respuesta tardía de un cursor anterior nunca agrega otra vez su página.
      if (previous?.seen.includes(cursor)) return previous
      const merged = [...(previous?.rows ?? [])]
      const known = new Set(merged.map(item => item.group_id))
      for (const item of page.rows) {
        if (!known.has(item.group_id)) {
          merged.push(item)
          known.add(item.group_id)
        }
      }
      return {
        rows: merged, total: page.total, nextCursor: page.next_cursor,
        quality: received.quality, seen: [...(previous?.seen ?? []), cursor],
      }
    }))
  }, [query.data, cursor])

  const changeSort = (value: MetricsSort) => {
    if (value === sort) return
    setSort(value)
    setCursor(null)
    setPages(null)
  }

  const restart = () => {
    setPages(null)
    if (cursor !== null) {
      setCursor(null)
    } else {
      query.retry()
    }
  }

  // Primera página visible tan pronto llega, sin depender de otro ciclo de effect.
  const effective = pages ?? (
    cursor === null && query.data ? {
      rows: query.data.data.rows,
      total: query.data.data.total,
      nextCursor: query.data.data.next_cursor,
      seen: [],
      quality: query.data.quality,
    } : null
  )
  const more = effective?.nextCursor ?? null
  const exhausted = effective !== null && more === null

  return (
    <div className="solog-dash__view solog-dash__risk-view">
      <div className="solog-dash__view-heading">
        <div>
          <h4>Ranking de riesgo</h4>
          <p>Diferencias físicas confirmadas y comparables · Ordenación del servidor.</p>
        </div>
        <div className="solog-dash__view-actions">
          <span className="solog-dash__result-count">
            {effective ? `${effective.rows.length} de ${effective.total}` : '—'} grupos
          </span>
          <AdminSort value={sort} defaultValue="risk" options={riskSortOptions} onChange={changeSort} />
        </div>
      </div>

      {effective?.quality === 'partial' && (
        <div className="solog-dash__data-note" role="status">
          <Info size={15} aria-hidden="true" />
          <span>Riesgo calculado con información parcial. Algunos grupos utilizan C=1 por falta de calibración C24 suficiente.</span>
        </div>
      )}
      {effective?.quality === 'no_data' && (
        <div className="solog-dash__data-note" role="status">
          <Info size={15} aria-hidden="true" />
          <span>Sin mediciones suficientes para evaluar el riesgo.</span>
        </div>
      )}

      {effective && effective.rows.length > 0 && (
        <div className="admin-main-table solog-dash__results-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                <th scope="col" className="admin-table-number">Diferencia</th>
                <th scope="col" className="admin-table-number">Valorizado</th>
                <th scope="col">Nivel de riesgo</th>
                <th scope="col">Movimiento</th>
              </tr>
            </thead>
            <tbody>
              {effective.rows.map(row => (
                <tr key={row.group_id}>
                  <th scope="row">{row.group_name}</th>
                  <td className="admin-table-number">
                    <span className={`solog-dash__signed solog-dash__signed--${row.difference > 0 ? 'positive' : row.difference < 0 ? 'negative' : 'zero'}`}>
                      {signed(row.difference)}
                    </span>
                  </td>
                  <td className="admin-table-number">
                    <span className={`solog-dash__signed solog-dash__signed--${row.confirmed_value === null ? 'zero' : row.confirmed_value > 0 ? 'positive' : row.confirmed_value < 0 ? 'negative' : 'zero'}`}>
                      {pen(row.confirmed_value)}
                    </span>
                  </td>
                  <td>
                    {row.risk_available && row.level ? (
                      <span className={`solog-dash__risk-level solog-dash__risk-level--${riskTones[row.level]}`}>
                        {riskLabels[row.level]}
                      </span>
                    ) : (
                      <span className="solog-dash__quality">N/D</span>
                    )}
                  </td>
                  <td>
                    <span className={`solog-dash__movement solog-dash__movement--${row.movement_quality}`}
                      title={row.movement_quality === 'insufficient' ? 'C24 sin tres intervalos de calibración válidos; el backend imputa C=1.' : undefined}>
                      {movementLabel(row.movement_quality)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!effective && (query.loading || query.error) && (
        <QueryState error={query.error} retry={restart} variant="compact" />
      )}
      {effective && effective.rows.length === 0 && !query.error && (
        <div className="solog-dash__empty" role="status">
          No hay diferencias físicas confirmadas que integrar al ranking.
        </div>
      )}
      {query.error && effective && (
        <div className="solog-dash__data-error" role="alert">
          <p>{query.error}</p>
          <button className="button button--secondary" type="button" onClick={restart}>
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar lista
          </button>
        </div>
      )}

      {effective && !query.error && (
        <div className="solog-dash__pagination">
          <span className="solog-dash__result-count">{qualityText(effective.quality)}</span>
          {!exhausted && (
            <button type="button" className="button button--secondary"
              disabled={query.loading || cursor !== null && !pages?.seen.includes(cursor)}
              onClick={() => { if (more) setCursor(more) }}>
              <ChevronDown size={16} aria-hidden="true" />
              {query.loading ? 'Cargando…' : 'Mostrar 6 más'}
            </button>
          )}
          {exhausted && effective.rows.length > 0 && (
            <span className="solog-dash__result-count">Fin de resultados</span>
          )}
        </div>
      )}
    </div>
  )
}
