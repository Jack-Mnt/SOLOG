import { formatAdminCurrency } from '../admin.format'

export interface GroupValuation {
  precio: number
  unidades_por_paquete: number | null
  precio_paquete: number | null
}

export interface GroupValuationLines {
  primary: string
  secondary: string | null
}

export function getGroupValuationLines(value: GroupValuation): GroupValuationLines {
  if (value.unidades_por_paquete !== null && value.precio_paquete !== null) {
    return {
      primary: `${value.unidades_por_paquete} uds. × ${formatAdminCurrency(value.precio_paquete)}`,
      secondary: `${formatAdminCurrency(value.precio)} / unidad`,
    }
  }

  return {
    primary: `${formatAdminCurrency(value.precio)} / unidad`,
    secondary: null,
  }
}

export function formatGroupValuation(value: GroupValuation, compact = false): string {
  const lines = getGroupValuationLines(value)
  if (!lines.secondary) return compact ? lines.primary.replace('/ unidad', '/ ud.') : lines.primary
  return `${lines.primary} · ${compact ? lines.secondary.replace('/ unidad', '/ ud.') : lines.secondary}`
}
