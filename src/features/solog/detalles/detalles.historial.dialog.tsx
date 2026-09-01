import {
  AlertCircle,
  History,
  Layers3,
  LoaderCircle,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getSologDetailsHistory } from '../api'
import {
  deriveCajeroCategories,
  filterCajeroByCategory,
  formatCajeroCurrency,
  formatCajeroDifference,
  getCajeroCategoryIcon,
  getCajeroDifferenceClass,
} from '../cajero/cajero.utils'
import { useSolog } from '../context'
import { getSologErrorMessageFromUnknown } from '../errors'
import {
  getSologDifferenceStateClass,
  getSologDifferenceStateLabel,
} from '../labels'
import type {
  SologDetailsHistoryPeriod,
  SologDetailsHistoryResponse,
} from '../types'

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Lima',
})

function formatHistoryTime(value: string): string {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? '—' : timeFormatter.format(parsed)
}

function formatHistoryValuation(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${formatCajeroCurrency(value)}`
}

export function SologDetailsHistoryDialog({
  onClose,
}: {
  onClose: () => void
}) {
  const { updateServerNow } = useSolog()
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const requestVersion = useRef(0)
  const cache = useRef(
    new Map<SologDetailsHistoryPeriod, SologDetailsHistoryResponse>(),
  )
  const [period, setPeriod] = useState<SologDetailsHistoryPeriod>('hoy')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  )
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [history, setHistory] = useState<SologDetailsHistoryResponse | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const loadHistory = useCallback(async () => {
    const currentRequest = ++requestVersion.current
    const cached = cache.current.get(period)
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
      const response = await getSologDetailsHistory(period)
      if (currentRequest !== requestVersion.current) return

      cache.current.set(period, response)
      updateServerNow(response.server_now)
      setHistory(response)
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [period, updateServerNow])

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

  const items = useMemo(() => history?.items ?? [], [history?.items])
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

  const selectPeriod = (nextPeriod: SologDetailsHistoryPeriod) => {
    if (nextPeriod === period) return
    setSelectedCategoryId(null)
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
    <div
      className="details-history-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="details-history-dialog"
        role="dialog"
      >
        <header className="details-history-dialog__header">
          <div>
            <h2 id={titleId}>Historial de la sede</h2>
            <p>Observaciones registradas por todos los cajeros de esta sede.</p>
          </div>
          <button
            aria-label="Cerrar historial"
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="details-history-dialog__toolbar">
          <div
            aria-label="Período del historial"
            className="cajero-history-tabs"
            role="group"
          >
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

        <div className="details-history-dialog__body">
          {history ? (
            <div
              aria-label="Categoría del historial"
              className="cajero-selection-grid cajero-history-categories"
            >
              <button
                aria-pressed={effectiveCategoryId === null}
                className={effectiveCategoryId === null ? 'is-active' : undefined}
                onClick={() => setSelectedCategoryId(null)}
                type="button"
              >
                <Layers3 aria-hidden="true" size={23} />
                <span>
                  <strong>Todas</strong>
                  <small>
                    {items.length}{' '}
                    {items.length === 1 ? 'observación' : 'observaciones'}
                  </small>
                </span>
              </button>
              {categories.map((category) => {
                const Icon = getCajeroCategoryIcon(category.nombre)
                return (
                  <button
                    aria-pressed={effectiveCategoryId === category.id}
                    className={
                      effectiveCategoryId === category.id ? 'is-active' : undefined
                    }
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={23} />
                    <span>
                      <strong>{category.nombre}</strong>
                      <small>
                        {category.count}{' '}
                        {category.count === 1 ? 'observación' : 'observaciones'}
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {error ? (
            <div className="cajero-alert cajero-alert--error" role="alert">
              <AlertCircle aria-hidden="true" size={21} />
              <p>{error}</p>
              <button
                className="button button--secondary"
                onClick={() => void loadHistory()}
                type="button"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="cajero-loading" role="status">
              <LoaderCircle aria-hidden="true" className="spin" size={24} />
              Cargando historial…
            </div>
          ) : history && visibleItems.length > 0 ? (
            <div className="cajero-history-list">
              <div className="cajero-history-list__head" aria-hidden="true">
                <span>Nombre</span>
                <span>Diferencia</span>
                <span>Valorizado</span>
                <span>+</span>
              </div>
              <div className="cajero-history-list__rows">
                {visibleItems.map((item) => {
                  const expanded = expandedItemIds.has(item.detalle_id)
                  const differenceClass = getCajeroDifferenceClass(
                    item.diferencia,
                  )
                  return (
                    <article
                      className={expanded ? 'is-expanded' : undefined}
                      key={item.detalle_id}
                    >
                      <div className="cajero-history-list__summary">
                        <strong title={item.grupo}>{item.grupo}</strong>
                        <span className={differenceClass}>
                          {formatCajeroDifference(item.diferencia)}
                        </span>
                        <span className={differenceClass}>
                          {formatHistoryValuation(item.valor_diferencia)}
                        </span>
                        <button
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Contraer' : 'Expandir'} detalle de ${item.grupo}`}
                          onClick={() => toggleExpandedItem(item.detalle_id)}
                          type="button"
                        >
                          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                        </button>
                      </div>
                      {expanded ? (
                        <dl className="cajero-history-list__detail">
                          <div><dt>Hora</dt><dd>{formatHistoryTime(item.contado_at)}</dd></div>
                          <div>
                            <dt>Estado</dt>
                            <dd>
                              <span className={`control-state-badge control-state-badge--${getSologDifferenceStateClass(item.estado_diferencia)}`}>
                                {getSologDifferenceStateLabel(item.estado_diferencia)}
                              </span>
                            </dd>
                          </div>
                          <div><dt>Stock TumiSoft</dt><dd>{item.stock_teorico}</dd></div>
                          <div><dt>Conteo</dt><dd>{item.stock_fisico}</dd></div>
                          <div><dt>Stock posterior</dt><dd>{item.stock_posterior ?? '—'}</dd></div>
                          <div><dt>Reconteo</dt><dd>{item.stock_reconteo ?? '—'}</dd></div>
                          <div><dt>Hora de reconteo</dt><dd>{item.recontado_at ? formatHistoryTime(item.recontado_at) : '—'}</dd></div>
                        </dl>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </div>
          ) : !error ? (
            <div className="cajero-empty-state" role="status">
              <History aria-hidden="true" size={28} />
              <div>
                <strong>
                  {selectedCategoryId === null
                    ? `No hay observaciones para ${period === 'hoy' ? 'hoy' : 'ayer'}.`
                    : 'No hay observaciones en esta categoría.'}
                </strong>
                <p>El historial corresponde a toda la sede.</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
