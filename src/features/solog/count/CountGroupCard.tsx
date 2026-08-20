import { useState, type FormEvent } from 'react'
import type {
  SologBatchResultItem,
  SologCountGroup,
  SologPendingCapture,
} from '../types'

interface CountGroupCardProps {
  group: SologCountGroup
  result?: SologBatchResultItem
  pending?: SologPendingCapture
  captureDisabled: boolean
  onCapture: (grupoId: string, stockFisico: number) => void
}

function formatSignedInteger(value: number): string {
  return value > 0 ? `+${value}` : value.toString()
}

export function CountGroupCard({
  group,
  result,
  pending,
  captureDisabled,
  onCapture,
}: CountGroupCardProps) {
  const [physicalStock, setPhysicalStock] = useState('')
  const inputId = `stock-${group.grupo_id}`
  const parsedStock = Number(physicalStock)
  const validStock =
    /^\d+$/.test(physicalStock) &&
    Number.isSafeInteger(parsedStock) &&
    parsedStock >= 0
  const resolved = group.contado || Boolean(pending) || Boolean(result)
  const disabled = resolved || captureDisabled

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validStock || disabled) return
    onCapture(group.grupo_id, parsedStock)
  }

  const statusLabel = result
    ? result.diferencia === 0
      ? 'Coincide'
      : 'Pendiente'
    : pending
      ? 'Contado · pendiente de enviar'
      : group.contado
        ? 'Enviado'
      : 'Pendiente de captura'

  return (
    <article className={`count-group${resolved ? ' count-group--done' : ''}`}>
      <div className="count-group__heading">
        <div>
          <h3>{group.nombre}</h3>
          <p>
            Stock teórico: <strong>{group.stock_teorico}</strong>
          </p>
        </div>
        <span className="count-state">{resolved ? <Check aria-hidden="true" size={15} /> : <Cloud aria-hidden="true" size={15} />}{statusLabel}</span>
      </div>

      {result ? (
        <dl className="count-result">
          <div>
            <dt>Teórico</dt>
            <dd>{result.stock_teorico}</dd>
          </div>
          <div>
            <dt>Físico</dt>
            <dd>{result.stock_fisico}</dd>
          </div>
          <div>
            <dt>Diferencia</dt>
            <dd>{formatSignedInteger(result.diferencia)}</dd>
          </div>
        </dl>
      ) : null}

      {!resolved ? (
        <form className="count-form" onSubmit={handleSubmit}>
          <label htmlFor={inputId}>Stock físico del grupo</label>
          <div className="count-form__controls">
            <input
              autoComplete="off"
              disabled={disabled}
              id={inputId}
              inputMode="numeric"
              onChange={(event) => {
                if (/^\d*$/.test(event.target.value)) {
                  setPhysicalStock(event.target.value)
                }
              }}
              pattern="[0-9]*"
              placeholder="0"
              value={physicalStock}
            />
            <button
              className="button"
              disabled={disabled || !validStock}
              type="submit"
            >
              <PackageCheck aria-hidden="true" size={20} /> Registrar localmente
            </button>
          </div>
        </form>
      ) : (
        <p className="locked-message">
          {pending
            ? `Registrado localmente: ${pending.stock_fisico}. Se enviará en lote.`
            : 'Enviado al backend. Este grupo ya no puede editarse.'}
        </p>
      )}

      {group.productos.length > 0 ? (
        <details className="products">
          <summary><ChevronDown aria-hidden="true" size={18} /> Ver productos ({group.productos.length})</summary>
          <ul>
            {group.productos.map((product) => (
              <li key={product.c_interno}>
                <strong>{product.producto}</strong>
                <span>
                  {product.marca} · Código {product.c_interno}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  )
}
import { Check, ChevronDown, Cloud, PackageCheck } from 'lucide-react'
