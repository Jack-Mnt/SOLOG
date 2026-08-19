import { useState, type FormEvent } from 'react'
import type { SologCountGroup, SologCountSaveResponse } from '../types'

interface CountGroupCardProps {
  group: SologCountGroup
  result?: SologCountSaveResponse
  saving: boolean
  captureDisabled: boolean
  onSave: (grupoId: string, stockFisico: number) => Promise<void>
}

function formatSignedInteger(value: number): string {
  return value > 0 ? `+${value}` : value.toString()
}

export function CountGroupCard({
  group,
  result,
  saving,
  captureDisabled,
  onSave,
}: CountGroupCardProps) {
  const [physicalStock, setPhysicalStock] = useState('')
  const inputId = `stock-${group.grupo_id}`
  const parsedStock = Number(physicalStock)
  const validStock =
    /^\d+$/.test(physicalStock) &&
    Number.isSafeInteger(parsedStock) &&
    parsedStock >= 0
  const disabled = group.contado || saving || captureDisabled

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validStock || disabled) return
    void onSave(group.grupo_id, parsedStock)
  }

  const statusLabel = result
    ? result.diferencia === 0
      ? 'Coincide'
      : 'Pendiente'
    : group.contado
      ? 'Contado'
      : 'Pendiente de captura'

  return (
    <article className={`count-group${group.contado ? ' count-group--done' : ''}`}>
      <div className="count-group__heading">
        <div>
          <h3>{group.nombre}</h3>
          <p>
            Stock teórico: <strong>{group.stock_teorico}</strong>
          </p>
        </div>
        <span className="count-state">{statusLabel}</span>
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

      {!group.contado ? (
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
              {saving ? 'Guardando…' : 'Guardar grupo'}
            </button>
          </div>
        </form>
      ) : (
        <p className="locked-message">Guardado. Este grupo ya no puede editarse.</p>
      )}

      {group.productos.length > 0 ? (
        <details className="products">
          <summary>Ver productos ({group.productos.length})</summary>
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
