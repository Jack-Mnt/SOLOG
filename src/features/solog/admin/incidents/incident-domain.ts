import type { SologAdminIncidentRow } from '../../types'

function getScalar(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  }
  return null
}

export function getIncidentSummary(row: SologAdminIncidentRow): string {
  if (row.tipo === 'producto_ausente') return 'Producto ausente del archivo'

  if (row.tipo === 'codigo_interno_invalido') {
    const received =
      row.c_interno_original ??
      getScalar(row.datos, ['c_interno_original', 'codigo', 'valor'])
    return received ? `Código recibido: ${received}` : 'Código interno no procesable'
  }

  if (row.tipo === 'codigo_interno_duplicado') {
    return 'Código repetido en el archivo'
  }

  const stock = getScalar(row.datos, [
    'stock',
    'stock_original',
    'valor',
    'stock_recibido',
  ])
  return stock ? `Stock no procesable: ${stock}` : 'Stock no procesable'
}

export function formatIncidentData(data: Record<string, unknown>): string {
  return Object.keys(data).length === 0
    ? 'Sin datos adicionales'
    : JSON.stringify(data, null, 2)
}

export function abbreviateIdentifier(value: string | null): string {
  if (!value) return 'Sin registro'
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}
