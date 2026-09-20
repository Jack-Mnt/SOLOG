import { describe, expect, test } from "bun:test";
import { ManagementStore } from "../src/features/solog/admin/admin.management.store";
import {
  incidentAllScopeActive,
  loadIncidentSummaries,
  mergeIncidentSummaries,
  nextIncidentSummaryExpiry,
  reconcileIncidentAllScope,
  toggleIncidentAllScope,
} from "../src/features/solog/admin/incidencias/admin.incidents.multisite";
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

  test("si todas las sedes están cacheadas no realiza nuevas lecturas", async () => {
    const cached = new Map([
      ["site-a", managementFixture("summary", { site_id: "site-a" })],
      ["site-b", managementFixture("summary", { site_id: "site-b" })],
      ["site-c", managementFixture("summary", { site_id: "site-c" })],
    ]);
    const calls: string[] = [];
    const store = {
      peek: (_action: "summary", payload: { site_id: string }) => ({ data: cached.get(payload.site_id) }),
      load: async (_action: "summary", payload: { site_id: string }) => {
        calls.push(payload.site_id);
        return managementFixture("summary", payload);
      },
    };
    const loaded = await loadIncidentSummaries(store, [
      { id: "site-a", nombre: "Cutervo" },
      { id: "site-b", nombre: "Huaca" },
      { id: "site-c", nombre: "Divino" },
    ]);
    expect(calls).toEqual([]);
    expect(loaded).toHaveLength(3);
  });

  test("el toggle activa, desactiva y se invalida al cambiar la sede del Shell", () => {
    let origin: string | null = null;
    expect(incidentAllScopeActive(origin, "site-a")).toBe(false);

    origin = toggleIncidentAllScope(origin, "site-a");
    expect(origin).toBe("site-a");
    expect(incidentAllScopeActive(origin, "site-a")).toBe(true);

    expect(reconcileIncidentAllScope(origin, "site-b")).toBeNull();
    expect(incidentAllScopeActive(origin, "site-b")).toBe(false);

    origin = toggleIncidentAllScope(origin, "site-a");
    expect(origin).toBeNull();
    expect(incidentAllScopeActive(origin, "site-a")).toBe(false);
  });

  test("usa la expiración más temprana para refrescar el agregado multisede", () => {
    const expiries = new Map([
      ["site-a", 3000],
      ["site-b", 2000],
      ["site-c", 4000],
    ]);
    const store = {
      peek: (_action: "summary", payload: { site_id: string }) => ({
        expiresAt: expiries.get(payload.site_id),
      }),
    };
    expect(nextIncidentSummaryExpiry(store, [
      { id: "site-a" },
      { id: "site-b" },
      { id: "site-c" },
    ])).toBe(2000);
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

  test("una mutación global invalida summaries de todas las sedes", async () => {
    const auth = bootstrapFixture();
    const store = new ManagementStore(
      "admin-test",
      () => auth,
      () => {},
      async (action, payload) => managementFixture(action, payload),
      async (action, payload) => mutationFixture(action, payload),
    );
    const siteA = await store.load("summary", { site_id: "site-a" });
    await store.load("summary", { site_id: "site-b" });
    await store.mutation(
      "ignore_30d",
      { family_key: siteA.families[0].family_key, scope: "global" },
      siteA.revisions.incidents_global,
    );
    expect(store.peek("summary", { site_id: "site-a" }).data).toBeUndefined();
    expect(store.peek("summary", { site_id: "site-b" }).data).toBeUndefined();
  });

  test("un fallo de mutación no altera la familia cacheada", async () => {
    const auth = bootstrapFixture();
    const store = new ManagementStore("admin-test", () => auth, () => {}, async (action, payload) => managementFixture(action, payload), async () => { throw new Error("red caída"); });
    const before = await store.load("summary", { site_id: "site-a" });
    await expect(store.mutation("ignore_30d", { family_key: before.families[0].family_key, scope: "site", site_id: "site-a" }, before.revisions.incidents, "site-a")).rejects.toThrow("red caída");
    expect(store.peek("summary", { site_id: "site-a" }).data?.families[0].family_state).toBe("pendiente");
  });
  test("propose_delete actualiza deletion_proposed en todos los summaries cacheados", async () => {
    const auth = bootstrapFixture();
    const store = new ManagementStore(
      "admin-test",
      () => auth,
      () => {},
      async (action, payload) => managementFixture(action, payload),
      async (action, payload) => mutationFixture(action, payload),
    );
    const siteA = await store.load("summary", { site_id: "site-a" });
    await store.load("summary", { site_id: "site-b" });
    await store.mutation(
      "propose_delete",
      {
        family_key: siteA.families[0].family_key,
        scope: "site",
        site_id: "site-a",
      },
      siteA.revisions.incidents,
      "site-a",
    );
    const siteACached = store.peek("summary", { site_id: "site-a" }).data;
    expect(
      siteACached === undefined ||
        siteACached.families[0].deletion_proposed === true,
    ).toBe(true);
    expect(
      store.peek("summary", { site_id: "site-b" }).data?.families[0]
        .deletion_proposed,
    ).toBe(true);
  });
  test("CircleOff difiere propose_delete hasta la confirmación con la fuente seleccionada", async () => {
    const source = await Bun.file("src/features/solog/admin/incidencias/admin.incidencias.v2.tsx").text();
    expect(source).toMatch(
      /const\s+deletable\s*=\s*item\.sources\.find\(\(source\)\s*=>\s*canProposeDelete\(source\.family\),?\s*\)/,
    );
    expect(source).toMatch(
      /setDeleteProposal\(\{\s*family:\s*item,?\s*source:\s*deletable,?\s*\}\)/,
    );
    expect(source).toContain('title="Aprobar eliminación"');
    expect(source).toContain('onConfirm={() => proposeDeleteSource(deleteProposal.source)}');
    expect(source).toContain('family.family_state === "pendiente"');
    expect(source).toContain('scope: "site"');
    expect(source).toContain('summary.revisions.incidents');
    expect(source).toContain('<AdminNotice tone="info">');
    expect(source).toContain('<dt>Detectado en</dt>');
    expect(source).toContain('<CircleOff size={16} aria-hidden="true" />');
    expect(source).toMatch(/void \(retryable \? onRetry\(\) : onConfirm\(\)\)\s*\.then\(onClose\)\s*\.catch/);
    expect(source).toContain('retryable ? "Reintentar" : "Aprobar eliminación"');
  });

  test("la fecha de supresión multisede solo se conserva cuando las fuentes coinciden", () => {
    const base = managementFixture("summary", { site_id: "site-a" }).families[0];
    const until = "2026-10-16T12:00:00Z";
    const [consistent] = mergeIncidentSummaries([
      summary("site-a", "Cutervo", {
        ...base,
        pending_cases: 0,
        suppressed_cases: 2,
        resolved_cases: 0,
        active_cases: 2,
        family_state: "suprimida",
        active_suppression_until: until,
      }),
      summary("site-b", "Huaca", {
        ...base,
        pending_cases: 0,
        suppressed_cases: 2,
        resolved_cases: 0,
        active_cases: 2,
        family_state: "suprimida",
        active_suppression_until: until,
      }),
    ]);
    expect(consistent.active_suppression_until).toBe(until);

    const [conflicting] = mergeIncidentSummaries([
      summary("site-a", "Cutervo", {
        ...base,
        pending_cases: 0,
        suppressed_cases: 2,
        resolved_cases: 0,
        active_cases: 2,
        family_state: "suprimida",
        active_suppression_until: "2026-10-16T12:00:00Z",
      }),
      summary("site-b", "Huaca", {
        ...base,
        pending_cases: 0,
        suppressed_cases: 2,
        resolved_cases: 0,
        active_cases: 2,
        family_state: "suprimida",
        active_suppression_until: "2026-10-17T12:00:00Z",
      }),
    ]);
    expect(conflicting.active_suppression_until).toBeNull();
  });

  test("Ignorar y Reactivar usan revisión global y el detalle multisede omite site_id", async () => {
    const source = await Bun.file(
      "src/features/solog/admin/incidencias/admin.incidencias.v2.tsx",
    ).text();
    expect(source).toContain('scope: "global"');
    expect(source).toContain("globalIncidentRevision(store, family)");
    expect(source).toContain("reactivateFamily(item)");
    expect(source).not.toContain("runningSite");
    expect(source).not.toContain('className="admin-incidents__sources"');
    expect(source).toContain(
      "Esta incidencia dejará de aparecer como pendiente durante el período indicado.",
    );
    expect(source).toContain("<dt>Alcance</dt>");
    expect(source).toContain("<dd>Todas las sedes</dd>");
    expect(source).toContain("<dt>Duración</dt>");
    expect(source).toContain("<dd>30 días</dd>");
    expect(source).toContain("Ignorar no resuelve ni elimina la incidencia.");
    expect(source).toContain('setNotice("La incidencia fue reactivada.")');
    expect(source).toContain(
      'setNotice("La incidencia fue ignorada durante 30 días.")',
    );
    expect(source).toMatch(
      /useManagementQuery\(\s*"detail_sites",\s*\{\s*family_key:\s*family\.family_key,\s*\}\s*\)/,
    );
    expect(source).toMatch(
      /useManagementQuery\(\s*"detail",\s*\{\s*family_key:\s*family\.family_key,\s*page:\s*0,\s*page_size:\s*100,\s*\}/,
    );
    expect(source).not.toContain('site={allActive ? undefined : siteId}');
    expect(source).not.toContain("detailFamily.sources[0]");
  });
});