import { useEffect, useState } from 'react'
import { ChevronDown, CircleAlert, Clock3, Info, RotateCcw } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { QueryState } from '../admin.v2.presentation'
import { useDashboardMetrics } from './admin.dashboard.metrics.hooks'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type {
  DayObservation, DashboardDay, MetricsQuality, ObservationResult,
} from './admin.dashboard.metrics.types'

const PAGE_SIZE = 25
const integer = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const money = new Intl.NumberFormat('es-PE', {
  style: 'currency', currency: 'PEN', minimumFractionDigits: 2, maximumFractionDigits: 2,
})
const dayFormat = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'full',
})
const timeFormat = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: 'short',
  hour: 'numeric', minute: '2-digit', hour12: true,
})
const resultTones: Record<ObservationResult, string> = {
  Coincide: 'success',
  Recontar: 'warning',
  Confirmada: 'danger',
  Inconsistente: 'warning',
}

function dayLabel(date: string) {
  return dayFormat.format(new Date(date + 'T12:00:00-05:00'))
}
function physicalTime(date: string) {
  return timeFormat.format(new Date(date))
}
function signed(value: number) {
  return (value > 0 ? '+' : '') + integer.format(value)
}
function currency(value: number | null) {
  return value === null ? 'N/D' : money.format(value)
}
function valueOrND(value: number, quality: MetricsQuality) {
  return quality === 'no_data' ? 'N/D' : integer.format(value)
}

type PageState = {
  rows: DayObservation[]
  nextCursor: string | null
  consumedCursors: string[]
}
function physicalKey(row: DayObservation) {
  // Un reconteo puede compartir conteo_detalle.id con su física original.
  return `${row.observation_id}:${row.kind}:${row.observed_at}`
}

function DayObservations({
  siteId, date, store,
}: {
  siteId: string
  date: string
  store: DashboardMetricsStore
}) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [pages, setPages] = useState<PageState | null>(null)
  const query = useDashboardMetrics(store, 'day_observations', {
    site_id: siteId, date, limit: PAGE_SIZE, cursor,
  })

  useEffect(() => {
    if (!query.data) return
    const page = query.data.data
    setPages(previous => {
      if (cursor === null) {
        return { rows: page.rows, nextCursor: page.next_cursor, consumedCursors: [] }
      }
      if (previous?.consumedCursors.includes(cursor)) return previous
      const merged = [...(previous?.rows ?? [])]
      const seen = new Set(merged.map(physicalKey))
      for (const observation of page.rows) {
        const key = physicalKey(observation)
        if (!seen.has(key)) {
          merged.push(observation)
          seen.add(key)
        }
      }
      return {
        rows: merged, nextCursor: page.next_cursor,
        consumedCursors: [...(previous?.consumedCursors ?? []), cursor],
      }
    })
  }, [query.data, cursor])

  const visible = pages ?? (cursor === null && query.data ? {
    rows: query.data.data.rows,
    nextCursor: query.data.data.next_cursor,
    consumedCursors: [],
  } : null)

  const loadingMore = cursor !== null && !pages?.consumedCursors.includes(cursor)
  const restart = () => {
    setPages(null)
    if (cursor !== null) setCursor(null)
    else query.retry()
  }

  return (
    <section className="solog-dash__daily-section" aria-labelledby="solog-dash-daily-observations">
      <div className="solog-dash__daily-section-heading">
        <div>
          <h3 id="solog-dash-daily-observations">Observaciones físicas</h3>
          <p>Conteos y reconteos del día, ordenados por instante físico descendente.</p>
        </div>
        <span className="solog-dash__result-count">{visible ? `${integer.format(visible.rows.length)} cargadas` : 'Cargando…'}</span>
      </div>

      {!visible && (query.loading || query.error) && (
        <QueryState error={query.error} retry={restart} variant="compact" />
      )}

      {visible && visible.rows.length > 0 && (
        <div className="admin-auxiliary-table solog-dash__daily-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Fecha física</th>
                <th scope="col">Grupo</th>
                <th scope="col">Captura</th>
                <th scope="col" className="admin-table-number">Teórico</th>
                <th scope="col" className="admin-table-number">Físico</th>
                <th scope="col" className="admin-table-number">Diferencia</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {visible.rows.map(row => (
                <tr key={physicalKey(row)}>
                  <td>{physicalTime(row.observed_at)}</td>
                  <th scope="row">{row.group_name}</th>
                  <td>{row.kind === 'normal' ? 'Conteo' : 'Reconteo'}</td>
                  <td className="admin-table-number">{integer.format(row.theoretical)}</td>
                  <td className="admin-table-number">{integer.format(row.physical)}</td>
                  <td className="admin-table-number">
                    <span className={`solog-dash__signed solog-dash__signed--${row.physical_difference > 0 ? 'positive' : row.physical_difference < 0 ? 'negative' : 'zero'}`}>
                      {signed(row.physical_difference)}
                    </span>
                  </td>
                  <td><span className={`solog-dash__daily-state solog-dash__daily-state--${resultTones[row.result]}`}>
                    {row.result}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible && visible.rows.length === 0 && !query.error && (
        <div className="solog-dash__empty" role="status">
          No existen observaciones físicas registradas para esta fecha.
        </div>
      )}

      {query.error && visible && (
        <div className="solog-dash__data-error" role="alert">
          <p>{query.error}</p>
          <button className="button button--secondary" type="button" onClick={restart}>
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar observaciones
          </button>
        </div>
      )}
      {visible && !query.error && (
        <div className="solog-dash__daily-pagination">
          <span className="solog-dash__result-count">
            {integer.format(visible.rows.length)} observaciones visibles
          </span>
          {visible.nextCursor ? (
            <button type="button" className="button button--secondary"
              disabled={query.loading || loadingMore}
              onClick={() => { if (visible.nextCursor) setCursor(visible.nextCursor) }}>
              <ChevronDown size={16} aria-hidden="true" />
              {query.loading || loadingMore ? 'Cargando…' : 'Mostrar 25 más'}
            </button>
          ) : visible.rows.length > 0 ? (
            <span className="solog-dash__result-count">Fin de observaciones</span>
          ) : null}
        </div>
      )}
    </section>
  )
}

function DailySummary({ data }: { data: DashboardDay }) {
  const noData = data.quality === 'no_data'
  return (
    <>
      {data.quality !== 'complete' && (
        <div className="solog-dash__data-note" role="status">
          {noData ? <CircleAlert size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
          {noData
            ? 'No hay evidencia verificable para el día seleccionado. N/D no significa actividad cero.'
            : 'Información parcial: algunas métricas históricas pueden carecer de respaldo completo.'}
        </div>
      )}
      <div className="solog-dash__daily-summary" aria-label="Resumen diario">
        <section className="solog-dash__daily-summary-card">
          <h3>Actividad física</h3>
          <div className="solog-dash__daily-stat"><span>Grupos observados</span><strong>{valueOrND(data.physical_activity.groups_observed, data.quality)}</strong></div>
          <div className="solog-dash__daily-stat"><span>Conteos</span><strong>{valueOrND(data.physical_activity.counts, data.quality)}</strong></div>
          <div className="solog-dash__daily-stat"><span>Reconteos</span><strong>{valueOrND(data.physical_activity.recounts, data.quality)}</strong></div>
        </section>
        <section className="solog-dash__daily-summary-card">
          <h3>Episodios</h3>
          <div className="solog-dash__daily-stat"><span>Abiertos</span><strong>{valueOrND(data.episodes.opened, data.quality)}</strong></div>
          <div className="solog-dash__daily-stat"><span>Cerrados</span><strong>{valueOrND(data.episodes.closed, data.quality)}</strong></div>
          <div className="solog-dash__daily-stat"><span>Abiertos al cierre del día</span><strong>{valueOrND(data.episodes.open_at_day_end, data.quality)}</strong></div>
        </section>
      </div>
    </>
  )
}

function ConfirmedDifferences({ data }: { data: DashboardDay }) {
  const confirmed = data.confirmed_differences
  return (
    <section className="solog-dash__daily-section" aria-labelledby="solog-dash-daily-confirmed">
      <div className="solog-dash__daily-section-heading">
        <div>
          <h3 id="solog-dash-daily-confirmed">Diferencias confirmadas</h3>
          <p>Último reconteo físicamente confirmado por grupo durante el día, con valorizado congelado.</p>
        </div>
        <span className="solog-dash__result-count">
          {data.quality === 'no_data' ? 'N/D' : `${integer.format(data.confirmed_total)} grupos`}
        </span>
      </div>
      {confirmed.length > 0 ? (
        <div className="admin-main-table solog-dash__daily-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                <th scope="col">Confirmado el</th>
                <th scope="col" className="admin-table-number">Diferencia</th>
                <th scope="col" className="admin-table-number">Valorizado congelado</th>
              </tr>
            </thead>
            <tbody>
              {confirmed.map(row => (
                <tr key={row.group_id}>
                  <th scope="row">{row.group_name}</th>
                  <td>{physicalTime(row.recounted_at)}</td>
                  <td className="admin-table-number">
                    <span className={`solog-dash__signed solog-dash__signed--${row.difference > 0 ? 'positive' : row.difference < 0 ? 'negative' : 'zero'}`}>
                      {signed(row.difference)}
                    </span>
                  </td>
                  <td className="admin-table-number">
                    <span className={`solog-dash__signed solog-dash__signed--${row.frozen_value === null ? 'zero' : row.frozen_value > 0 ? 'positive' : row.frozen_value < 0 ? 'negative' : 'zero'}`}>
                      {currency(row.frozen_value)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="solog-dash__empty" role="status">
          {data.quality === 'no_data'
            ? 'No hay evidencia histórica verificable de diferencias confirmadas.'
            : 'No se confirmaron diferencias durante esta fecha.'}
        </div>
      )}
      <p className="solog-dash__daily-help">
        <Info size={14} aria-hidden="true" />
        El servidor entrega aquí el conjunto completo del día; esta lista no utiliza paginación.
      </p>
    </section>
  )
}

/** Un Drawer por sede y FECHA; nunca filtra su contenido por turno de la celda. */
export function DashboardDayDrawer({
  siteId, siteName, date, store, onClose,
}: {
  siteId: string
  siteName: string
  date: string
  store: DashboardMetricsStore
  onClose: () => void
}) {
  const query = useDashboardMetrics(store, 'day', { site_id: siteId, date })
  return (
    <AdminDialog format="drawer" drawerMaxWidth={820}
      title={`Detalle diario · ${dayLabel(date)}`}
      description={`${siteName} · Actividad por instante físico, sin filtrar por turno`}
      onClose={onClose}
      className="solog-dash__daily-drawer">
      <div className="solog-dash__daily">
        {query.error ? (
          <QueryState error={query.error} retry={query.retry} variant="compact" />
        ) : !query.data ? (
          <QueryState retry={query.retry} variant="compact" />
        ) : (
          <>
            <DailySummary data={query.data.data} />
            <ConfirmedDifferences data={query.data.data} />
            <DayObservations siteId={siteId} date={date} store={store} />
          </>
        )}
        <p className="solog-dash__daily-help">
          <Clock3 size={14} aria-hidden="true" />
          Fechas y horas en America/Lima. Los datos históricos corresponden al evento físico registrado, no al turno de la sesión.
        </p>
      </div>
    </AdminDialog>
  )
}
