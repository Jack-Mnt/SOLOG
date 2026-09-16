import { describe, expect, test } from "bun:test";
import { ManagementStore } from "../src/features/solog/admin/admin.management.store";
import { loadIncidentSummaries, mergeIncidentSummaries } from "../src/features/solog/admin/incidencias/admin.incidents.multisite";
import { bootstrapFixture } from "./fixtures/admin-v2.mjs";
import { managementFixture, mutationFixture } from "./fixtures/admin-management.mjs";

const summary = (siteId: string, siteName: string, family: Record<string, unknown>) => ({
  siteId, siteName, summary: { ...managementFixture("summary", { site_id: siteId }), families: [family] },
});

describe("Incidencias multisede", () => {
  test("reutiliza las sedes cacheadas y carga las faltantes en orden canónico", async () => {
    const cached = managementFixture("summary", { site_id: "site-a" });
    const calls: string[] = [];
    const store = {
      peek: (_action: "summary", payload: { site_id: string }) => ({ data: payload.site_id === "site-a" ? cached : undefined }),
      load: async (_action: "summary", payload: { site_id: string }) => { calls.push(payload.site_id); return managementFixture("summary", payload); },
    };
    const loaded = await loadIncidentSummaries(store, [{ id: "site-a", nombre: "Cutervo" }, { id: "site-b", nombre: "Huaca" }, { id: "site-c", nombre: "Divino" }]);
    expect(calls).toEqual(["site-b", "site-c"]);
    expect(loaded.map((source) => source.siteName)).toEqual(["Cutervo", "Huaca", "Divino"]);
  });

  test("un fallo conserva las sedes ya cargadas y el reintento pide solo la faltante", async () => {
    const cache = new Map<string, ReturnType<typeof managementFixture>>();
    const calls: string[] = [];
    let fail = true;
    const store = {
      peek: (_action: "summary", payload: { site_id: string }) => ({ data: cache.get(payload.site_id) }),
      load: async (_action: "summary", payload: { site_id: string }) => {
        calls.push(payload.site_id);
        if (payload.site_id === "site-b" && fail) { fail = false; throw new Error("Huaca no disponible"); }
        const value = managementFixture("summary", payload); cache.set(payload.site_id, value); return value;
      },
    };
    const sites = [{ id: "site-a", nombre: "Cutervo" }, { id: "site-b", nombre: "Huaca" }];
    await expect(loadIncidentSummaries(store, sites)).rejects.toThrow("Huaca no disponible");
    await loadIncidentSummaries(store, sites);
    expect(calls).toEqual(["site-a", "site-b", "site-b"]);
  });
  test("agrega por family_key, conserva fuentes y aplica la precedencia de estado", () => {
    const base = managementFixture("summary", { site_id: "site-a" }).families[0];
    const [merged] = mergeIncidentSummaries([
      summary("site-a", "Cutervo", { ...base, cases: 2, occurrences: 3, sites: 1, pending_cases: 2, suppressed_cases: 0, resolved_cases: 0, active_cases: 2, first_seen_at: "2026-09-03T12:00:00Z", last_seen_at: "2026-09-04T12:00:00Z", resolved_at: null }),
      summary("site-b", "Huaca", { ...base, cases: 4, occurrences: 5, sites: 1, pending_cases: 0, suppressed_cases: 4, resolved_cases: 0, active_cases: 4, first_seen_at: "2026-09-02T12:00:00Z", last_seen_at: "2026-09-05T12:00:00Z", resolved_at: null }),
      summary("site-c", "Divino", { ...base, cases: 1, occurrences: 1, sites: 1, pending_cases: 0, suppressed_cases: 0, resolved_cases: 1, active_cases: 0, active: false, family_state: "resuelta", first_seen_at: "2026-09-01T12:00:00Z", last_seen_at: "2026-09-06T12:00:00Z", resolved_at: "2026-09-06T12:00:00Z" }),
    ]);
    expect(merged).toMatchObject({ cases: 7, occurrences: 9, sites: 3, pending_cases: 2, suppressed_cases: 4, resolved_cases: 1, active_cases: 6, active: true, family_state: "pendiente", first_seen_at: "2026-09-01T12:00:00Z", last_seen_at: "2026-09-06T12:00:00Z", resolved_at: "2026-09-06T12:00:00Z" });
    expect(merged.sources.map((source) => [source.siteId, source.siteName])).toEqual([["site-a", "Cutervo"], ["site-b", "Huaca"], ["site-c", "Divino"]]);
  });

  test("la mutación confirmada conserva el summary, actualiza revisión y evita relecturas", async () => {
    const auth = bootstrapFixture();
    const calls: string[] = [];
    const store = new ManagementStore("admin-test", () => auth, () => {}, async (action, payload) => {
      calls.push(`${action}:${String(payload.site_id ?? "")}`);
      return managementFixture(action, payload);
    }, async (action, payload) => mutationFixture(action, payload, false, { groups: 4, catalog: 6, incidents: Number(payload.expected_revision) + 1, devices: 3 }));
    const before = await store.load("summary", { site_id: "site-a" });
    await store.mutation("ignore_30d", { family_key: before.families[0].family_key, scope: "site", site_id: "site-a" }, before.revisions.incidents, "site-a");
    const patched = store.peek("summary", { site_id: "site-a" }).data;
    expect(patched?.revisions.incidents).toBe(5);
    expect(patched?.families[0]).toMatchObject({ pending_cases: 0, suppressed_cases: 2, family_state: "suprimida", reactivate_available: true });
    await store.mutation("ignore_30d", { family_key: before.families[0].family_key, scope: "site", site_id: "site-a" }, patched!.revisions.incidents, "site-a");
    expect(calls).toEqual(["summary:site-a"]);
    expect(store.peek("summary", { site_id: "site-a" }).data?.revisions.incidents).toBe(6);
  });

  test("un fallo de mutación no altera la familia cacheada", async () => {
    const auth = bootstrapFixture();
    const store = new ManagementStore("admin-test", () => auth, () => {}, async (action, payload) => managementFixture(action, payload), async () => { throw new Error("red caída"); });
    const before = await store.load("summary", { site_id: "site-a" });
    await expect(store.mutation("ignore_30d", { family_key: before.families[0].family_key, scope: "site", site_id: "site-a" }, before.revisions.incidents, "site-a")).rejects.toThrow("red caída");
    expect(store.peek("summary", { site_id: "site-a" }).data?.families[0].family_state).toBe("pendiente");
  });
});