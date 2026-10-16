import { useEffect, useState } from 'react'
import { ChevronDown, Info, RotateCcw } from 'lucide-react'
import { AdminBinarySwitch, AdminSort } from '../admin.primitives'
import { QueryState } from '../admin.v2.presentation'
import { useDashboardMetrics } from './admin.dashboard.metrics.hooks'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import type {
  EpisodeRow, EpisodeScope, EpisodeSort, MetricsQuality, RiskLevel,
} from './admin.dashboard.metrics.types'

const PAGE_SIZE = 25

const scopeOptions = [
  { value: 'open', label: 'Abiertos' },
  { value: 'closed', label: 'Cerrados' },
] as const

const openSortOptions = [
  { value: 'importance', label: 'Mayor importancia' },
  { value: 'recurrence', label: 'Más recurrencias' },
  { value: 'persistence', label: 'Mayor persistencia' },
] as const

const levels: Record<RiskLevel, string> = {
  bajo: 'Bajo', medio_bajo: 'Medio bajo', medio: 'Medio',
  medio_alto: 'Medio alto', alto: 'Alto', muy_alto: 'Muy alto',
}
const levelTones: Record<RiskLevel, string> = {
  bajo: 'low', medio_bajo: 'low', medio: 'medium',
  medio_alto: 'medium', alto: 'high', muy_alto: 'critical',
}
const count = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const dateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: 'numeric', month: 'short',
  year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
})

function duration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return 'N/D'
  const minutes = Math.floor(hours * 60)
  const days = Math.floor(minutes / 1440)
  const h = Math.floor(minutes % 1440 / 60)
  const min = minutes % 60
  return [days ? `${days} d` : '', h ? `${h} h` : '',
    min || minutes === 0 ? `${min} min` : ''].filter(Boolean).join(' ')
}
function timestamp(time: string | null): string {
  if (!time) return 'En curso'
  const parsed = new Date(time)
  return Number.isFinite(parsed.getTime()) ? dateTime.format(parsed) : 'N/D'
}

interface LoadedEpisodes {
  rows: EpisodeRow[]
  total: number
  nextCursor: string | null
  consumed: string[]
  quality: MetricsQuality
}

/** Instancia nueva al cambiar sede/scope/sort: nunca mezcla cursores de contextos distintos. */
function EpisodePages({ store, siteId, scope, sort }: {
  store: DashboardMetricsStore
  siteId: string
  scope: EpisodeScope
  sort: EpisodeSort
}) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [accumulated, setAccumulated] = useState<LoadedEpisodes | null>(null)
  const query = useDashboardMetrics(store, 'episodes', {
    site_id: siteId, scope, sort, limit: PAGE_SIZE, cursor,
  })

  useEffect(() => {
    if (!query.data) return
    const page = query.data.data
    setAccumulated(previous => {
      if (cursor === null) {
        return {
          rows: page.rows, total: page.total, nextCursor: page.next_cursor,
          consumed: [], quality: query.data!.quality,
        }
      }
      if (previous?.consumed.includes(cursor)) return previous
      const rows = [...(previous?.rows ?? [])]
      const seen = new Set(rows.map(item => item.episode_id))
      for (const row of page.rows) {
        if (!seen.has(row.episode_id)) {
          rows.push(row)
          seen.add(row.episode_id)
        }
      }
      return {
        rows, total: page.total, nextCursor: page.next_cursor,
        consumed: [...(previous?.consumed ?? []), cursor],
        quality: query.data!.quality,
      }
    })
  }, [query.data, cursor])

  const firstPage = cursor === null && query.data
    ? {
        rows: query.data.data.rows, total: query.data.data.total,
        nextCursor: query.data.data.next_cursor,
        consumed: [], quality: query.data.quality,
      }
    : null
  const result = accumulated ?? firstPage
  const pendingPage = cursor !== null && !accumulated?.consumed.includes(cursor)
  const restart = () => {
    setAccumulated(null)
    if (cursor !== null) setCursor(null)
    else query.retry()
  }

  return (
    <div className="solog-dash__episodes-results">
      {result && result.quality === 'partial' && (
        <div className="solog-dash__data-note" role="status">
          <Info size={16} aria-hidden="true" />
          La valoración de riesgo de algunos episodios es parcial.
        </div>
      )}
      {result && result.quality === 'no_data' && (
        <div className="solog-dash__data-note" role="status">
          <Info size={16} aria-hidden="true" />
          No hay evidencia suficiente para una valoración completa.
        </div>
      )}
      {result && result.rows.length > 0 && (
        <div className="admin-main-table solog-dash__results-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                <th scope="col">Inicio</th>
                {scope === 'closed' && <th scope="col">Cierre</th>}
                <th scope="col" className="admin-table-number">Recurrencias (45 d)</th>
                <th scope="col" className="admin-table-number">Persistencia</th>
                <th scope="col">Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map(row => (
                <tr key={row.episode_id}>
                  <th scope="row">{row.group_name}</th>
                  <td>{timestamp(row.opened_at)}</td>
                  {scope === 'closed' && <td>{timestamp(row.closed_at)}</td>}
                  <td className="admin-table-number">{count.format(row.recurrences_45d)}</td>
                  <td className="admin-table-number">{duration(row.duration_hours)}</td>
                  <td>
                    {row.risk_status === 'available' && row.risk_level ? (
                      <span className={`solog-dash__risk-level solog-dash__risk-level--${levelTones[row.risk_level]}`}>
                        {levels[row.risk_level]}
                      </span>
                    ) : (
                      <span className="solog-dash__movement">
                        {row.risk_status === 'pending_confirmation' ? 'Pendiente de confirmación' : 'N/D'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!result && (query.loading || query.error) && (
        <QueryState error={query.error} retry={restart} variant="compact" />
      )}
      {result && result.rows.length === 0 && !query.error && (
        <div className="solog-dash__empty" role="status">
          {scope === 'open' ? 'No hay episodios abiertos con evidencia activa comparable.' :
            'No se registran episodios cerrados en la ventana de 45 días.'}
        </div>
      )}
      {query.error && result && (
        <div className="solog-dash__data-error" role="alert">
          <p>{query.error}</p>
          <button type="button" className="button button--secondary" onClick={restart}>
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar lista
          </button>
        </div>
      )}
      {result && !query.error && (
        <div className="solog-dash__pagination">
          <span className="solog-dash__result-count">
            {result.rows.length} de {result.total} episodios
          </span>
          {result.nextCursor ? (
            <button type="button" className="button button--secondary"
              disabled={query.loading || pendingPage}
              onClick={() => { if (result.nextCursor) setCursor(result.nextCursor) }}>
              <ChevronDown size={16} aria-hidden="true" />
              {query.loading || pendingPage ? 'Cargando…' : 'Mostrar 25 más'}
            </button>
          ) : result.rows.length > 0 ? (
            <span className="solog-dash__result-count">Fin de resultados</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function DashboardEpisodesPanel({ siteId, store }: {
  siteId: string
  store: DashboardMetricsStore
}) {
  const [scope, setScope] = useState<EpisodeScope>('open')
  const [sort, setSort] = useState<EpisodeSort>('importance')

  const changeScope = (next: EpisodeScope) => {
    if (next === scope) return
    setScope(next)
    setSort(next === 'closed' ? 'recent' : 'importance')
  }

  return (
    <div className="solog-dash__view solog-dash__episodes-view">
      <div className="solog-dash__view-heading">
        <div>
          <h4>Episodios de diferencias</h4>
          <p>Apertura, recurrencia y duración desde eventos físicos registrados.</p>
        </div>
        <div className="solog-dash__view-actions">
          <AdminBinarySwitch label="Estado de episodios" value={scope}
            options={scopeOptions} onChange={changeScope} />
          {scope === 'open' && (
            <AdminSort value={sort} defaultValue="importance"
              options={openSortOptions} onChange={setSort} />
          )}
        </div>
      </div>
      <p className="solog-dash__view-context">
        {scope === 'open'
          ? 'Episodios actualmente abiertos. La duración no se limita a 45 días.'
          : 'Episodios cerrados durante los últimos 45 días, ordenados por cierre más reciente.'}
      </p>
      <EpisodePages key={`${siteId}:${scope}:${sort}`}
        siteId={siteId} store={store} scope={scope} sort={sort} />
    </div>
  )
}
