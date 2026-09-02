import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { getSologErrorMessageFromUnknown } from '../errors'
import { getSologDifferenceStateClass, getSologDifferenceStateLabel } from '../labels'
import type { CajeroSessionController } from './cajero.session'
import { CajeroCalculator } from './cajero.calculadora'
import {
  getCajeroBufferRevision,
  readCajeroRecountAttempt,
  saveCajeroRecountAttempt,
  removeCajeroRecountAttempt,
  readCajeroBuffer,
  readCajeroExpressionDrafts,
  saveCajeroLocalCapture,
  setCajeroExpressionDraft,
  subscribeCajeroBufferChanges,
} from './cajero.storage'
import type {
  CajeroRecountStartResponse,
  CajeroRecountResponse,
  CajeroBufferScope,
  CajeroCountGroup,
  CajeroCountView,
} from './cajero.types'
import {
  calculateDifference,
  calculateValuation,
  evaluateCajeroExpression,
  formatCajeroDifference,
  formatCajeroCurrency,
  getCajeroDifferenceClass,
} from './cajero.utils'

export type CajeroCaptureView = Extract<
  CajeroCountView,
  'categoria' | 'stock_cero' | 'stock_negativo' | 'conteo_diario' | 'revisar'
>

export function CajeroCaptureModal({
  categoryName,
  session,
  groups,
  scope,
  view,
  disabled,
  initialGroupId,
  lockedGroupIds,
  onClose,
  onNextCategory,
  onObservationSaved,
}: {
  categoryName: string
  session: CajeroSessionController
  groups: readonly CajeroCountGroup[]
  scope: CajeroBufferScope
  view: CajeroCaptureView
  disabled: boolean
  initialGroupId?: string
  lockedGroupIds?: ReadonlySet<string>
  onClose: () => void
  onNextCategory?: () => void
  onObservationSaved: () => void
}) {
  const titleId = useId()
  const modalRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() =>
    initialGroupId && groups.some((group) => group.grupo_id === initialGroupId)
      ? initialGroupId
      : null,
  )
  useSyncExternalStore(
    subscribeCajeroBufferChanges,
    getCajeroBufferRevision,
    () => 0,
  )

  const review = view === 'revisar'
  const [reference, setReference] = useState<CajeroRecountStartResponse | null>(null)
  const [result, setResult] = useState<CajeroRecountResponse | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
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
  const registeredCount = review ? (result ? 1 : 0) : groups.filter((group) =>
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
  const detailId = review ? activeGroup?.detalle_origen_id ?? null : null
  const draftId = review ? 'recount:' + detailId : activeGroup?.grupo_id ?? ''
  const attempt = detailId ? readCajeroRecountAttempt(scope, detailId) : null
  const activeExpression = result ? String(result.stock_reconteo) : attempt ? String(attempt.stock_fisico) : activeGroup
    ? expressionByGroup.has(draftId)
      ? expressionByGroup.get(draftId) ?? ''
      : activePending
        ? String(activePending.stock_fisico)
        : ''
    : ''

  const beginRecount = session.beginRecount
  useEffect(() => {
    if (!review || !detailId) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setReference(null)
      setResult(null)
      setCaptureError(null)
      void beginRecount(detailId).then((started) => {
        if (active) setReference(started)
      }).catch((startError: unknown) => {
        if (active) setCaptureError(getSologErrorMessageFromUnknown(startError))
      })
    })
    return () => { active = false }
  }, [beginRecount, detailId, review, retry])

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

  const saveActiveGroup = async (stockFisico: number): Promise<boolean> => {
    if (!activeGroup || disabled || saveLock.current || lockedGroupIds?.has(activeGroup.grupo_id)) return false
    saveLock.current = true
    setSaving(true)
    setCaptureError(null)
    try {
      if (review) {
        if (!detailId || !reference || reference.detalle_id !== detailId || result) return false
        const payload = saveCajeroRecountAttempt(scope, detailId, stockFisico, session.captureTimestamp())
        const saved = await session.saveRecount(detailId, payload.stock_fisico, payload.contado_at)
        removeCajeroRecountAttempt(scope, detailId)
        setResult(saved)
      } else {
        saveCajeroLocalCapture(scope, {
          grupo_id: activeGroup.grupo_id,
          stock_fisico: stockFisico,
          contado_at: session.captureTimestamp(),
          display: {
            vista: view,
            categoria_id: activeGroup.categoria_id,
            grupo: activeGroup.nombre,
            categoria: activeGroup.categoria,
            stock_teorico: activePending?.display.stock_teorico ?? activeGroup.stock_teorico,
            precio: activeGroup.precio,
          },
        }, activeExpression)
        onObservationSaved()
      }
      return true
    } catch (saveError) {
      setCaptureError(getSologErrorMessageFromUnknown(saveError))
      if (review) setReference(null)
      return false
    } finally {
      saveLock.current = false
      setSaving(false)
    }
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

  const expressionEvaluation = evaluateCajeroExpression(activeExpression)
  const hasExpression = activeExpression.trim().length > 0
  const canNavigateNext = activeIndex < groups.length - 1 || Boolean(onNextCategory)
  const continueDisabled = review || saving || (
    hasExpression
      ? expressionEvaluation.status !== 'valid'
      : !canNavigateNext
  )

  const continueToNext = async () => {
    if (review || continueDisabled) return
    if (!hasExpression) {
      navigateNext()
      return
    }
    if (
      expressionEvaluation.status === 'valid' &&
      expressionEvaluation.value !== null &&
      await saveActiveGroup(expressionEvaluation.value)
    ) {
      if (canNavigateNext) navigateNext()
      else setActiveGroupId(null)
    }
  }

  const theoretical = review ? reference?.stock_teorico_reconteo ?? null
    : activePending?.display.stock_teorico ?? activeGroup?.stock_teorico ?? null
  const physical = result?.stock_reconteo ?? attempt?.stock_fisico ?? activePending?.stock_fisico ?? null
  const savedDifference = result?.diferencia ?? (
    theoretical !== null && physical !== null ? calculateDifference(physical, theoretical) : null
  )
  const savedValuation = activeGroup && savedDifference !== null
    ? calculateValuation(savedDifference, activeGroup.precio)
    : null
  const activeLocked = activeGroup
    ? disabled || saving || (review && (!reference || Boolean(result))) || lockedGroupIds?.has(activeGroup.grupo_id) === true
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
            aria-label={activeGroup ? 'Regresar a la lista' : 'Cerrar categoría'}
            className="cajero-capture-modal__icon-button"
            onClick={() => activeGroup
              ? review
                ? onClose()
                : setActiveGroupId(null)
              : onClose()}
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

        <div
          className={`cajero-capture-modal__body${activeGroup ? ' cajero-capture-modal__body--detail' : ''}`}
        >
          {activeGroup ? (
            <div className="cajero-capture-detail">
              <div className="cajero-capture-detail__information">
                <section className={`cajero-capture-detail__card${review ? ' cajero-capture-detail__card--review' : ''}`}>
                  <h3>{activeGroup.nombre}</h3>
                  <dl>
                    <div><dt>Stock TumiSoft</dt><dd>{theoretical ?? '—'}</dd></div>
                    <div><dt>Conteo</dt><dd>{physical ?? '—'}</dd></div>
                    {review ? (
                      <>
                        <div><dt>Última diferencia</dt><dd className={getCajeroDifferenceClass(activeGroup.ultima_diferencia ?? null)}>{formatCajeroDifference(activeGroup.ultima_diferencia ?? null)}</dd></div>
                        <div><dt>Motivo</dt><dd>Recontar</dd></div>
                      </>
                    ) : null}
                    <div><dt>{review ? 'Diferencia actual' : 'Diferencia'}</dt><dd className={getCajeroDifferenceClass(savedDifference)}>{formatCajeroDifference(savedDifference)}</dd></div>
                    <div>
                      <dt>Valorizado</dt>
                      <dd className={getCajeroDifferenceClass(savedDifference)}>
                        {savedValuation === null
                          ? '—'
                          : savedValuation > 0
                            ? `+${formatCajeroCurrency(savedValuation)}`
                            : formatCajeroCurrency(savedValuation)}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
              {captureError ? (
                <div className="cajero-alert cajero-alert--error" role="alert">
                  <p>{captureError}</p>
                  {review && !result ? <button className="button" type="button" onClick={() => setRetry((value) => value + 1)}>Consultar y reanudar</button> : null}
                </div>
              ) : null}
              {review && !reference && !captureError ? <p role="status">Iniciando reconteo…</p> : null}
              {result ? <p role="status"><span className={`control-state-badge control-state-badge--${getSologDifferenceStateClass(result.estado_diferencia)}`}>{getSologDifferenceStateLabel(result.estado_diferencia)}</span> Diferencia final: {formatCajeroDifference(result.diferencia)}</p> : null}
              <CajeroCalculator
                disabled={activeLocked}
                expression={activeExpression}
                variant={review ? 'review' : 'normal'}
                onChange={(expression) => {
                  if (!attempt) setCajeroExpressionDraft(scope, draftId, expression)
                }}
                onSave={(physical) => void saveActiveGroup(physical)}
              />
              <nav className="cajero-capture-detail__navigation" aria-label="Navegación entre grupos">
                <button
                  className="button button--secondary"
                  disabled={review || saving || activeIndex <= 0}
                  onClick={() => setActiveGroupId(groups[activeIndex - 1]?.grupo_id ?? null)}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="button button--secondary"
                  onClick={() => review ? onClose() : setActiveGroupId(null)}
                  type="button"
                >
                  Regresar
                </button>
                <button
                  className="button"
                  disabled={continueDisabled}
                  onClick={() => void continueToNext()}
                  type="button"
                >
                  {review ? 'Siguiente' : hasExpression ? 'Continuar' : 'Siguiente'}
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
                      <span className={getCajeroDifferenceClass(difference)}>{formatCajeroDifference(difference)}</span>
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
