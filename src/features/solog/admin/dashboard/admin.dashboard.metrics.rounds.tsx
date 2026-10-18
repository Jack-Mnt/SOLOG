import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { QueryState } from '../admin.v2.presentation'
import { useDashboardMetrics } from './admin.dashboard.metrics.hooks'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type {
  DashboardRound, DashboardRounds, HistoricalAccuracy, MetricsQuality, ShiftName,
} from './admin.dashboard.metrics.types'

const count = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short', hour12: true,
})
const dateOnly = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: 'numeric', month: 'short',
})
const shiftNames: ReadonlyArray<[ShiftName, string]> = [
  ['early', 'Madrugada'], ['day', 'Día'], ['night', 'Noche'],
]

function value(n: number | null): string {
  return n === null ? 'N/D' : count.format(n)
}
function ratio(n: number | null): string {
  return n === null ? 'N/D' : `${percent.format(n)} %`
}
function timestamp(s: string | null): string {
  return s === null ? 'N/D' : dateTime.format(new Date(s))
}
function date(s: string): string {
  return dateOnly.format(new Date(`${s}T12:00:00-05:00`))
}
function roundLabel(r: DashboardRound): string {
  return `R${r.round} · ${date(r.period_from)} al ${date(r.period_to)}`
}
function qualityLabel(quality: MetricsQuality): string {
  return quality === 'complete' ? 'Completa' : quality === 'partial' ? 'Parcial' : 'N/D'
}

/** Tiempo efectivo desde apertura de la ronda hasta el hito persistido. */
function durationFromStart(start: string, reached: string | null): string | null {
  if (!reached) return null
  const elapsed = Date.parse(reached) - Date.parse(start)
  if (!Number.isFinite(elapsed) || elapsed < 0) return null
  const minutes = Math.floor(elapsed / 60_000)
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor(minutes % 1_440 / 60)
  const rest = minutes % 60
  return [
    days ? `${days} d` : '',
    hours ? `${hours} h` : '',
    rest || minutes === 0 ? `${rest} min` : '',
  ].filter(Boolean).join(' ')
}
function milestoneLabel(item: DashboardRound, reached: string | null): string {
  if (reached !== null) return durationFromStart(item.round_from, reached) ?? 'N/D'
  if (item.quality === 'no_data' || item.quality === 'partial' && item.closed_at) return 'N/D'
  return item.closed_at === null ? 'Pendiente' : 'No alcanzado'
}
function historyAccuracy(item: DashboardRound): HistoricalAccuracy | null {
  return item.historical_accuracy
}
function graphPercent(item: DashboardRound): number | null {
  const h = historyAccuracy(item)
  if (!h || h.percent === null || h.denominator === null || h.denominator <= 0 ||
    h.green === null || h.red === null || item.quality === 'no_data') return null
  return Math.max(0, Math.min(100, h.percent))
}

function RoundMilestones({ round }: { round: DashboardRound }) {
  return (
    <section className="solog-dash__round-section" aria-labelledby="solog-round-milestones">
      <h5 id="solog-round-milestones">Hitos desde el inicio de ronda</h5>
      <div className="solog-dash__milestones">
        {(['50', '90', '100'] as const).map(key => {
          const reached = round.milestones[key]
          const elapsed = milestoneLabel(round, reached)
          return (
            <div className="solog-dash__milestone" key={key}>
              <span className="solog-dash__milestone-label">{key} % de cobertura</span>
              <strong className={`solog-dash__milestone-value${reached === null ? ' solog-dash__milestone-value--missing' : ''}`}>
                {elapsed}
              </strong>
              <small>{reached ? `Alcanzado: ${timestamp(reached)}` : 'No hay instante de alcance registrado'}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RoundCurrent({ data }: { data: DashboardRounds }) {
  const [requested, setRequested] = useState<string | null>(null)
  const current = data.current
  // La selección explícita se limita a rondas de la quincena vigente; nunca se recalculan cortes.
  const selected = data.period_rounds.find(r => r.round_from === requested) ??
    current ?? data.period_rounds.at(-1) ?? null
  if (!selected) return <div className="solog-dash__empty">No hay una ronda disponible para esta sede.</div>
  return (
    <section className="solog-dash__round-card">
      <div className="solog-dash__round-title">
        <div>
          <p className="solog-dash__eyebrow">Quincena vigente</p>
          <h4>{roundLabel(selected)}</h4>
          <p>Iniciada el {timestamp(selected.round_from)} · {selected.closed_at ?
            `Cerrada el ${timestamp(selected.closed_at)}` : 'En curso'}</p>
        </div>
        <span className={`solog-dash__quality-tag solog-dash__quality-tag--${selected.quality}`}>
          {qualityLabel(selected.quality)}
        </span>
      </div>

      {data.period_rounds.length > 1 && (
        <div className="solog-dash__round-switch" role="group" aria-label="Rondas de la quincena">
          {data.period_rounds.map(r => (
            <button key={r.round_from} type="button" className="button button--secondary"
              aria-pressed={selected.round_from === r.round_from}
              onClick={() => setRequested(r.round_from)}>
              Ronda {r.round}
            </button>
          ))}
        </div>
      )}

      <div className="solog-dash__round-summary">
        <div>
          <span>Cobertura</span>
          <strong>{ratio(selected.coverage.percent)}</strong>
          <small>{value(selected.coverage.counted)} / {value(selected.coverage.required)} grupos</small>
        </div>
        <div>
          <span>Precisión histórica del corte</span>
          <strong>{ratio(selected.historical_accuracy?.percent ?? null)}</strong>
          <small>{selected.closed_at ? 'Verde / Verde + Rojo · Binaria' : 'Disponible al cierre de la ronda'}</small>
        </div>
        <div>
          <span>Calidad del corte</span>
          <strong>{qualityLabel(selected.quality)}</strong>
          <small>{selected.cut_version === null ? 'Sin corte congelado' : `Corte versión ${selected.cut_version}`}</small>
        </div>
      </div>

      <RoundMilestones round={selected} />

      <section className="solog-dash__round-section">
        <h5>Aporte a cobertura por turno</h5>
        <div className="solog-dash__shift-rows">
          {shiftNames.map(([shift, label]) => (
            <div key={shift}>
              <span>{label}</span>
              <strong>{value(selected.shift_contributions[shift] ?? null)}</strong>
              <small>grupos acreditados</small>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

/** Dos lecturas de la misma serie autoritativa: barras de verde/rojo y trazado del % verde. */
function HistoricalGraph({ history }: { history: DashboardRound[] }) {
  // Backend retorna los cierres en orden descendente; en la gráfica el tiempo avanza a la derecha.
  const rounds = history.slice(0, 6).reverse()
  if (rounds.length === 0) {
    return (
      <div className="solog-dash__empty" role="status">
        Aún no hay rondas cerradas disponibles para mostrar la evolución histórica.
      </div>
    )
  }

  const width = Math.max(630, rounds.length * 100 + 80)
  const bottom = 195
  const top = 45
  const height = bottom - top
  const xAt = (index: number) => 70 + index * ((width - 140) / Math.max(1, rounds.length - 1))
  const yAt = (p: number) => bottom - p / 100 * height
  const segments: Array<Array<{ x: number; y: number }>> = []
  for (let i = 0; i < rounds.length; i++) {
    const p = graphPercent(rounds[i])
    if (p === null) continue
    const pos = { x: xAt(i), y: yAt(p) }
    if (i > 0 && graphPercent(rounds[i - 1]) !== null) {
      segments.push([{ x: xAt(i - 1), y: yAt(graphPercent(rounds[i - 1])!) }, pos])
    }
  }

  return (
    <section className="solog-dash__round-section">
      <div className="solog-dash__round-title">
        <div>
          <h5>Precisión histórica y evolución</h5>
          <p>Hasta seis rondas cerradas. Verde/Rojo entre grupos comparables; exentos y sin evidencia fuera del denominador.</p>
        </div>
        <div className="solog-dash__graph-legend" aria-label="Leyenda del gráfico">
          <span><i className="solog-dash__legend-dot solog-dash__legend-dot--green" /> Verde</span>
          <span><i className="solog-dash__legend-dot solog-dash__legend-dot--red" /> Rojo</span>
          <span><i className="solog-dash__legend-line" /> Evolución % verde</span>
        </div>
      </div>
      <div className="solog-dash__history-scroll">
        <svg className="solog-dash__history-svg" width={width} height={255}
          viewBox={`0 0 ${width} 255`} role="img"
          aria-label="Gráfico histórico de hasta seis rondas: barras verdes y rojas, línea de evolución del porcentaje verde. Consulta los detalles numéricos en la tabla inferior.">
          {[0, 25, 50, 75, 100].map(step => (
            <g key={step}>
              <line x1={44} y1={yAt(step)} x2={width - 22} y2={yAt(step)}
                stroke="var(--color-border)" strokeDasharray="3 4" />
              <text x={38} y={yAt(step) + 4} textAnchor="end"
                fill="var(--color-text-secondary)" fontSize={10}>{step} %</text>
            </g>
          ))}
          {rounds.map((item, i) => {
            const x = xAt(i)
            const p = graphPercent(item)
            return (
              <g key={item.round_from}>
                {p === null ? (
                  <>
                    <rect x={x - 18} y={top} width={36} height={height}
                      stroke="var(--color-border-strong)" strokeDasharray="3 4"
                      fill="var(--color-surface-secondary)" />
                    <text x={x} y={top + height / 2} textAnchor="middle"
                      fill="var(--color-text-secondary)" fontSize={10}>N/D</text>
                  </>
                ) : (
                  <>
                    <rect x={x - 18} y={top} width={36} height={height * (100 - p) / 100}
                      fill="var(--color-danger)" opacity={0.8} />
                    <rect x={x - 18} y={yAt(p)} width={36} height={height * p / 100}
                      fill="var(--color-success)" opacity={0.88} />
                  </>
                )}
                <text x={x} y={bottom + 19} textAnchor="middle"
                  fill="var(--color-text-primary)" fontSize={11} fontWeight={650}>
                  R{item.round}
                </text>
                <text x={x} y={bottom + 34} textAnchor="middle"
                  fill="var(--color-text-secondary)" fontSize={10}>
                  {date(item.period_from)}
                </text>
                <text x={x} y={top - 13} textAnchor="middle"
                  fill="var(--color-text-primary)" fontSize={11} fontWeight={700}>
                  {ratio(p)}
                </text>
              </g>
            )
          })}
          {segments.map(([start, end], index) => (
            <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
              stroke="var(--color-primary)" strokeWidth={2.5} />
          ))}
          {rounds.map((item, i) => {
            const p = graphPercent(item)
            return p === null ? null : (
              <circle key={item.round_from} cx={xAt(i)} cy={yAt(p)} r={4.5}
                fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} />
            )
          })}
        </svg>
      </div>
      <div className="admin-auxiliary-table solog-dash__round-history-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Ronda</th>
              <th scope="col" className="admin-table-number">Verdes</th>
              <th scope="col" className="admin-table-number">Rojos</th>
              <th scope="col" className="admin-table-number">Exentos 0/0</th>
              <th scope="col" className="admin-table-number">Sin evidencia</th>
              <th scope="col" className="admin-table-number">Precisión</th>
              <th scope="col">Calidad</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map(item => {
              const h = historyAccuracy(item)
              const reliable = item.quality !== 'no_data' && h !== null
              return (
                <tr key={item.round_from}>
                  <th scope="row">{roundLabel(item)}</th>
                  <td className="admin-table-number">{reliable ? value(h.green) : 'N/D'}</td>
                  <td className="admin-table-number">{reliable ? value(h.red) : 'N/D'}</td>
                  <td className="admin-table-number">{reliable ? value(h.exempt) : 'N/D'}</td>
                  <td className="admin-table-number">{reliable ? value(h.without_evidence) : 'N/D'}</td>
                  <td className="admin-table-number"><strong>{reliable ? ratio(h.percent) : 'N/D'}</strong></td>
                  <td><span className={`solog-dash__quality-tag solog-dash__quality-tag--${item.quality}`}>
                    {qualityLabel(item.quality)}
                  </span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function DashboardRoundsPanel({
  siteId, store,
}: {
  siteId: string
  store: DashboardMetricsStore
}) {
  const query = useDashboardMetrics(store, 'rounds', { site_id: siteId })
  if (query.error) return <QueryState error={query.error} retry={query.retry} variant="compact" />
  if (!query.data) return <QueryState retry={query.retry} variant="compact" />
  return (
    <div className="solog-dash__view solog-dash__round-view">
      <div className="solog-dash__view-heading">
        <div>
          <h4>Rondas de conteo</h4>
          <p>Cobertura, hitos desde el inicio y cortes históricos inmutables.</p>
        </div>
        {query.data.quality === 'partial' && <span className="solog-dash__quality-tag solog-dash__quality-tag--partial">Datos parciales</span>}
      </div>
      <RoundCurrent data={query.data.data} />
      <HistoricalGraph history={query.data.data.history} />
      <p className="solog-dash__footnote">
        <CircleHelp size={14} aria-hidden="true" />
        La precisión histórica es binaria (Verde / Verde + Rojo). Rondas sin evidencia aparecen N/D, nunca como cero.
      </p>
    </div>
  )
}
