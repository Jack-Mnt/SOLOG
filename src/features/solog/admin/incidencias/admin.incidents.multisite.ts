import type { Family, Reads } from "../admin.management.v2";

export interface IncidentFamilySource {
  siteId: string;
  siteName: string;
  family: Family;
}

export type MergedIncidentFamily = Family & { sources: IncidentFamilySource[] };

export interface IncidentSummarySource {
  siteId: string;
  siteName: string;
  summary: Reads["summary"];
}

const earliest = (values: string[]) => values.reduce((first, value) => value < first ? value : first);
const latest = (values: string[]) => values.reduce((last, value) => value > last ? value : last);
const latestNullable = (values: Array<string | null>) => {
  const present = values.filter((value): value is string => value !== null);
  return present.length ? latest(present) : null;
};

export interface IncidentSummaryCache {
  peek(action: "summary", payload: { site_id: string }): { data?: Reads["summary"] };
  load(action: "summary", payload: { site_id: string }): Promise<Reads["summary"]>;
}

/** Loads only absent site summaries, in the caller-provided canonical site order. */
export async function loadIncidentSummaries(
  store: IncidentSummaryCache,
  sites: readonly { id: string; nombre: string }[],
): Promise<IncidentSummarySource[]> {
  const summaries: IncidentSummarySource[] = [];
  for (const site of sites) {
    const cached = store.peek("summary", { site_id: site.id }).data;
    const summary = cached ?? await store.load("summary", { site_id: site.id });
    summaries.push({ siteId: site.id, siteName: site.nombre, summary });
  }
  return summaries;
}
export function incidentFamilyState(family: Pick<Family, "pending_cases" | "suppressed_cases">): Family["family_state"] {
  return family.pending_cases > 0 ? "pendiente" : family.suppressed_cases > 0 ? "suprimida" : "resuelta";
}

/** Merges only already-authoritative site summaries; it never mutates their source families. */
export function mergeIncidentSummaries(summaries: readonly IncidentSummarySource[]): MergedIncidentFamily[] {
  const grouped = new Map<string, IncidentFamilySource[]>();
  for (const summary of summaries) for (const family of summary.summary.families) {
    const sources = grouped.get(family.family_key) ?? [];
    sources.push({ siteId: summary.siteId, siteName: summary.siteName, family });
    grouped.set(family.family_key, sources);
  }
  return [...grouped.values()].map((sources) => {
    const representative = sources[0].family;
    const sum = (key: "cases" | "occurrences" | "pending_cases" | "suppressed_cases" | "resolved_cases" | "active_cases") => sources.reduce((total, source) => total + source.family[key], 0);
    const pending_cases = sum("pending_cases");
    const suppressed_cases = sum("suppressed_cases");
    const active_cases = sum("active_cases");
    return {
      ...representative,
      sources,
      cases: sum("cases"),
      occurrences: sum("occurrences"),
      sites: new Set(sources.map((source) => source.siteId)).size,
      pending_cases,
      suppressed_cases,
      resolved_cases: sum("resolved_cases"),
      active_cases,
      active: active_cases > 0,
      family_state: incidentFamilyState({ pending_cases, suppressed_cases }),
      first_seen_at: earliest(sources.map((source) => source.family.first_seen_at)),
      last_seen_at: latest(sources.map((source) => source.family.last_seen_at)),
      resolved_at: latestNullable(sources.map((source) => source.family.resolved_at)),
      active_suppression_until: latestNullable(sources.map((source) => source.family.active_suppression_until)),
      scope_suppression_until: null,
      reactivate_available: false,
      deletion_proposed: sources.some((source) => source.family.deletion_proposed),
    };
  });
}