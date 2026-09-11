import { useState } from 'react'
import { AdminDialog } from './admin.dialog'
import { Value } from './admin.v2.presentation'

import { suggestedPackagePrice, type ValuationDecision, valuationPresets } from './admin.valuation'
export type { ValuationDecision } from './admin.valuation'
const money = (value: number) => value.toFixed(2)

export interface ValuationDialogProps {
  unitPrice: number
  initial: Pick<ValuationDecision, 'unitsPerPackage' | 'packagePrice'>
  description?: string
  pending?: boolean
  error?: string
  onClose: () => void
  onConfirm: (decision: ValuationDecision) => void
}

export function ValuationDialog({ unitPrice, initial, description, pending = false, error, onClose, onConfirm }: ValuationDialogProps) {
  const [enabled, setEnabled] = useState(initial.unitsPerPackage !== null && initial.packagePrice !== null)
  const [units, setUnits] = useState(initial.unitsPerPackage ? String(initial.unitsPerPackage) : '6')
  const [packagePrice, setPackagePrice] = useState(initial.packagePrice ? money(initial.packagePrice) : money(unitPrice * 6))
  const [customUnits, setCustomUnits] = useState(initial.unitsPerPackage !== null && !valuationPresets.includes(initial.unitsPerPackage as typeof valuationPresets[number]))
  const [priceEdited, setPriceEdited] = useState(initial.packagePrice !== null)
  const [localError, setLocalError] = useState('')
  const chooseUnits = (value: number) => { setUnits(String(value)); setCustomUnits(false); if (!priceEdited) setPackagePrice(money(suggestedPackagePrice(value, unitPrice))) }
  const setOtherUnits = (value: string) => { setUnits(value); setCustomUnits(true); const parsed = Number(value); if (!priceEdited && Number.isInteger(parsed) && parsed > 1) setPackagePrice(money(suggestedPackagePrice(parsed, unitPrice))) }
  const submit = () => {
    if (!enabled) { onConfirm({ enabled: false, unitsPerPackage: null, packagePrice: null }); return }
    const parsedUnits = Number(units), parsedPrice = Number(packagePrice)
    if (!Number.isSafeInteger(parsedUnits) || parsedUnits <= 1) { setLocalError('Las unidades por paquete deben ser un entero mayor que uno.'); return }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) { setLocalError('El precio por paquete debe ser mayor que cero.'); return }
    setLocalError(''); onConfirm({ enabled: true, unitsPerPackage: parsedUnits, packagePrice: parsedPrice })
  }
  const current = initial.unitsPerPackage !== null && initial.packagePrice !== null ? `x${initial.unitsPerPackage} · S/ ${money(initial.packagePrice)}` : 'Sin valorizado'
  return <AdminDialog title="Configuración de valorizado" description={description} onClose={onClose} closeDisabled={pending}>
    <p>Precio unitario de referencia: <Value value={unitPrice} money />. Valorizado actual: {current}.</p>
    <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Valorización por paquete</label>
    {enabled && <fieldset><legend>Unidades por paquete</legend><div className="admin-v2-actions">{valuationPresets.map(value => <button type="button" className="button button--secondary" aria-pressed={!customUnits && Number(units) === value} onClick={() => chooseUnits(value)} key={value}>x{value}</button>)}<button type="button" className="button button--secondary" aria-pressed={customUnits} onClick={() => setCustomUnits(true)}>Otro</button></div>{customUnits && <label>Otro número de unidades<input required type="number" min="2" step="1" value={units} onChange={(event) => setOtherUnits(event.target.value)} /></label>}<label>Precio por paquete<input required type="number" min="0.01" step="0.01" value={packagePrice} onChange={(event) => { setPackagePrice(event.target.value); setPriceEdited(true) }} /></label><p>Referencia sugerida: S/ {money(suggestedPackagePrice(Number(units) > 1 ? Number(units) : 0, unitPrice))}. No reemplaza un precio ingresado manualmente.</p></fieldset>}
    {(localError || error) && <p role="alert">{localError || error}</p>}
    <button type="button" className="button" disabled={pending} onClick={submit}>{pending ? 'Guardando…' : 'Confirmar valorizado'}</button>
  </AdminDialog>
}
