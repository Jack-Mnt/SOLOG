import { useMemo, useState, type FormEvent } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
import type { SologGroupSummary, SologGroupValuationSavePayload } from '../../types'
import { AdminDialog } from '../admin.dialog'
import { formatAdminCurrency } from '../admin.format'
import { formatGroupValuation } from './valuation'

const COMMON_PACKAGE_QUANTITIES = [4, 6, 12, 20] as const
type QuantityChoice = (typeof COMMON_PACKAGE_QUANTITIES)[number] | 'other' | null

function suggestedPrice(quantity: number, unitPrice: number): string {
  return (quantity * unitPrice).toFixed(2)
}

export function GroupValuationDialog({ group, saving, error, onClose, onSave }: {
  group: SologGroupSummary
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (payload: SologGroupValuationSavePayload) => Promise<boolean>
}) {
  const hasPackage = group.unidades_por_paquete !== null && group.precio_paquete !== null
  const currentQuantity = group.unidades_por_paquete
  const commonCurrentQuantity = currentQuantity !== null && COMMON_PACKAGE_QUANTITIES.some((quantity) => quantity === currentQuantity)
  const [packageEnabled, setPackageEnabled] = useState(hasPackage)
  const [quantityChoice, setQuantityChoice] = useState<QuantityChoice>(
    commonCurrentQuantity ? currentQuantity as QuantityChoice : currentQuantity === null ? null : 'other',
  )
  const [customQuantity, setCustomQuantity] = useState(
    currentQuantity !== null && !commonCurrentQuantity ? String(currentQuantity) : '',
  )
  const [packagePrice, setPackagePrice] = useState(group.precio_paquete === null ? '' : String(group.precio_paquete))

  const quantity = quantityChoice === 'other' ? Number(customQuantity) : quantityChoice
  const numericPackagePrice = Number(packagePrice)
  const validQuantity = typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 1
  const validPackagePrice = packagePrice.trim() !== '' && Number.isFinite(numericPackagePrice) && numericPackagePrice > 0
  const valid = !packageEnabled || (validQuantity && validPackagePrice)
  const unchanged = packageEnabled
    ? hasPackage && quantity === group.unidades_por_paquete && numericPackagePrice === group.precio_paquete
    : !hasPackage

  const preview = useMemo(() => packageEnabled && (!validQuantity || !validPackagePrice)
    ? 'Completa cantidad y precio para ver el resultado.'
    : formatGroupValuation({
      precio: group.precio,
      unidades_por_paquete: packageEnabled ? quantity : null,
      precio_paquete: packageEnabled ? numericPackagePrice : null,
    }), [group.precio, numericPackagePrice, packageEnabled, validPackagePrice, validQuantity, quantity])

  const selectQuantity = (choice: QuantityChoice) => {
    setQuantityChoice(choice)
    if (choice === 'other') {
      setCustomQuantity('')
      setPackagePrice('')
      return
    }
    if (typeof choice === 'number') {
      setCustomQuantity('')
      setPackagePrice(suggestedPrice(choice, group.precio))
    }
  }

  const changeCustomQuantity = (value: string) => {
    setCustomQuantity(value)
    const parsed = Number(value)
    setPackagePrice(Number.isInteger(parsed) && parsed > 1 ? suggestedPrice(parsed, group.precio) : '')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !valid || unchanged) return
    const completed = await onSave({
      grupo_id: group.id,
      unidades_por_paquete: packageEnabled && validQuantity ? quantity : null,
      precio_paquete: packageEnabled && validPackagePrice ? numericPackagePrice : null,
    })
    if (completed) onClose()
  }

  return (
    <AdminDialog
      closeDisabled={saving}
      description="Esta configuración se aplica directamente en SOLOG y no requiere publicación de catálogo."
      footer={<><button className="button button--secondary" disabled={saving} onClick={onClose} type="button">Cancelar</button><button className="button" disabled={saving || !valid || unchanged} form="group-valuation-form" type="submit">{saving ? <LoaderCircle className="icon-spin" size={17} /> : <Save size={17} />}{saving ? 'Guardando…' : 'Guardar'}</button></>}
      onClose={onClose}
      title="Editar valorización"
    >
      <form className="group-valuation-form" id="group-valuation-form" onSubmit={(event) => void submit(event)}>
        <div className="group-valuation-unit-price"><span>Precio unitario</span><strong>{formatAdminCurrency(group.precio)}</strong><small>Solo lectura · El precio se administra desde Catálogo.</small></div>
        <label className="group-valuation-toggle"><span><strong>Precio por paquete</strong><small>¿Este grupo tiene precio por paquete?</small></span><input aria-label="Habilitar precio por paquete" checked={packageEnabled} disabled={saving} onChange={(event) => setPackageEnabled(event.target.checked)} role="switch" type="checkbox" /></label>
        {packageEnabled ? <div className="group-package-editor"><fieldset><legend>Cantidad por paquete</legend><div className="group-quantity-chips">{COMMON_PACKAGE_QUANTITIES.map((quantityOption) => <button aria-pressed={quantityChoice === quantityOption} className={quantityChoice === quantityOption ? 'is-active' : undefined} disabled={saving} key={quantityOption} onClick={() => selectQuantity(quantityOption)} type="button">{quantityOption}</button>)}<button aria-pressed={quantityChoice === 'other'} className={quantityChoice === 'other' ? 'is-active' : undefined} disabled={saving} onClick={() => selectQuantity('other')} type="button">Otro</button></div></fieldset>{quantityChoice === 'other' ? <label>Cantidad personalizada<input disabled={saving} inputMode="numeric" min="2" onChange={(event) => changeCustomQuantity(event.target.value)} required step="1" type="number" value={customQuantity} /></label> : null}<label>Precio por paquete<input disabled={saving || !validQuantity} inputMode="decimal" min="0.01" onChange={(event) => setPackagePrice(event.target.value)} required step="0.01" type="number" value={packagePrice} /></label>{!validQuantity ? <p className="helper-text">Selecciona una cantidad entera mayor que 1.</p> : !validPackagePrice ? <p className="helper-text">Indica un precio por paquete mayor que cero.</p> : null}</div> : null}
        <div className="group-valuation-preview"><span>Valorización resultante</span><strong>{preview}</strong></div>
        {unchanged ? <p className="helper-text">No hay cambios por guardar.</p> : null}
        {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      </form>
    </AdminDialog>
  )
}
