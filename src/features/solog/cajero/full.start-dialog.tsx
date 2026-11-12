import { useEffect, useId, useRef } from 'react'
import { Clock3, RefreshCw } from 'lucide-react'
import type { CashierStartOfferV3 } from './full.contract'

/**
 * El respaldo requiere una decisión humana explícita.
 * Este diálogo no inicia sesiones ni consulta V6 por sí mismo.
 */
export function FullStartFallbackDialog({
  offer, waitingSeconds, checking, busy, onWait, onUse, onCancel,
}: {
  offer: CashierStartOfferV3
  waitingSeconds: number | null
  checking: boolean
  busy: boolean
  onWait: () => void
  onUse: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const detailsId = useId()
  const root = useRef<HTMLElement>(null)
  const closeAction = useRef(onCancel)
  useEffect(() => { closeAction.current = onCancel }, [onCancel])
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAction.current()
        return
      }
      if (event.key !== 'Tab' || !root.current) return
      const controls = [...root.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      const first = controls[0], last = controls.at(-1)
      if (!first || !last) return
      if (!root.current.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return <div className="cajero-confirmation-backdrop cajero-start-backdrop">
    <section ref={root} className="cajero-confirmation cajero-start-fallback" role="dialog"
      aria-modal="true" aria-labelledby={titleId} aria-describedby={detailsId}>
      <div className="cajero-start-fallback__heading">
        <Clock3 size={23} aria-hidden="true"/>
        <h2 id={titleId}>Inventario no actualizado disponible</h2>
      </div>
      <p id={detailsId}>La nueva actualización todavía no está disponible. Hay un inventario anterior
        que continúa vigente, pero requiere tu confirmación para comenzar el conteo.</p>
      {waitingSeconds !== null
        ? <p className="cajero-start-fallback__status" role="status">
          Esperando actualización: {waitingSeconds} s. Se consultará el inventario una sola vez al terminar.
        </p>
        : checking
          ? <p className="cajero-start-fallback__status" role="status">
            <RefreshCw size={16} aria-hidden="true"/> Comprobando inventario actualizado…
          </p>
          : <p className="cajero-start-fallback__status">
            Puedes esperar una nueva actualización o usar ahora el respaldo vigente.
          </p>}
      <div className="cajero-confirmation__actions cajero-start-fallback__actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="button button--secondary"
          disabled={busy || checking || waitingSeconds !== null} onClick={onWait}>
          <Clock3 size={17} aria-hidden="true"/> Esperar 30 segundos (Recomendado)
        </button>
        <button type="button" className="button"
          disabled={busy || checking || !offer.can_start} onClick={onUse}>
          Utilizar inventario válido
        </button>
      </div>
    </section>
  </div>
}
