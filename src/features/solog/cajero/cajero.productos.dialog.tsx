import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { formatCajeroCurrency } from './cajero.utils'
import type { CashierV4Group } from './cajero.v4'

interface Props {
  group: CashierV4Group
  onClose: () => void
}

/** Detalle local, de solo lectura: no solicita datos ni modifica el conteo. */
export function CajeroProductosDialog({ group, onClose }: Props) {
  const titleId = useId()
  const listId = useId()
  const dialog = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const scrollRegion = useRef<HTMLDivElement>(null)
  const packageConfigured = group.unidades_por_paquete !== null || group.precio_paquete !== null

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    return () => { if (opener?.isConnected) opener.focus() }
  }, [])

  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    event.stopPropagation()
    if (event.shiftKey && document.activeElement === closeButton.current) {
      event.preventDefault()
      scrollRegion.current?.focus()
    } else if (!event.shiftKey && document.activeElement === scrollRegion.current) {
      event.preventDefault()
      closeButton.current?.focus()
    } else if (!dialog.current?.contains(document.activeElement)) {
      event.preventDefault()
      closeButton.current?.focus()
    }
  }

  return <div className="cajero-productos-backdrop" onClick={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={dialog} className="cajero-productos-dialog" role="dialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={listId} onKeyDown={keyboard}>
      <header className="cajero-productos-dialog__header">
        <div>
          <h2 id={titleId}>Productos incluidos</h2>
          <p id={listId}>{group.nombre} · {group.productos.length} {group.productos.length === 1 ? 'producto' : 'productos'}</p>
        </div>
        <button ref={closeButton} className="cajero-productos-dialog__close"
          type="button" aria-label="Cerrar productos incluidos" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="cajero-productos-dialog__scroll" tabIndex={0} ref={scrollRegion}
        role="region" aria-label="Detalle de productos incluidos">
        {group.productos.length ? <ul className="cajero-productos-dialog__list">
          {group.productos.map(product => <li key={product.c_interno}>
            <div className="cajero-productos-dialog__identity">
              <strong>{product.producto}</strong>
              <span>Código #{product.c_interno}{product.marca ? ` · ${product.marca}` : ''}</span>
            </div>
            <span className="cajero-productos-dialog__price">{formatCajeroCurrency(product.precio)}</span>
          </li>)}
        </ul> : <p className="cajero-productos-dialog__empty">No hay productos incluidos.</p>}
        {packageConfigured && <section className="cajero-productos-dialog__package"
          aria-label="Configuración de paquete del grupo">
          <h3>Configuración de paquete del grupo</h3>
          <dl>
            {group.unidades_por_paquete !== null && <div>
              <dt>Unidades por paquete</dt><dd>{group.unidades_por_paquete}</dd>
            </div>}
            {group.precio_paquete !== null && <div>
              <dt>Precio por paquete</dt><dd>{formatCajeroCurrency(group.precio_paquete)}</dd>
            </div>}
          </dl>
        </section>}
      </div>
    </section>
  </div>
}
