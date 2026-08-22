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

export interface IncidentDataEntry {
  key: string
  label: string
  value: string
}

const INCIDENT_DATA_LABELS: Record<string, string> = {
  producto: 'Producto detectado',
  c_interno: 'Código interno',
  c_interno_original: 'Código interno original',
  c_barras: 'Código de barras',
  stock: 'Stock detectado',
  stock_original: 'Stock original',
  stock_recibido: 'Stock recibido',
  valor: 'Valor detectado',
}

function getDataLabel(key: string): string {
  const known = INCIDENT_DATA_LABELS[key]
  if (known) return known
  const words = key.replaceAll('_', ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

export function getSimpleIncidentData(
  data: Record<string, unknown>,
): IncidentDataEntry[] | null {
  const entries = Object.entries(data)
  if (entries.length === 0 || entries.length > 4) return null

  const formatted: IncidentDataEntry[] = []
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      formatted.push({ key, label: getDataLabel(key), value: value || 'Sin valor' })
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      formatted.push({ key, label: getDataLabel(key), value: String(value) })
      continue
    }
    if (typeof value === 'boolean') {
      formatted.push({ key, label: getDataLabel(key), value: value ? 'Sí' : 'No' })
      continue
    }
    if (value === null) {
      formatted.push({ key, label: getDataLabel(key), value: 'Sin valor' })
      continue
    }
    return null
  }

  return formatted
}

export function abbreviateIdentifier(value: string | null): string {
  if (!value) return 'Sin registro'
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}
