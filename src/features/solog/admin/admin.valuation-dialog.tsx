import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { AdminDialog } from './admin.dialog'
import { AdminBinarySwitch, AdminNotice } from './admin.primitives'
import { Value } from './admin.v2.presentation'
import { suggestedPackagePrice, type ValuationDecision, valuationPresets } from './admin.valuation'

export type { ValuationDecision } from './admin.valuation'

const money = (value: number) => value.toFixed(2)
const valuationOptions = [
  { value: 'unit', label: 'Unitario' },
  { value: 'package', label: 'Por paquete' },
] as const

export interface ValuationDialogProps {
  unitPrice: number
  initial: Pick<ValuationDecision, 'unitsPerPackage' | 'packagePrice'>
  description?: string
  pending?: boolean
  confirmLabel?: string
  error?: string
  onRetry?: () => void
  onClose: () => void
  onConfirm: (decision: ValuationDecision) => void
}

export function ValuationDialog({
  unitPrice,
  initial,
  description,
  pending = false,
  confirmLabel = 'Guardar valorizado',
  error,
  onRetry,
  onClose,
  onConfirm,
}: ValuationDialogProps) {
  const initialEnabled = initial.unitsPerPackage !== null && initial.packagePrice !== null
  const [enabled, setEnabled] = useState(initialEnabled)
  const [units, setUnits] = useState(initial.unitsPerPackage ? String(initial.unitsPerPackage) : '6')
  const [packagePrice, setPackagePrice] = useState(
    initial.packagePrice ? money(initial.packagePrice) : money(unitPrice * 6),
  )
  const [customUnits, setCustomUnits] = useState(
    initial.unitsPerPackage !== null &&
      !valuationPresets.includes(initial.unitsPerPackage as typeof valuationPresets[number]),
  )
  const [localError, setLocalError] = useState('')

  const parsedUnits = Number(units)
  const parsedPrice = Number(packagePrice)
  const hasChanges =
    enabled !== initialEnabled ||
    (enabled &&
      initialEnabled &&
      (parsedUnits !== initial.unitsPerPackage || parsedPrice !== initial.packagePrice))

  const chooseUnits = (value: number) => {
    setUnits(String(value))
    setCustomUnits(false)
    setLocalError('')
    setPackagePrice(money(suggestedPackagePrice(value, unitPrice)))
  }

  const setOtherUnits = (value: string) => {
    setUnits(value)
    setCustomUnits(true)
    setLocalError('')
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 1) {
      setPackagePrice(money(suggestedPackagePrice(parsed, unitPrice)))
    }
  }

  const setMode = (mode: 'unit' | 'package') => {
    setEnabled(mode === 'package')
    setLocalError('')
  }

  const submit = () => {
    if (!enabled) {
      onConfirm({ enabled: false, unitsPerPackage: null, packagePrice: null })
      return
    }
    if (!Number.isSafeInteger(parsedUnits) || parsedUnits <= 1) {
      setLocalError('Las unidades por paquete deben ser un entero mayor que uno.')
      return
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setLocalError('El precio por paquete debe ser mayor que cero.')
      return
    }
    setLocalError('')
    onConfirm({
      enabled: true,
      unitsPerPackage: parsedUnits,
      packagePrice: parsedPrice,
    })
  }

  const current =
    initialEnabled
      ? `x${initial.unitsPerPackage} · S/ ${money(initial.packagePrice!)}`
      : 'Sin valorizado'
  const feedback = localError || error
  const retryAction =
    !localError && error && onRetry ? (
      <button
        type="button"
        className="button button--secondary"
        disabled={pending}
        onClick={onRetry}
      >
        <RotateCcw size={16} aria-hidden="true" />
        Reintentar misma operación
      </button>
    ) : undefined

  return <AdminDialog
    title="Configuración de valorizado"
    description={description}
    onClose={onClose}
    closeDisabled={pending}
    footer={
      <>
        <button
          type="button"
          className="button button--secondary"
          disabled={pending}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button"
          disabled={pending || !hasChanges}
          onClick={submit}
        >
          <Check size={16} aria-hidden="true" />
          {pending ? 'Guardando…' : confirmLabel}
        </button>
      </>
    }
  >
    <div className="admin-dialog-task">
      <dl className="admin-dialog-context">
        <div>
          <dt>Precio unitario</dt>
          <dd><Value value={unitPrice} money /></dd>
        </div>
        <div>
          <dt>Valorizado actual</dt>
          <dd>{current}</dd>
        </div>
      </dl>

      <AdminBinarySwitch
        label="Valorización"
        value={enabled ? 'package' : 'unit'}
        options={valuationOptions}
        onChange={setMode}
        disabled={pending}
      />

      {enabled && (
        <fieldset className="admin-valuation-config">
          <legend>Configuración por paquete</legend>
          <span className="admin-field-label">Unidades por paquete</span>
          <div className="admin-valuation-presets">
            {valuationPresets.map((value) => (
              <button
                type="button"
                className="button button--secondary"
                aria-pressed={!customUnits && parsedUnits === value}
                onClick={() => chooseUnits(value)}
                key={value}
              >
                x{value}
              </button>
            ))}
            <button
              type="button"
              className="button button--secondary"
              aria-pressed={customUnits}
              onClick={() => setCustomUnits(true)}
            >
              Otro
            </button>
          </div>

          {customUnits && (
            <label>
              Otro número de unidades
              <input
                required
                type="number"
                min="2"
                step="1"
                value={units}
                onChange={(event) => setOtherUnits(event.target.value)}
              />
            </label>
          )}

          <label>
            Precio por paquete
            <input
              required
              type="number"
              min="0.1"
              step="0.1"
              value={packagePrice}
              onChange={(event) => {
                setPackagePrice(event.target.value)
                setLocalError('')
              }}
            />
          </label>
        </fieldset>
      )}

      {feedback && (
        <AdminNotice tone="error" action={retryAction}>
          {feedback}
        </AdminNotice>
      )}
    </div>
  </AdminDialog>
}
