import { useState } from 'react'
import { CalendarDays, ChevronLeft, Info } from 'lucide-react'
import { QueryState } from '../admin.v2.presentation'
import { useDashboardMetrics } from './admin.dashboard.metrics.hooks'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type { ActivityCell, ActivityStatus, ShiftName } from './admin.dashboard.metrics.types'

const SHIFTS: ReadonlyArray<{ id: ShiftName; label: string }> = [
  { id: 'early', label: 'Madrugada' },
  { id: 'day', label: 'Día' },
  { id: 'night', label: 'Noche' },
]
const number = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const numberPercent = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 })

function limaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** El desplazamiento usa UTC sobre fechas YYYY-MM-DD, sin DST del navegador. */
function dateOffset(today: string, days: number): string {
  const day = new Date(today + 'T00:00:00Z')
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}
function dateDisplay(day: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', weekday: 'short', day: '2-digit', month: 'short',
  }).format(new Date(day + 'T12:00:00-05:00'))
}
function ariaDate(day: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'full',
  }).format(new Date(day + 'T12:00:00-05:00'))
}
function statusLabel(status: ActivityStatus): string {
  if (status === 'closed') return 'Cerrado'
  if (status === 'in_progress') return 'En curso'
  if (status === 'no_tasks') return 'Sin tareas'
  return 'Sin datos'
}
function cellLabel(cell: ActivityCell | undefined): string {
  if (!cell || cell.status === 'no_data' || cell.quality === 'no_data') return 'N/D'
  if (cell.status === 'no_tasks') return 'Sin tareas'
  if (cell.completed === null || cell.required === null) return 'N/D'
  return `${number.format(cell.completed)}/${number.format(cell.required)}`
}
function cellPercent(cell: ActivityCell | undefined): string | null {
  if (!cell || cell.percent === null || cell.quality === 'no_data' ||
    cell.status === 'no_tasks' || cell.status === 'no_data') return null
  return `${numberPercent.format(cell.percent)} %`
}

export function DashboardActivityPanel({
  siteId, store, onSelectDate,
}: {
  siteId: string
  store: DashboardMetricsStore
  onSelectDate: (date: string) => void
}) {
  const [days, setDays] = useState(5)
  // Se computa en cada render, con fechas de negocio de Lima.
  const today = limaToday()
  const dateFrom = dateOffset(today, -(days - 1))
  const query = useDashboardMetrics(store, 'activity', {
    site_id: siteId, date_from: dateFrom, date_to: today,
  })
  // Los días se muestran de antiguo a reciente, dejando hoy a la derecha.
  const dates = Array.from({ length: days }, (_, i) => dateOffset(dateFrom, i))
  const cells = new Map(
    query.data?.data.cells.map(cell => [`${cell.date}:${cell.turno}`, cell] as const) ?? [],
  )
  const used = dates.length
  const loadMore = () => setDays(previous => Math.min(20, previous + 5))

  return (
    <div className="solog-dash__view solog-dash__activity-view">
      <div className="solog-dash__view-heading">
        <div>
          <h4>Actividad por fecha y turno</h4>
          <p>Las columnas son días de Lima. Pulsa cualquier celda para consultar el detalle de esa fecha completa.</p>
        </div>
        <span className="solog-dash__result-count">
          {used} de 20 días · {dateDisplay(dateFrom)} — {dateDisplay(today)}
        </span>
      </div>
      {query.error ? (
        <QueryState error={query.error} retry={query.retry} variant="compact" />
      ) : !query.data ? (
        <QueryState retry={query.retry} variant="compact" />
      ) : (
        <>
          {query.data.quality === 'partial' && (
            <div className="solog-dash__data-note" role="status">
              <Info size={16} aria-hidden="true" />
              Los datos de algunas fechas o turnos son parciales.
            </div>
          )}
          {query.data.quality === 'no_data' && (
            <div className="solog-dash__data-note" role="status">
              <Info size={16} aria-hidden="true" />
              No hay historial verificable para el período solicitado. N/D no equivale a cero tareas.
            </div>
          )}
          <div className="admin-main-table solog-dash__activity-scroll"
            role="region" aria-label="Matriz de actividad por fecha y turno" tabIndex={0}>
            <table className="solog-dash__activity-table">
              <thead>
                <tr>
                  <th scope="col">Turno</th>
                  {dates.map(date => (
                    <th scope="col" key={date}>
                      <button type="button" className="solog-dash__activity-date"
                        onClick={() => onSelectDate(date)}
                        aria-label={`Ver detalle del ${ariaDate(date)}`}>
                        <span>{dateDisplay(date)}</span>
                        {date === today && <small>Hoy</small>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map(shift => (
                  <tr key={shift.id}>
                    <th scope="row">{shift.label}</th>
                    {dates.map(date => {
                      const cell = cells.get(`${date}:${shift.id}`)
                      const status = cell?.status ?? 'no_data'
                      const quality = cell?.quality ?? 'no_data'
                      const label = cellLabel(cell)
                      const percentage = cellPercent(cell)
                      return (
                        <td key={date} className="solog-dash__activity-cell">
                          <button type="button"
                            className={`solog-dash__activity-action solog-dash__activity-action--${status}`}
                            onClick={() => onSelectDate(date)}
                            aria-label={`${shift.label}, ${ariaDate(date)}: ${label}; ${statusLabel(status)}; ${quality === 'partial' ? 'datos parciales' : quality === 'no_data' ? 'sin datos verificables' : 'datos completos'}. Abrir fecha.`}
                            title={`${statusLabel(status)} · ${percentage ?? 'N/D'} · ${quality === 'partial' ? 'Parcial' : quality === 'no_data' ? 'N/D' : 'Completa'}`}>
                            <strong>{label}</strong>
                            <span>{statusLabel(status)}</span>
                            {percentage && <small>{percentage}</small>}
                            {quality === 'partial' && <small>Parcial</small>}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="solog-dash__activity-footer">
            <span className="solog-dash__result-count">
              {days} días mostrados · 3 turnos por día
            </span>
            {days < 20 && (
              <button type="button" className="button button--secondary"
                onClick={loadMore}>
                <ChevronLeft size={16} aria-hidden="true" />
                Cargar 5 días anteriores
              </button>
            )}
          </div>
          <p className="solog-dash__footnote">
            <CalendarDays size={15} aria-hidden="true" />
            Sin tareas (0/0 verificado) es distinto de N/D (ausencia de fila analítica).
            La fecha seleccionada abre el día completo, independientemente del turno.
          </p>
        </>
      )}
    </div>
  )
}
