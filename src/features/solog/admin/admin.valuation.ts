export interface ValuationDecision { enabled: boolean; unitsPerPackage: number | null; packagePrice: number | null }
export const valuationPresets = [6, 10, 12, 20] as const
export const suggestedPackagePrice = (units: number, unitPrice: number) => units * unitPrice
export function validateValuationDecision(decision: ValuationDecision) {
  return !decision.enabled || (Number.isSafeInteger(decision.unitsPerPackage) && decision.unitsPerPackage! > 1 && Number.isFinite(decision.packagePrice) && decision.packagePrice! > 0)
}
