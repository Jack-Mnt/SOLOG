import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  CASHIER_DIFFERENCE_REASONS, hasCashierObservationText,
  type CashierDifferenceReason,
} from './cajero.observaciones.v5'

interface Props {
  initialReason: CashierDifferenceReason | null
  initialText: string | null
  priorReason: CashierDifferenceReason | null
  priorText: string | null
  isRecount: boolean
  isResolved: boolean
  mandatory: boolean
  onApply: (reason: CashierDifferenceReason | null, note: string | null) => void
  onCancel: () => void
  onOmit: () => void
}

/** Diálogo de captura local: Aplicar no ejecuta una RPC por sí mismo. */
export function CajeroObservacionDialog({
  initialReason, initialText, priorReason, priorText,
  isRecount, isResolved, mandatory, onApply, onCancel, onOmit,
}: Props) {
  const titleId = useId()
  const [reason, setReason] = useState<CashierDifferenceReason | null>(priorReason ?? initialReason)
  const [note, setNote] = useState(isResolved ? '' : initialText ?? '')
  const root = useRef<HTMLElement>(null)
  const fixedReason = isRecount && priorReason !== null
  const canApply = isResolved
    ? note.trim().length === 0
    : reason !== null && hasCashierObservationText(note)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled)')?.focus()
    return () => previous?.focus()
  }, [])
  const keyboard = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return }
    if (e.key !== 'Tab') return
    e.stopPropagation()
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    ) ?? [])]
    const first = nodes[0], last = nodes.at(-1)
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }
  return <div className="cajero-observacion-backdrop">
    <section ref={root} className="cajero-observacion-dialog" role="dialog" aria-modal="true"
      aria-labelledby={titleId} onKeyDown={keyboard}>
      <div className="cajero-observacion-dialog__header">
        <h2 id={titleId}>{mandatory ? 'Explica esta diferencia' : 'Motivo y observación'}</h2>
        <button type="button" aria-label="Cerrar observación" className="cajero-observacion-dialog__close"
          onClick={onCancel}>×</button>
      </div>
      {priorText !== null && isRecount ? <div className="cajero-observacion-dialog__original">
        <strong>Observación del conteo original</strong>
        <p>{priorText}</p>
      </div> : null}
      <fieldset className="cajero-observacion-dialog__choices">
        <legend>Motivo de diferencia</legend>
        {CASHIER_DIFFERENCE_REASONS.map(value => <label key={value}>
          <input type="radio" name="motivo-diferencia" checked={reason === value}
            disabled={fixedReason} onChange={() => setReason(value)} />
          <span>{value}</span>
        </label>)}
      </fieldset>
      {fixedReason ? <p className="cajero-observacion-dialog__hint">
        El motivo original se conserva durante el reconteo.
      </p> : null}
      {isResolved ? <p className="cajero-observacion-dialog__resolved">
        El reconteo coincide con el stock teórico. SOLOG registrará automáticamente «Resuelto».
      </p> : <>
        <label className="cajero-observacion-dialog__textarea" htmlFor={titleId + '-note'}>
          Explicación
          <textarea id={titleId + '-note'} value={note} onChange={e => setNote(e.target.value)}
            rows={4} placeholder="Describe brevemente lo sucedido" />
        </label>
        <p className="cajero-observacion-dialog__hint">
          Mínimo 3 caracteres. {note.trim().length} escritos.
        </p>
      </>}
      <div className="cajero-observacion-dialog__actions">
        {mandatory ? <button className="button button--secondary" type="button" onClick={onOmit}>
          Omitir producto
        </button> : null}
        <button className="button button--secondary" type="button" onClick={onCancel}>Cancelar</button>
        <button className="button" type="button" disabled={!canApply}
          onClick={() => onApply(reason, isResolved ? null : note.trim())}>
          Aplicar
        </button>
      </div>
    </section>
  </div>
}
