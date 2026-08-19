import { useState, type FormEvent } from 'react'
import { getSologDifferenceStateLabel } from '../labels'
import type { SologRecountGroup, SologRecountResponse } from '../types'

interface RecountGroupCardProps {
  group: SologRecountGroup
  result?: SologRecountResponse
  saving: boolean
  captureDisabled: boolean
  onRecount: (
    grupoId: string,
    conteoOrigenId: string,
    stockFisico: number,
  ) => Promise<void>
}

export function RecountGroupCard({
  group,
  result,
  saving,
  captureDisabled,
  onRecount,
}: RecountGroupCardProps) {
  const [physicalStock, setPhysicalStock] = useState('')
  const inputId = `recount-stock-${group.grupo_id}`
  const parsedStock = Number(physicalStock)
  const validStock =
    /^\d+$/.test(physicalStock) &&
    Number.isSafeInteger(parsedStock) &&
    parsedStock >= 0
  const resolved = group.contado || Boolean(result)
  const disabled = resolved || saving || captureDisabled
  const stateLabel = result
    ? getSologDifferenceStateLabel(result.estado_diferencia)
    : getSologDifferenceStateLabel(group.estado_diferencia)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validStock || disabled) return
    void onRecount(group.grupo_id, group.conteo_origen_id, parsedStock)
  }

  return (
    <article className={`count-group${resolved ? ' count-group--done' : ''}`}>
      <div className="count-group__heading">
        <div>
          <h3>{group.nombre}</h3>
          <p>
            Categoría: <strong>{group.categoria}</strong>
          </p>
        </div>
        <span className="count-state">{stateLabel}</span>
      </div>

      <dl className="count-result count-result--recount">
        <div>
          <dt>Stock teórico original</dt>
          <dd>{group.stock_teorico}</dd>
        </div>
        <div>
          <dt>Stock físico original</dt>
          <dd>{group.stock_fisico_original}</dd>
        </div>
        {result ? (
          <div>
            <dt>Nuevo conteo físico</dt>
            <dd>{result.reconteo_stock}</dd>
          </div>
        ) : null}
      </dl>

      {!resolved ? (
        <form className="count-form" onSubmit={handleSubmit}>
          <label htmlFor={inputId}>Nuevo conteo físico del grupo</label>
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
              {saving ? 'Guardando…' : 'Guardar reconteo'}
            </button>
          </div>
        </form>
      ) : (
        <p className="locked-message">
          Reconteo guardado. Este grupo ya no puede modificarse.
        </p>
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
