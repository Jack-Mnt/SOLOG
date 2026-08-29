import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  History,
  Layers3,
  LoaderCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { CajeroSessionController } from './cajero.session'
import type {
  CajeroHistoryPeriod,
  CajeroHistoryResponse,
} from './cajero.types'
import {
  deriveCajeroCategories,
  filterCajeroByCategory,
  formatCajeroCurrency,
  formatCajeroDifference,
  getCajeroCategoryIcon,
  getCajeroDifferenceClass,
  getObservationTypeLabel,
  sortHistoryNewestFirst,
} from './cajero.utils'

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
})

function formatHistoryTime(value: string): string {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? '—' : timeFormatter.format(parsed)
}

function formatHistoryValuation(value: number): string {
  return `${value > 0 ? '+' : ''}${formatCajeroCurrency(value)}`
}

export function CajeroHistorial({ session }: { session: CajeroSessionController }) {
  const [period, setPeriod] = useState<CajeroHistoryPeriod>('hoy')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [history, setHistory] = useState<CajeroHistoryResponse | null>(() =>
    session.getCachedHistory('hoy'),
  )
  const [loading, setLoading] = useState(history === null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const getCachedHistory = session.getCachedHistory
  const loadCachedHistory = session.loadHistory

  const loadHistory = useCallback(async () => {
    const currentRequest = ++requestVersion.current
    const cached = getCachedHistory(period)
    if (cached) {
      setHistory(cached)
      setLoading(false)
      setError(null)
      return
    }

    setHistory(null)
    setLoading(true)
    setError(null)
    try {
      const response = await loadCachedHistory(period)
      if (currentRequest !== requestVersion.current) return
      setHistory(response)
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [getCachedHistory, loadCachedHistory, period])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadHistory()
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [loadHistory])

  const items = useMemo(
    () => sortHistoryNewestFirst(history?.items ?? []),
    [history?.items],
  )
  const categories = useMemo(() => deriveCajeroCategories(items), [items])
  const effectiveCategoryId =
    selectedCategoryId !== null &&
    categories.some((category) => category.id === selectedCategoryId)
      ? selectedCategoryId
      : null
  const visibleItems = useMemo(
    () => filterCajeroByCategory(items, effectiveCategoryId),
    [effectiveCategoryId, items],
  )

  const selectPeriod = (nextPeriod: CajeroHistoryPeriod) => {
    if (nextPeriod === period) return
    const nextHistory = getCachedHistory(nextPeriod)
    if (
      selectedCategoryId !== null &&
      (!nextHistory ||
        !nextHistory.items.some(
          (item) => item.categoria_id === selectedCategoryId,
        ))
    ) {
      setSelectedCategoryId(null)
    }
    setPeriod(nextPeriod)
  }

  const toggleExpandedItem = (detailId: string) => {
    setExpandedItemIds((current) => {
      const next = new Set(current)
      if (next.has(detailId)) next.delete(detailId)
      else next.add(detailId)
      return next
    })
  }

  return (
    <section className="cajero-module" aria-labelledby="cajero-historial-title">
      <div className="cajero-module__heading cajero-history__heading">
        <div>
          <h1 id="cajero-historial-title">Historial</h1>
          <p>Registra la realidad</p>
        </div>
        <div className="cajero-history-tabs" aria-label="Período del historial" role="group">
          {(['hoy', 'ayer'] as const).map((option) => (
            <button
              aria-pressed={period === option}
              className={period === option ? 'is-active' : undefined}
              key={option}
              onClick={() => selectPeriod(option)}
              type="button"
            >
              {option === 'hoy' ? 'Hoy' : 'Ayer'}
            </button>
          ))}
        </div>
      </div>

      {history ? (
        <div className="cajero-selection-grid cajero-history-categories" aria-label="Categoría del historial">
          <button
            aria-pressed={effectiveCategoryId === null}
            className={effectiveCategoryId === null ? 'is-active' : undefined}
            onClick={() => setSelectedCategoryId(null)}
            type="button"
          >
            <Layers3 aria-hidden="true" size={23} />
            <span>
              <strong>Todas</strong>
              <small>{items.length} {items.length === 1 ? 'observación' : 'observaciones'}</small>
            </span>
          </button>
          {categories.map((category) => {
            const Icon = getCajeroCategoryIcon(category.nombre)
            return (
              <button
                aria-pressed={effectiveCategoryId === category.id}
                className={effectiveCategoryId === category.id ? 'is-active' : undefined}
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={23} />
                <span>
                  <strong>{category.nombre}</strong>
                  <small>{category.count} {category.count === 1 ? 'observación' : 'observaciones'}</small>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {error ? (
        <div className="cajero-alert cajero-alert--error" role="alert">
          <AlertCircle aria-hidden="true" size={21} /><p>{error}</p>
          <button className="button button--secondary" onClick={() => void loadHistory()} type="button">Reintentar</button>
        </div>
      ) : null}

      {loading ? (
        <div className="cajero-loading" role="status"><LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando historial…</div>
      ) : history && visibleItems.length > 0 ? (
        <div className="cajero-count-table-wrap cajero-history-table-wrap">
          <table className="cajero-count-table cajero-history-table">
            <thead><tr><th>Hora</th><th>Grupo</th><th>Tipo</th><th>TumiSoft</th><th>Conteo</th><th>Diferencia</th><th>Valorizado</th></tr></thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.detalle_id}>
                  <td data-label="Hora">{formatHistoryTime(item.contado_at)}</td>
                  <td data-label="Grupo"><strong>{item.grupo}</strong></td>
                  <td data-label="Tipo"><span className="cajero-observation-type">{getObservationTypeLabel(item.tipo_observacion)}</span></td>
                  <td data-label="TumiSoft">{item.stock_teorico}</td>
                  <td data-label="Conteo">{item.stock_fisico}</td>
                  <td data-label="Diferencia" className={item.diferencia === 0 ? 'is-zero' : item.diferencia < 0 ? 'is-negative' : 'is-positive'}>{item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}</td>
                  <td data-label="Valorizado">{formatCajeroCurrency(item.valor_diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="cajero-empty-state" role="status">
          <History aria-hidden="true" size={28} />
          <div>
            <strong>{selectedCategoryId === null ? `No hay observaciones para ${period === 'hoy' ? 'hoy' : 'ayer'}.` : 'No hay observaciones en esta categoría.'}</strong>
            <p>El historial muestra únicamente capturas confirmadas por SOLOG.</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
