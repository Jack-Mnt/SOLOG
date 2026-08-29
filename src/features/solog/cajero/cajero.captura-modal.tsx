import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { CajeroCalculator } from './cajero.calculadora'
import {
  getCajeroBufferRevision,
  readCajeroBuffer,
  readCajeroExpressionDrafts,
  saveCajeroLocalCapture,
  setCajeroExpressionDraft,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import type {
  CajeroBufferScope,
  CajeroCountGroup,
  CajeroCountView,
} from './cajero.types'
import {
  calculateDifference,
  calculateValuation,
  formatCajeroCurrency,
} from './cajero.utils'

export type CajeroCaptureView = Extract<
  CajeroCountView,
  'categoria' | 'stock_cero' | 'stock_negativo' | 'conteo_diario'
>

function differenceClass(value: number | null): string | undefined {
  if (value === null) return undefined
  if (value === 0) return 'is-zero'
  return value < 0 ? 'is-negative' : 'is-positive'
}

function formatDifference(value: number | null): string {
  if (value === null) return '—'
  return value > 0 ? `+${value}` : String(value)
}

export function CajeroCaptureModal({
  categoryName,
  groups,
  scope,
  view,
  disabled,
  lockedGroupIds,
  onClose,
  onNextCategory,
  onObservationSaved,
}: {
  categoryName: string
  groups: readonly CajeroCountGroup[]
  scope: CajeroBufferScope
  view: CajeroCaptureView
  disabled: boolean
  lockedGroupIds?: ReadonlySet<string>
  onClose: () => void
  onNextCategory?: () => void
  onObservationSaved: () => void
}) {
  const titleId = useId()
  const modalRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  useSyncExternalStore(
    subscribeCajeroBufferChanges,
    getCajeroBufferRevision,
    () => 0,
  )

  const buffer = readCajeroBuffer(scope)
  const drafts = readCajeroExpressionDrafts(scope)
  const pendingByGroup = useMemo(
    () => new Map(buffer.items.map((item) => [item.grupo_id, item])),
    [buffer.items],
  )
  const expressionByGroup = useMemo(
    () => new Map(drafts.items.map((item) => [item.grupo_id, item.expresion])),
    [drafts.items],
  )
  const registeredCount = groups.filter((group) =>
    pendingByGroup.has(group.grupo_id),
  ).length
  const percentage = groups.length > 0
    ? Math.round((registeredCount / groups.length) * 100)
    : 0
  const activeIndex = groups.findIndex((group) => group.grupo_id === activeGroupId)
  const activeGroup = activeIndex >= 0 ? groups[activeIndex] : null
  const activePending = activeGroup
    ? pendingByGroup.get(activeGroup.grupo_id) ?? null
    : null
  const activeExpression = activeGroup
    ? expressionByGroup.has(activeGroup.grupo_id)
      ? expressionByGroup.get(activeGroup.grupo_id) ?? ''
      : activePending
        ? String(activePending.stock_fisico)
        : ''
    : ''

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const modal = modalRef.current
    const initialFocus = modal?.querySelector<HTMLElement>('button')
    initialFocus?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !modal) return
      const focusable = [...modal.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const saveActiveGroup = (stockFisico: number) => {
    if (!activeGroup || disabled || lockedGroupIds?.has(activeGroup.grupo_id)) return
    saveCajeroLocalCapture(
      scope,
      {
        grupo_id: activeGroup.grupo_id,
        stock_fisico: stockFisico,
        contado_at: new Date().toISOString(),
        tipo_observacion: 'auto',
        observacion_origen_id: null,
        display: {
          vista: view,
          categoria_id: activeGroup.categoria_id,
          grupo: activeGroup.nombre,
          categoria: activeGroup.categoria,
          stock_teorico: activeGroup.stock_teorico,
          precio: activeGroup.precio,
          ultima_diferencia: activeGroup.ultima_diferencia ?? null,
          motivo_seguimiento: activeGroup.motivo_seguimiento ?? null,
        },
      },
      activeExpression,
    )
    onObservationSaved()
  }

  const navigateNext = () => {
    if (activeIndex < groups.length - 1) {
      setActiveGroupId(groups[activeIndex + 1]?.grupo_id ?? null)
      return
    }
    if (onNextCategory) {
      setActiveGroupId(null)
      onNextCategory()
    }
  }

  const savedDifference = activeGroup && activePending
    ? calculateDifference(activePending.stock_fisico, activeGroup.stock_teorico)
    : null
  const savedValuation = activeGroup && savedDifference !== null
    ? calculateValuation(savedDifference, activeGroup.precio)
    : null
  const activeLocked = activeGroup
    ? disabled || lockedGroupIds?.has(activeGroup.grupo_id) === true
    : disabled

  return (
    <div
      className="cajero-capture-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="cajero-capture-modal"
        ref={modalRef}
        role="dialog"
      >
        <header className="cajero-capture-modal__header">
          <button
            aria-label={activeGroup ? 'Regresar al resumen' : 'Cerrar categoría'}
            className="cajero-capture-modal__icon-button"
            onClick={() => activeGroup ? setActiveGroupId(null) : onClose()}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={22} />
          </button>
          <h2 id={titleId}>{categoryName}</h2>
          <strong>{registeredCount} / {groups.length}</strong>
          <button
            aria-label="Cerrar"
            className="cajero-capture-modal__icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={22} />
          </button>
        </header>
        <div className="cajero-capture-modal__progress" aria-label={`${percentage}% registrado`}>
          <span aria-hidden="true"><span style={{ width: `${percentage}%` }} /></span>
          <strong>{percentage}%</strong>
        </div>

        <div className="cajero-capture-modal__body">
          {activeGroup ? (
            <div className="cajero-capture-detail">
              <section className="cajero-capture-detail__card">
                <h3>{activeGroup.nombre}</h3>
                <dl>
                  <div><dt>Stock TumiSoft</dt><dd>{activeGroup.stock_teorico}</dd></div>
                  <div><dt>Conteo</dt><dd>{activePending?.stock_fisico ?? '—'}</dd></div>
                  <div><dt>Diferencia</dt><dd className={differenceClass(savedDifference)}>{formatDifference(savedDifference)}</dd></div>
                  <div>
                    <dt>Valorizado</dt>
                    <dd className={differenceClass(savedDifference)}>
                      {savedValuation === null
                        ? '—'
                        : savedValuation > 0
                          ? `+${formatCajeroCurrency(savedValuation)}`
                          : formatCajeroCurrency(savedValuation)}
                    </dd>
                  </div>
                </dl>
              </section>
              <CajeroCalculator
                disabled={activeLocked}
                expression={activeExpression}
                onChange={(expression) => {
                  setCajeroExpressionDraft(scope, activeGroup.grupo_id, expression)
                }}
                onSave={saveActiveGroup}
              />
              <nav className="cajero-capture-detail__navigation" aria-label="Navegación entre grupos">
                <button
                  className="button button--secondary"
                  disabled={activeIndex <= 0}
                  onClick={() => setActiveGroupId(groups[activeIndex - 1]?.grupo_id ?? null)}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="button button--secondary"
                  onClick={() => setActiveGroupId(null)}
                  type="button"
                >
                  Regresar
                </button>
                <button
                  className="button"
                  disabled={activeIndex === groups.length - 1 && !onNextCategory}
                  onClick={navigateNext}
                  type="button"
                >
                  {activeIndex === groups.length - 1 ? 'Siguiente categoría' : 'Siguiente'}
                </button>
              </nav>
            </div>
          ) : (
            <div className="cajero-capture-summary">
              <div className="cajero-capture-summary__head" aria-hidden="true">
                <span>Nombre</span><span>Stock TumiSoft</span><span>Diferencia</span><span />
              </div>
              <div className="cajero-capture-summary__rows">
                {groups.map((group) => {
                  const pending = pendingByGroup.get(group.grupo_id)
                  const difference = pending
                    ? calculateDifference(pending.stock_fisico, group.stock_teorico)
                    : null
                  return (
                    <button
                      className={pending ? 'is-counted' : undefined}
                      key={group.grupo_id}
                      onClick={() => setActiveGroupId(group.grupo_id)}
                      type="button"
                    >
                      <strong>{group.nombre}</strong>
                      <span>{group.stock_teorico}</span>
                      <span className={differenceClass(difference)}>{formatDifference(difference)}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
