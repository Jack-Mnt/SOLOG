import type { SheetData } from "write-excel-file/browser";
import { SologApiError } from "../../errors";
import type {
  SologControlExportResponse,
  SologControlExportRow,
} from "../../types";

const MONEY_FORMAT = '"S/ "#,##0.00';
const MONEY_MAGNITUDE_FORMAT = '"S/ "#,##0.00;"S/ "-#,##0.00';
const INTEGER_FORMAT = "#,##0";
const SIGNED_INTEGER_FORMAT = "+#,##0;-#,##0;0";
const HEADER_BACKGROUND = "#E2E8F0";
const HEADER_TEXT = "#0F172A";
const TITLE_BACKGROUND = "#0F172A";
const TITLE_TEXT = "#FFFFFF";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isExportRow(value: unknown): value is SologControlExportRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.fecha === "string" &&
    typeof value.categoria === "string" &&
    typeof value.grupo === "string" &&
    (value.tipo === "Individual" || value.tipo === "Agrupado") &&
    Array.isArray(value.codigos_internos) &&
    value.codigos_internos.every((code) => Number.isInteger(code)) &&
    isFiniteNumber(value.teorico) &&
    isFiniteNumber(value.fisico) &&
    isFiniteNumber(value.ajuste) &&
    isFiniteNumber(value.valor_economico) &&
    typeof value.detalle === "string" &&
    (value.estado === "persistente" || value.estado === "confirmada_reconteo")
  );
}

export function validateControlExportResponse(
  value: unknown,
): SologControlExportResponse {
  if (
    !isRecord(value) ||
    typeof value.sede_id !== "string" ||
    typeof value.sede !== "string" ||
    typeof value.date_from !== "string" ||
    typeof value.date_to !== "string" ||
    !Number.isInteger(value.registros) ||
    !isFiniteNumber(value.faltantes) ||
    !isFiniteNumber(value.sobrantes) ||
    !isFiniteNumber(value.balance) ||
    !Array.isArray(value.rows) ||
    !value.rows.every(isExportRow) ||
    value.registros !== value.rows.length ||
    typeof value.server_now !== "string"
  ) {
    throw new SologApiError("SOLOG_INVALID_CONTROL_EXPORT_RESPONSE");
  }
  return value as unknown as SologControlExportResponse;
}

function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function getLimaCalendarDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SologApiError("SOLOG_INVALID_CONTROL_EXPORT_RESPONSE");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return new Date(part("year"), part("month") - 1, part("day"));
}

function getStateLabel(state: SologControlExportRow["estado"]): string {
  return state === "persistente" ? "Persistente" : "Confirmada por reconteo";
}

function getBalanceInterpretation(balance: number): string {
  if (balance > 0) return "Faltante neto";
  if (balance < 0) return "Sobrante neto";
  return "Sin diferencia neta";
}

function getSummaryData(response: SologControlExportResponse): SheetData {
  return [
    [
      {
        value: "SOLOG — Resumen de ajuste",
        fontSize: 16,
        fontWeight: "bold",
        textColor: TITLE_TEXT,
        backgroundColor: TITLE_BACKGROUND,
        columnSpan: 2,
        height: 30,
        alignVertical: "center",
      },
    ],
    [],
    [{ value: "Sede", fontWeight: "bold" }, response.sede],
    [
      { value: "Período", fontWeight: "bold" },
      `${formatDateOnly(response.date_from)} — ${formatDateOnly(response.date_to)}`,
    ],
    [
      { value: "Registros exportados", fontWeight: "bold" },
      { value: response.registros, type: Number, format: INTEGER_FORMAT },
    ],
    [],
    [
      { value: "Faltantes", fontWeight: "bold" },
      {
        value: response.faltantes,
        type: Number,
        format: MONEY_MAGNITUDE_FORMAT,
        backgroundColor: "#FEE2E2",
        textColor: "#991B1B",
      },
    ],
    [
      { value: "Sobrantes", fontWeight: "bold" },
      {
        value: response.sobrantes,
        type: Number,
        format: MONEY_MAGNITUDE_FORMAT,
        backgroundColor: "#DBEAFE",
        textColor: "#1E40AF",
      },
    ],
    [
      { value: "Balance", fontWeight: "bold" },
      {
        value: response.balance,
        type: Number,
        format: MONEY_FORMAT,
        backgroundColor:
          response.balance > 0
            ? "#FEE2E2"
            : response.balance < 0
              ? "#DBEAFE"
              : "#F1F5F9",
        textColor:
          response.balance > 0
            ? "#991B1B"
            : response.balance < 0
              ? "#1E40AF"
              : "#475569",
        fontWeight: "bold",
      },
    ],
    [
      { value: "Interpretación", fontWeight: "bold" },
      {
        value: getBalanceInterpretation(response.balance),
        textColor: "#475569",
        align: "right",
        wrap: true,
      },
    ],
    [
      {},
      {
        value:
          "El balance corresponde a faltantes menos sobrantes. SOLOG calcula el monto total de la sede y no distribuye descuentos entre trabajadores.",
        fontStyle: "italic",
        textColor: "#475569",
        wrap: true,
      },
    ],
  ];
}

function getAdjustmentsData(rows: SologControlExportRow[]): SheetData {
  const header = [
    "Fecha",
    "Categoría",
    "Grupo / Producto",
    "Tipo",
    "Códigos internos",
    "Teórico",
    "Físico",
    "Ajuste",
    "Valor económico",
    "Detalle",
    "Estado",
  ].map((value) => ({
    value,
    fontWeight: "bold" as const,
    textColor: HEADER_TEXT,
    backgroundColor: HEADER_BACKGROUND,
    alignVertical: "center" as const,
    wrap: true,
    height: 28,
  }));

  return [
    header,
    ...rows.map((row) => [
      {
        value: getLimaCalendarDate(row.fecha),
        type: Date,
        format: "dd/mm/yyyy",
      },
      row.categoria,
      { value: row.grupo, wrap: true },
      row.tipo,
      {
        value: row.codigos_internos.join(", "),
        type: String,
        format: "@",
        wrap: true,
      },
      { value: row.teorico, type: Number, format: INTEGER_FORMAT },
      { value: row.fisico, type: Number, format: INTEGER_FORMAT },
      { value: row.ajuste, type: Number, format: SIGNED_INTEGER_FORMAT },
      { value: row.valor_economico, type: Number, format: MONEY_FORMAT },
      { value: row.detalle, wrap: true },
      getStateLabel(row.estado),
    ]),
  ];
}

function sanitizeFilenamePart(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "Sede"
  );
}

export function getControlExportFilename(
  response: SologControlExportResponse,
): string {
  return `SOLOG_Ajustes_${sanitizeFilenamePart(response.sede)}_${response.date_from}_${response.date_to}.xlsx`;
}

export async function downloadControlExport(
  response: SologControlExportResponse,
): Promise<string> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const filename = getControlExportFilename(response);
  await writeXlsxFile(
    [
      {
        sheet: "Resumen",
        data: getSummaryData(response),
        columns: [{ width: 25 }, { width: 44 }],
        showGridLines: false,
        zoomScale: 1,
      },
      {
        sheet: "Ajustes",
        data: getAdjustmentsData(response.rows),
        columns: [
          { width: 13 },
          { width: 22 },
          { width: 34 },
          { width: 14 },
          { width: 28 },
          { width: 11 },
          { width: 11 },
          { width: 11 },
          { width: 18 },
          { width: 52 },
          { width: 26 },
        ],
        stickyRowsCount: 1,
        showGridLines: false,
        zoomScale: 1,
      },
    ],
    {
      fontFamily: "Calibri",
      fontSize: 11,
    },
  ).toFile(filename);
  return filename;
}
