/** D.1.4: detecta únicamente ediciones no guardadas del producto actual. */
export function hasUnsavedCaptureEdit(input: {
  edited: boolean
  expression: string
  physical: number | null
  savedPhysical: number | null
}): boolean {
  if (!input.edited) return false
  if (input.savedPhysical === null) return input.expression.trim().length > 0
  return input.physical === null || input.physical !== input.savedPhysical
}
