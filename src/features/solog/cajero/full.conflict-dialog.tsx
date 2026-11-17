import { useEffect, useId, useRef } from 'react'
import type { FullBatchConflict } from './full.runtime'

/** Confirmación B5: no ejecuta V7; el runtime vuelve a comprobar la evidencia. */
export function FullConflictDialog({
  conflict, groupName, busy, onCancel, onConfirm,
}: {
  conflict: FullBatchConflict
  groupName: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  const detailsId = useId()
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onCancel()
        return
      }
      if (event.key !== 'Tab' || !root.current) return
      const buttons = [...root.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      const first = buttons[0], last = buttons.at(-1)
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
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return <div className="cajero-confirmation-backdrop">
    <section ref={root} className="cajero-confirmation" role="dialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={detailsId}>
      <h2 id={titleId}>{conflict.code === 'NORMAL_COUNT_ALREADY_IN_SHIFT'
        ? 'Conteo duplicado en el turno' : 'Conteo bloqueado por inconsistencia'}</h2>
      <div id={detailsId}>
        <p>El servidor rechazó el lote completo, sin confirmar ninguna de sus observaciones.
          Identificó como conflictiva la observación del grupo {' '}{groupName}.</p>
        <p>Si confirmas, esta observación y el rechazo original quedarán archivados únicamente
          en este dispositivo. Los otros {conflict.retainedDraftCount} borradores
          conservarán sus identificadores y fechas para que puedas registrarlos después,
          siempre que sigan autorizados. <strong>No se enviará nada automáticamente.</strong></p>
        <p>Antes de continuar, puedes exportar el diagnóstico para conservar una copia adicional.</p>
      </div>
      <div className="cajero-confirmation__actions">
        <button type="button" className="button button--secondary"
          disabled={busy} onClick={onCancel}>Cancelar</button>
        <button type="button" className="button" disabled={busy}
          onClick={onConfirm}>Apartar observación conflictiva</button>
      </div>
    </section>
  </div>
}
