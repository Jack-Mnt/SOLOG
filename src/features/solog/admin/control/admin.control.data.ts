import { paginateAdminRows } from "../admin.pagination";
import type {
  ControlGroupItem,
  DifferenceState,
  StateSummary,
} from "../admin.v2";

export type ControlSort =
  | "default"
  | "recent"
  | "oldest"
  | "difference_desc"
  | "difference_asc"
  | "valued_desc";

// V10: count the complete dataset; never re-evaluate the backend's classifications.
export function controlView(
  items: ControlGroupItem[],
  state: DifferenceState | "",
  search: string,
  sort: ControlSort,
  page: number,
) {
  const summary: StateSummary = {
    total: items.length,
    coincide: 0,
    pending_recount: 0,
    confirmed: 0,
    inconsistent: 0,
  };
  const keys = {
    Coincide: "coincide",
    Recontar: "pending_recount",
    Confirmada: "confirmed",
    Inconsistente: "inconsistent",
  } as const;
  for (const item of items) summary[keys[item.state]]++;
  const term = search.trim().toLocaleLowerCase("es-PE");
  const filtered = items.filter(
    (item) =>
      (!state || item.state === state) &&
      item.group_name.toLocaleLowerCase("es-PE").includes(term),
  );
  const ordered =
    sort === "default"
      ? filtered
      : [...filtered].sort((a, b) => {
          switch (sort) {
            case "recent":
              return Date.parse(b.origin_at) - Date.parse(a.origin_at);
            case "oldest":
              return Date.parse(a.origin_at) - Date.parse(b.origin_at);
            case "difference_desc":
              return b.difference - a.difference;
            case "difference_asc":
              return a.difference - b.difference;
            case "valued_desc":
              return b.valued_difference - a.valued_difference;
          }
        });
  const paginated = paginateAdminRows(ordered, page);
  return {
    summary,
    total: ordered.length,
    ...paginated,
  };
}
