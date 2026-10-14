// Contrato de observaciones de Cajero V5. Las reglas del umbral autoritativo viven en Supabase.
export const CASHIER_DIFFERENCE_REASONS = [
  'Transferencia', 'Venta por mayor', 'Dañado', 'Vencido', 'Otro motivo',
] as const

export type CashierDifferenceReason = typeof CASHIER_DIFFERENCE_REASONS[number]

export interface CashierInitialObservation {
  motivo_diferencia: CashierDifferenceReason | null
  observacion_diferencia: string | null
}
export interface CashierRecountObservation {
  motivo_diferencia: CashierDifferenceReason | null
  observacion_reconteo: string | null
}

export function isCashierDifferenceReason(value: unknown): value is CashierDifferenceReason {
  return CASHIER_DIFFERENCE_REASONS.includes(value as CashierDifferenceReason)
}

export function hasCashierObservationText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3
}

export function validCashierInitialObservation(value: unknown): value is CashierInitialObservation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const note = value as Record<string, unknown>
  const reason = note.motivo_diferencia
  const text = note.observacion_diferencia
  return reason === null && text === null ||
    isCashierDifferenceReason(reason) && hasCashierObservationText(text)
}

export function validCashierRecountObservation(value: unknown): value is CashierRecountObservation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const note = value as Record<string, unknown>
  const reason = note.motivo_diferencia
  const text = note.observacion_reconteo
  // Un reconteo puede conservar un motivo anterior sin necesitar un segundo texto.
  // El backend sustituye por 'Resuelto' cuando coincide con el teórico del reconteo.
  return (reason === null || isCashierDifferenceReason(reason)) &&
    (text === null || hasCashierObservationText(text))
}
