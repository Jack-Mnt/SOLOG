import type { SheetData } from "write-excel-file/browser";
import type { ControlExport } from "../admin.v2";
import { adminTimestamp } from "../admin.v2.format";
type CellValue = string | number | null;
function sheet(headers: string[], rows: CellValue[][]): SheetData {
  return [
    headers.map((value) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#10b981",
    })),
    ...rows.map((row) =>
      row.map((value) =>
        value === null
          ? { value: "" }
          : typeof value === "number"
            ? { value, type: Number, format: "#,##0.00" }
            : { value, type: String },
      ),
    ),
  ];
}
export function buildAdminWorkbook(data: ControlExport) {
  const common = ["Grupo", "Categoría", "Fecha de origen"];
  const base = (r: {
    grupo: string;
    categoria: string;
    fecha_origen: string;
  }) => [r.grupo, r.categoria, adminTimestamp(r.fecha_origen)];
  return {
    sheets: ["Resumen", "Ajustes", "Por recontar", "Inconsistentes", "Todas"],
    data: [
      sheet(
        ["Concepto", "Valor"],
        [
          ["Sede", data.site.nombre],
          [
            "Período",
            data.period.key === "current_biweekly"
              ? "Período actual quincenal"
              : "Período anterior quincenal",
          ],
          ["Desde", data.period.from],
          ["Hasta", data.period.to],
          ["Total", data.summary.total],
          ["Coincide", data.summary.coincide],
          ["Por recontar", data.summary.pending_recount],
          ["Confirmadas", data.summary.confirmed],
          ["Inconsistentes", data.summary.inconsistent],
        ],
      ),
      sheet(
        [
          ...common,
          "Estado",
          "Teórico aplicable",
          "Físico aplicable",
          "Diferencia",
          "Valorizado (S/)",
          "Fuente",
        ],
        data.adjustments.map((r) => [
          ...base(r),
          r.estado,
          r.teorico,
          r.fisico,
          r.diferencia,
          r.valorizado,
          r.source,
        ]),
      ),
      sheet(
        [...common, "Teórico de conteo", "Físico de conteo", "Diferencia"],
        data.pending_recount.map((r) => [
          ...base(r),
          r.teorico_conteo,
          r.fisico_conteo,
          r.diferencia,
        ]),
      ),
      sheet(
        [
          ...common,
          "Teórico de conteo",
          "Físico de conteo",
          "Diferencia de conteo",
          "Teórico de reconteo",
          "Físico de reconteo",
          "Diferencia de reconteo",
          "Estado",
        ],
        data.inconsistent.map((r) => [
          ...base(r),
          r.teorico_conteo,
          r.fisico_conteo,
          r.diferencia_conteo,
          r.teorico_reconteo,
          r.fisico_reconteo,
          r.diferencia_reconteo,
          r.estado,
        ]),
      ),
      sheet(
        [
          ...common,
          "Estado",
          "Teórico aplicable",
          "Físico aplicable",
          "Diferencia",
          "Valorizado (S/)",
          "Fuente",
          "Recontado",
        ],
        data.all.map((r) => [
          ...base(r),
          r.estado,
          r.teorico,
          r.fisico,
          r.diferencia,
          r.valorizado,
          r.source,
          adminTimestamp(r.recontado_at),
        ]),
      ),
    ],
  };
}
export async function downloadAdminWorkbook(
  data: ControlExport,
  isCurrent: () => boolean = () => true,
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const workbook = buildAdminWorkbook(data);
  if (!isCurrent()) throw new Error("El contexto de exportación cambió.");
  await writeXlsxFile(
    workbook.data.map((rows, i) => ({
      sheet: workbook.sheets[i],
      data: rows,
      columns: rows[0].map(() => ({ width: 24 })),
      stickyRowsCount: 1,
    })),
    { fontFamily: "Calibri", fontSize: 11 },
  ).toFile(
    `SOLOG_Ajustes_${data.site.nombre.replace(/[^\p{L}\p{N}_-]/gu, "_")}_${data.period.from}_${data.period.to}.xlsx`,
  );
}
