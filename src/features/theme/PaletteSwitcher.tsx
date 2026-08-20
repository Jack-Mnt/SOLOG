import { Check, Palette } from 'lucide-react'
import { useState } from 'react'
import {
  getStoredPalette,
  persistPalette,
  type SologPalette,
} from './palette'

const OPTIONS: Array<{ value: SologPalette; label: string }> = [
  { value: 'blue', label: 'Azul eléctrico' },
  { value: 'violet', label: 'Violeta' },
  { value: 'green', label: 'Verde suave' },
]

export function PaletteSwitcher() {
  const [palette, setPalette] = useState(getStoredPalette)

  const selectPalette = (nextPalette: SologPalette) => {
    setPalette(nextPalette)
    persistPalette(nextPalette)
  }

  return (
    <div className="palette-switcher" aria-label="Paleta de color">
      <Palette aria-hidden="true" size={18} strokeWidth={2} />
      <div className="palette-options">
        {OPTIONS.map((option) => (
          <button
            aria-label={`Usar paleta ${option.label}`}
            aria-pressed={palette === option.value}
            className={`palette-option palette-option--${option.value}`}
            key={option.value}
            onClick={() => selectPalette(option.value)}
            title={option.label}
            type="button"
          >
            {palette === option.value ? (
              <Check aria-hidden="true" size={13} strokeWidth={3} />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
