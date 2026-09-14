import type { CashierV3Panel } from "./cajero.v3";
import type { CajeroStockType } from "./cajero.types";

export function initialCajeroStockType(search: string): CajeroStockType | null {
  const stock = new URLSearchParams(search).get("stock");
  return stock === "zero" || stock === "negative" ? stock : null;
}

/** Visual progress only; the backend remains authoritative for period completion. */
export function deriveCajeroProgress(
  panel: Pick<CashierV3Panel, "groups" | "count_queue" | "kpis">,
  drafts: readonly { grupo_id: string }[],
) {
  const groupsById = new Map(
    panel.groups.map((group) => [group.grupo_id, group]),
  );
  // Solo los drafts normales que todavía no forman parte de la cobertura
  // autoritativa proyectan avance visual. Los reconteos no cubren período.
  const draftIds = new Set(
    drafts
      .map((draft) => draft.grupo_id)
      .filter(
        (grupoId) => groupsById.get(grupoId)?.cobertura_periodo === false,
      ),
  );
  const coverageCount = Math.min(
    panel.kpis.groups_total,
    panel.kpis.coverage_counted + draftIds.size,
  );
  const coveragePercent =
    panel.kpis.groups_total > 0
      ? Math.round((coverageCount / panel.kpis.groups_total) * 10000) / 100
      : 0;
  return {
    coverageCount,
    coveragePercent,
    select(type: CajeroStockType, categoryId?: string) {
      // El denominador de una sesión es el conjunto congelado, no la cola
      // residual que el backend va reduciendo después de cada envío.
      const selected = panel.groups.filter(
        (group) =>
          (categoryId === undefined || group.categoria_id === categoryId) &&
          (type === "positive"
            ? group.stock_teorico > 0
            : type === "zero"
              ? group.stock_teorico === 0
              : group.stock_teorico < 0),
      );
      const completed = new Set(
        selected
          .filter(
            (group) => group.cobertura_periodo || draftIds.has(group.grupo_id),
          )
          .map((group) => group.grupo_id),
      );
      return {
        ids: new Set(selected.map((group) => group.grupo_id)),
        total: selected.length,
        completed: completed.size,
      };
    },
  };
}
