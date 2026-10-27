import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
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
  onClear: () => void
  onOmit: () => void
}

/** Diálogo de captura local: Aplicar no ejecuta una RPC por sí mismo. */
export function CajeroObservacionDialog({
  initialReason, initialText, priorReason, priorText,
  isRecount, isResolved, mandatory, onApply, onCancel, onClear, onOmit,
}: Props) {
  const titleId = useId()
  const subtitleId = useId()
  const [reason, setReason] = useState<CashierDifferenceReason | null>(priorReason ?? initialReason)
  const [note, setNote] = useState(isResolved ? '' : initialText ?? '')
  const root = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const fixedReason = isRecount && priorReason !== null
  const canApply = isResolved
    ? note.trim().length === 0
    : reason !== null && hasCashierObservationText(note) && !(isRecount && note.trim() === 'Resuelto')
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])

  const keyboard = (e: KeyboardEvent<HTMLElement>) => {
    // La ventana de captura no debe recibir teclas del diálogo superior.
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    e.stopPropagation()

    const dialog = root.current
    if (!dialog) return
    // Un conjunto nativo de radios equivale a un solo tab stop:
    // Tab entra/sale del grupo, flechas cambian la opción y Espacio la selecciona.
    const radios = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)')]
    const tabbableRadio = radios.find(radio => radio.checked) ?? radios[0]
    const nodes = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
    )].filter(node => {
      if (node instanceof HTMLInputElement && node.type === 'radio') return node === tabbableRadio
      return node.tabIndex >= 0 && node.getClientRects().length > 0
    })
    const first = nodes[0], last = nodes.at(-1)
    if (!first || !last) { e.preventDefault(); dialog.focus(); return }
    const active = document.activeElement
    if (e.shiftKey && (active === first || !dialog.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }
  return <div className="cajero-observacion-backdrop">
    <section ref={root} className="cajero-observacion-dialog" role="dialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={subtitleId} tabIndex={-1} onKeyDown={keyboard}>
      <div className="cajero-observacion-dialog__header">
        <div>
          <h2 id={titleId}>{mandatory ? 'Explica esta diferencia' : 'Motivo y observación'}</h2>
          <p className="cajero-observacion-dialog__subtitle" id={subtitleId}>
            {isResolved ? 'Revisa el resultado del reconteo.' :
              mandatory ? 'Selecciona un motivo y explica la diferencia para continuar.' :
                'Registra el motivo y explica lo ocurrido.'}
          </p>
        </div>
        <button type="button" aria-label="Cerrar observación" className="cajero-observacion-dialog__close"
          ref={closeButton} onClick={onCancel}><X size={20} aria-hidden="true" /></button>
      </div>
      {priorText !== null && isRecount ? <div className="cajero-observacion-dialog__original">
        <strong>Observación del conteo original</strong>
        <p>{priorText}</p>
      </div> : null}
      <fieldset className="cajero-observacion-dialog__choices">
        <legend>Motivo de diferencia</legend>
        {CASHIER_DIFFERENCE_REASONS.map(value => <label key={value}
          className={[reason === value ? 'is-selected' : '', fixedReason ? 'is-locked' : ''].filter(Boolean).join(' ')}>
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
        {!mandatory ? <button className="button button--secondary cajero-observacion-dialog__action-auxiliary" type="button" onClick={onClear}>
          Limpiar
        </button> : null}
        {mandatory ? <button className="button button--secondary cajero-observacion-dialog__action-auxiliary" type="button" onClick={onOmit}>
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
