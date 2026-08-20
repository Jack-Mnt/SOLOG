export const SOLOG_PALETTES = ['blue', 'violet', 'green'] as const
export type SologPalette = (typeof SOLOG_PALETTES)[number]

const PALETTE_STORAGE_KEY = 'solog.palette.v1'

function isSologPalette(value: string | null): value is SologPalette {
  return SOLOG_PALETTES.some((palette) => palette === value)
}

export function getStoredPalette(): SologPalette {
  const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY)
  return isSologPalette(stored) ? stored : 'blue'
}

export function applyPalette(palette: SologPalette): void {
  document.documentElement.dataset.palette = palette
}

export function persistPalette(palette: SologPalette): void {
  window.localStorage.setItem(PALETTE_STORAGE_KEY, palette)
  applyPalette(palette)
}
