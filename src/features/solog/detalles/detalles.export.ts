import type { SheetData } from 'write-excel-file/browser'
import { SologApiError } from '../errors'
import { parseDetailsResponse, type DetailsExport as SologDetailsExportResponse, type DetailsExportRow as SologDetailsExportRow } from './detalles.v2'

const LIMA_TIME_ZONE = 'America/Lima'
const MONEY_FORMAT = '"S/ "#,##0.00;[Red]-"S/ "#,##0.00;"S/ "0.00'
const INTEGER_FORMAT = '#,##0'
const SIGNED_INTEGER_FORMAT = '+#,##0;-#,##0;0'
const HEADER_BACKGROUND = '#E2E8F0'
const HEADER_TEXT = '#0F172A'
const TITLE_BACKGROUND = '#0F172A'
const TITLE_TEXT = '#FFFFFF'
const MONTH_NAMES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const

interface LimaDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function validateDetailsExportResponse(value: unknown): SologDetailsExportResponse {
  return parseDetailsResponse('export', value)
}

function getLimaDateParts(value: Date | string): LimaDateParts {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    throw new SologApiError('SOLOG_INVALID_DETAILS_EXPORT_RESPONSE')
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value)

  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  }
}

function toLimaCalendarDate(value: string): Date {
  const parts = getLimaDateParts(value)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function toLimaClockTime(value: string): Date {
  const parts = getLimaDateParts(value)
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  ))
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function formatGeneratedAt(value: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: LIMA_TIME_ZONE,
  }).format(value)
}

function formatMoney(value: number): string {
  return `S/ ${Math.abs(value).toFixed(2)}`
}

function formatSignedMoney(value: number): string {
  if (value > 0) return `+${formatMoney(value)}`
  if (value < 0) return `-${formatMoney(value)}`
  return formatMoney(0)
}

function formatSignedInteger(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export function getDetailsValuationExplanation(
  row: SologDetailsExportRow,
): string {
  if (row.valorizado === null) return 'Sin valorización disponible'

  if (
    row.unidades_por_paquete !== null &&
    row.precio_paquete !== null
  ) {
    const absoluteDifference = Math.abs(row.diferencia)
    const packages = Math.floor(
      absoluteDifference / row.unidades_por_paquete,
    )
    const remainder = absoluteDifference % row.unidades_por_paquete
    const parts = [
      `${packages} ${packages === 1 ? 'paquete' : 'paquetes'} × ${formatMoney(row.precio_paquete)}`,
      `${remainder} uds. × ${formatMoney(row.precio)}`,
    ]
    const operation = parts.join(' + ')
    const signedOperation = row.diferencia < 0
      ? `-(${operation})`
      : row.diferencia > 0
        ? `+(${operation})`
        : operation

    return `${formatSignedInteger(row.diferencia)} uds. = ${signedOperation} = ${formatSignedMoney(row.valorizado)}`
  }

  return `${formatSignedInteger(row.diferencia)} × ${formatMoney(row.precio)} = ${formatSignedMoney(row.valorizado)}`
}

function sanitizeFilenamePart(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'Sede'
  )
}

export function getDetailsExportFilename(
  response: SologDetailsExportResponse,
  generatedAt = new Date(),
): string {
  const parts = getLimaDateParts(generatedAt)
  const hour12 = parts.hour % 12 || 12
  const suffix = parts.hour < 12 ? 'am' : 'pm'
  const timestamp = `${MONTH_NAMES[parts.month - 1]}-${String(parts.day).padStart(2, '0')}-${String(hour12).padStart(2, '0')}${String(parts.minute).padStart(2, '0')}_${suffix}`
  return `SOLOG_Diferencias_quincenal_${timestamp}_${sanitizeFilenamePart(response.site.nombre)}.xlsx`
}

function getSummaryData(
  response: SologDetailsExportResponse,
  generatedAt: Date,
): SheetData {
  const summary = response.summary
  return [
    [
      {
        value: 'SOLOG — Diferencias del período',
        fontSize: 16,
        fontWeight: 'bold',
        textColor: TITLE_TEXT,
        backgroundColor: TITLE_BACKGROUND,
        columnSpan: 2,
        height: 30,
        alignVertical: 'center',
      },
    ],
    [],
    [{ value: 'Sede', fontWeight: 'bold' }, response.site.nombre],
    [
      { value: 'Período', fontWeight: 'bold' },
      `${formatDateOnly(response.period.from)} — ${formatDateOnly(response.period.to)}`,
    ],
    [{ value: 'Generado', fontWeight: 'bold' }, formatGeneratedAt(generatedAt)],
    [
      { value: 'Diferencias finales', fontWeight: 'bold' },
      { value: summary.diferencias_finales, type: Number, format: INTEGER_FORMAT },
    ],
    [{ value: 'Confirmadas', fontWeight: 'bold' }, { value: summary.confirmadas, type: Number, format: INTEGER_FORMAT }],
    [{ value: 'Inconsistentes', fontWeight: 'bold' }, { value: summary.inconsistentes, type: Number, format: INTEGER_FORMAT }],
    [{ value: 'Faltantes', fontWeight: 'bold' }, { value: summary.faltantes, type: Number, format: INTEGER_FORMAT }],
    [{ value: 'Sobrantes', fontWeight: 'bold' }, { value: summary.sobrantes, type: Number, format: INTEGER_FORMAT }],
    [{ value: 'Valorizado faltante', fontWeight: 'bold' }, { value: summary.valorizado_faltantes, type: Number, format: MONEY_FORMAT }],
    [{ value: 'Valorizado sobrante', fontWeight: 'bold' }, { value: summary.valorizado_sobrantes, type: Number, format: MONEY_FORMAT }],
  ]
}

function getDifferencesData(rows: SologDetailsExportRow[]): SheetData {
  const header = [
    'Fecha',
    'Hora',
    'Nombre',
    'Categoría',
    'Estado',
    'Stock Tumi',
    'Fisico',
    'Diferencia',
    'Valorizado',
    'Detalle',
  ].map((value) => ({
    value,
    fontWeight: 'bold' as const,
    textColor: HEADER_TEXT,
    backgroundColor: HEADER_BACKGROUND,
    alignVertical: 'center' as const,
    wrap: true,
    height: 28,
  }))

  const sortedRows = [...rows].sort((left, right) => {
    const dateDifference = Date.parse(left.fecha_origen) - Date.parse(right.fecha_origen)
    return dateDifference || (left.grupo ?? '').localeCompare(right.grupo ?? '', 'es')
  })

  return [
    header,
    ...sortedRows.map((row) => [
      { value: toLimaCalendarDate(row.fecha_origen), type: Date, format: 'dd/mm/yyyy' },
      { value: toLimaClockTime(row.fecha_origen), type: Date, format: 'h:mm AM/PM' },
      { value: row.grupo ?? '—', wrap: true },
      { value: row.categoria ?? '—', wrap: true },
      row.estado,
      row.teorico === null ? '—' : { value: row.teorico, type: Number, format: INTEGER_FORMAT },
      { value: row.fisico, type: Number, format: INTEGER_FORMAT },
      { value: row.diferencia, type: Number, format: SIGNED_INTEGER_FORMAT },
      row.valorizado === null ? '—' : { value: row.valorizado, type: Number, format: MONEY_FORMAT },
      { value: getDetailsValuationExplanation(row), wrap: true },
    ]),
  ]
}

export async function downloadDetailsExport(
  response: SologDetailsExportResponse,
  generatedAt = new Date(response.generated_at),
  isCurrent = () => true,
): Promise<string> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  if (!isCurrent()) throw new Error('El contexto de la exportación cambió.')
  const filename = getDetailsExportFilename(response, generatedAt)
  await writeXlsxFile(
    [
      {
        sheet: 'Resumen',
        data: getSummaryData(response, generatedAt),
        columns: [{ width: 26 }, { width: 44 }],
        showGridLines: false,
        zoomScale: 1,
      },
      {
        sheet: 'Diferencias',
        data: getDifferencesData(response.rows),
        columns: [
          { width: 13 },
          { width: 12 },
          { width: 34 },
          { width: 24 },
          { width: 16 },
          { width: 13 },
          { width: 11 },
          { width: 13 },
          { width: 17 },
          { width: 62 },
        ],
        stickyRowsCount: 1,
        showGridLines: false,
        zoomScale: 1,
      },
    ],
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toFile(filename)

  return filename
}
