import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { formatCajeroCurrency } from './cajero.utils'
import type { CashierV4Group } from './cajero.v4'
import type { FullGroup } from './full.contract'

interface Props {
  group: CashierV4Group | FullGroup
  onClose: () => void
}

/** Detalle local, de solo lectura: no solicita datos ni modifica el conteo. */
export function CajeroProductosDialog({ group, onClose }: Props) {
  const titleId = useId()
  const listId = useId()
  const dialog = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const scrollRegion = useRef<HTMLDivElement>(null)
  const isFull = 'group_id' in group
  const name = isFull ? group.group_name : group.nombre
  const products = isFull
    ? group.members.map(item => ({
        c_interno: item.c_interno,
        name: item.product,
        brand: null as string | null,
        price: item.price,
      }))
    : group.productos.map(item => ({
        c_interno: item.c_interno,
        name: item.producto,
        brand: item.marca,
        price: item.precio,
      }))
  const unitsPerPackage = isFull ? group.units_per_package : group.unidades_por_paquete
  const packagePrice = isFull ? group.package_price : group.precio_paquete
  const packageConfigured = unitsPerPackage !== null || packagePrice !== null

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
          <p id={listId}>{name} · {products.length} {products.length === 1 ? 'producto' : 'productos'}</p>
        </div>
        <button ref={closeButton} className="cajero-productos-dialog__close"
          type="button" aria-label="Cerrar productos incluidos" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="cajero-productos-dialog__scroll" tabIndex={0} ref={scrollRegion}
        role="region" aria-label="Detalle de productos incluidos">
        {products.length ? <ul className="cajero-productos-dialog__list">
          {products.map(product => <li key={product.c_interno}>
            <div className="cajero-productos-dialog__identity">
              <strong>{product.name}</strong>
              <span>Código #{product.c_interno}{product.brand ? ` · ${product.brand}` : ''}</span>
            </div>
            <span className="cajero-productos-dialog__price">{formatCajeroCurrency(product.price)}</span>
          </li>)}
        </ul> : <p className="cajero-productos-dialog__empty">No hay productos incluidos.</p>}
        {packageConfigured && <section className="cajero-productos-dialog__package"
          aria-label="Configuración de paquete del grupo">
          <h3>Configuración de paquete del grupo</h3>
          <dl>
            {unitsPerPackage !== null && <div>
              <dt>Unidades por paquete</dt><dd>{unitsPerPackage}</dd>
            </div>}
            {packagePrice !== null && <div>
              <dt>Precio por paquete</dt><dd>{formatCajeroCurrency(packagePrice)}</dd>
            </div>}
          </dl>
        </section>}
      </div>
    </section>
  </div>
}
