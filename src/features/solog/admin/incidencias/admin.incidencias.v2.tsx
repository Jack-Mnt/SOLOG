import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClockOff,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Clock,
  Eye,
  RotateCcw,
} from "lucide-react";
import { useAdminStore } from "../admin.v2.context";
import { useManagement, useManagementQuery } from "../admin.management.context";
import { AdminDialog } from "../admin.dialog";
import { ReadNotice } from "../admin.management.presentation";
import { AdminNotice } from "../admin.primitives";
import { adminTimestamp } from "../admin.v2.format";
import { orderedAdminSites } from "../admin.site-ui";
import {
  incidentAllScopeActive,
  loadIncidentSummaries,
  mergeIncidentSummaries,
  nextIncidentSummaryExpiry,
  reconcileIncidentAllScope,
  toggleIncidentAllScope,
  type IncidentFamilySource,
  type MergedIncidentFamily,
} from "./admin.incidents.multisite";
import type {
  Family,
  IncidentState,
  IncidentType,
} from "../admin.management.v2";

const typeLabels: Record<IncidentType, string> = {
  producto_ausente: "Producto ausente",
  codigo_interno_invalido: "Código interno inválido",
  codigo_interno_duplicado: "Código interno duplicado",
  stock_invalido: "Stock inválido",
};
const stateLabels: Record<IncidentState, string> = {
  pendiente: "Pendiente",
  suprimida: "Suprimida",
  resuelta: "Resuelta",
};
const stateViews: Array<{ state: IncidentState; label: string }> = [
  { state: "pendiente", label: "Pendientes" },
  { state: "suprimida", label: "Suprimidas" },
  { state: "resuelta", label: "Resueltas" },
];

function StateBadge({ state }: { state: IncidentState }) {
  return (
    <span
      className={`admin-incidents__state admin-status-badge admin-status-badge--${state === "pendiente" ? "warning" : state === "resuelta" ? "success" : "info"} admin-incidents__state--${state}`}
    >
      {stateLabels[state]}
    </span>
  );
}

function FamilyDetail({
  family,
  site,
  onClose,
}: {
  family: Family;
  site: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const query = useManagementQuery("detail", {
    family_key: family.family_key,
    site_id: site,
    page,
    page_size: 100,
  });
  return (
    <AdminDialog
      title={`Repeticiones · ${typeLabels[family.tipo]}`}
      description="Detalle solicitado bajo demanda para una sede fuente."
      onClose={onClose}
      wide
    >
      {query.data ? (
        <>
          <div
            className="admin-v2-table admin-incidents__detail-table"
            role="region"
            aria-label="Detalle de repeticiones"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Vigencia</th>
                  <th>Primera detección</th>
                  <th>Última detección</th>
                  <th>Resuelta</th>
                  <th>Apariciones</th>
                  <th>Datos</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.sede}</td>
                    <td>
                      <StateBadge state={item.estado} />
                    </td>
                    <td>{item.active ? "Vigente" : "Histórica"}</td>
                    <td>{adminTimestamp(item.first_seen_at)}</td>
                    <td>{adminTimestamp(item.last_seen_at)}</td>
                    <td>
                      {item.resuelta_at
                        ? adminTimestamp(item.resuelta_at)
                        : "—"}
                    </td>
                    <td>{item.occurrence_count}</td>
                    <td>
                      <details>
                        <summary>Ver datos</summary>
                        <pre className="admin-v2-json">
                          {JSON.stringify(item.datos, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-v2-toolbar">
            <button
              type="button"
              className="button button--secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              type="button"
              className="button button--secondary"
              disabled={query.data.items.length < 100}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      ) : (
        <ReadNotice {...query} />
      )}
    </AdminDialog>
  );
}

function canProposeDelete(family: Family) {
  return (
    family.tipo === "producto_ausente" &&
    family.active &&
    family.c_interno !== null &&
    Number.isSafeInteger(family.c_interno) &&
    family.c_interno > 0 &&
    !family.deletion_proposed
  );
}

function IgnoreDialog({
  family,
  onClose,
  onError,
}: {
  family: MergedIncidentFamily;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const store = useManagement();
  const [runningSite, setRunningSite] = useState<string | null>(null);
  const ignore = (source: IncidentFamilySource) => {
    const summary = store.peek("summary", { site_id: source.siteId }).data;
    if (!summary) {
      onError("La sede ya no tiene un summary vigente. Reintenta la acción.");
      return;
    }
    setRunningSite(source.siteId);
    void store
      .mutation(
        "ignore_30d",
        {
          family_key: family.family_key,
          scope: "site",
          site_id: source.siteId,
        },
        summary.revisions.incidents,
        source.siteId,
      )
      .catch((reason) =>
        onError(
          reason instanceof Error
            ? reason.message
            : "No se pudo ignorar la incidencia.",
        ),
      )
      .finally(() => setRunningSite(null));
  };
  return (
    <AdminDialog
      title="Ignorar incidencia durante 30 días"
      description={`${typeLabels[family.tipo]} · ${family.c_interno ?? family.c_interno_original ?? "Sin código"}`}
      onClose={onClose}
    >
      <div className="admin-incidents__sources">
        {family.sources.map((source) => (
          <div key={source.siteId} className="admin-incidents__source">
            <div>
              <strong>{source.siteName}</strong>
              <span>
                <StateBadge state={source.family.family_state} />
                {source.family.scope_suppression_until
                  ? ` hasta ${adminTimestamp(source.family.scope_suppression_until)}`
                  : ""}
              </span>
            </div>
            {source.family.active && !source.family.reactivate_available ? (
              <button
                type="button"
                className="button button--secondary"
                disabled={runningSite !== null}
                onClick={() => ignore(source)}
              >
                <Clock size={16} aria-hidden="true" />
                {runningSite === source.siteId ? "Ignorando…" : "Ignorar"}
              </button>
            ) : (
              <span className="admin-incidents__source-status">
                Sin acción pendiente
              </span>
            )}
          </div>
        ))}
      </div>
    </AdminDialog>
  );
}

type DeleteProposal = {
  family: MergedIncidentFamily;
  source: IncidentFamilySource;
};

function DeleteProposalDialog({
  proposal,
  onClose,
  onConfirm,
}: {
  proposal: DeleteProposal;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState("");
  const product =
    typeof proposal.source.family.datos.producto === "string"
      ? proposal.source.family.datos.producto
      : null;
  const confirm = () => {
    if (proposing) return;
    setError("");
    setProposing(true);
    void onConfirm()
      .then(onClose)
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo proponer la eliminación.",
        ),
      )
      .finally(() => setProposing(false));
  };
  return (
    <AdminDialog
      title="Proponer eliminación"
      description="Se creará una propuesta de eliminación para revisión en Catálogo."
      onClose={onClose}
      closeDisabled={proposing}
      footer={
        <>
          <button
            type="button"
            className="button button--secondary"
            disabled={proposing}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={proposing}
            onClick={confirm}
          >
            {proposing ? "Proponiendo…" : "Proponer eliminación"}
          </button>
        </>
      }
    >
      <p>
        <strong>
          Producto ausente ·{" "}
          {proposal.source.family.c_interno ??
            proposal.source.family.c_interno_original ??
            "Sin código"}
        </strong>
      </p>
      {product && <p>{product}</p>}
      <p>
        Detectado en: <strong>{proposal.source.siteName}</strong>
      </p>
      {error && <p role="alert">{error}</p>}
    </AdminDialog>
  );
}
export function AdminIncidentsV2() {
  const admin = useAdminStore();
  const store = useManagement();
  const [type, setType] = useState<"all" | IncidentType>("all");
  const [state, setState] = useState<IncidentState>("pendiente");
  const [detailFamily, setDetailFamily] = useState<MergedIncidentFamily | null>(
    null,
  );
  const [ignoreFamily, setIgnoreFamily] = useState<MergedIncidentFamily | null>(
    null,
  );
  const [deleteProposal, setDeleteProposal] = useState<DeleteProposal | null>(
    null,
  );
  const [allOriginSite, setAllOriginSite] = useState<string | null>(null);
  const [allLoading, setAllLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dismissedNotice, setDismissedNotice] = useState("");
  const allLoadRef = useRef<Promise<void> | null>(null);
  const [allSnapshot, setAllSnapshot] = useState<MergedIncidentFamily[]>([]);
  const siteId = admin.siteId;
  const allActive = incidentAllScopeActive(allOriginSite, siteId);
  const normalQuery = useManagementQuery(
    "summary",
    { site_id: siteId },
    { enabled: !!siteId && !allActive },
  );
  const sites = useMemo(
    () => orderedAdminSites(admin.bootstrap?.allowed_sites ?? []),
    [admin.bootstrap],
  );
  const ensureAllSummaries = useCallback(() => {
    if (allLoadRef.current) return allLoadRef.current;
    setAllLoading(true);
    const request = loadIncidentSummaries(store, sites).then(() => undefined);
    allLoadRef.current = request;
    const cleanup = () => {
      if (allLoadRef.current === request) allLoadRef.current = null;
      setAllLoading(false);
    };
    void request.then(cleanup, cleanup);
    return request;
  }, [sites, store]);

  useEffect(() => {
    const reconciled = reconcileIncidentAllScope(allOriginSite, siteId);
    if (reconciled === allOriginSite) return;
    const cancel = window.setTimeout(() => setAllOriginSite(reconciled), 0);
    return () => window.clearTimeout(cancel);
  }, [allOriginSite, siteId]);

  const allSources = sites
    .map((site) => {
      const summary = store.peek("summary", { site_id: site.id }).data;
      return summary
        ? { siteId: site.id, siteName: site.nombre, summary }
        : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const allComplete = sites.length > 0 && allSources.length === sites.length;
  const mergedAll = useMemo(
    () => (allComplete ? mergeIncidentSummaries(allSources) : null),
    [allComplete, allSources],
  );
  useEffect(() => {
    if (!allActive || !mergedAll) return;
    const update = window.setTimeout(() => setAllSnapshot(mergedAll), 0);
    return () => window.clearTimeout(update);
  }, [allActive, mergedAll]);

  const allNextExpiry = nextIncidentSummaryExpiry(store, sites);
  useEffect(() => {
    if (!allActive || !sites.length) return;

    const refreshIfNeeded = () => {
      const missing = sites.some(
        (site) => !store.peek("summary", { site_id: site.id }).data,
      );
      if (!missing) return;
      setError("");
      setNotice("");
      void ensureAllSummaries().catch((reason) => {
        setAllOriginSite(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo actualizar todas las sedes.",
        );
      });
    };

    if (!allComplete) {
      refreshIfNeeded();
      return;
    }

    const delay =
      allNextExpiry === undefined
        ? null
        : Math.max(0, allNextExpiry - Date.now()) + 25;
    const timer =
      delay === null ? null : window.setTimeout(refreshIfNeeded, delay);
    const onPageShow = () => refreshIfNeeded();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [allActive, allComplete, allNextExpiry, ensureAllSummaries, sites, store]);

  const displayedFamilies = useMemo(() => {
    if (allActive) return mergedAll ?? allSnapshot;
    if (!normalQuery.data || !siteId) return [];
    const siteName = sites.find((site) => site.id === siteId)?.nombre ?? siteId;
    return mergeIncidentSummaries([
      { siteId, siteName, summary: normalQuery.data },
    ]);
  }, [allActive, allSnapshot, mergedAll, normalQuery.data, siteId, sites]);
  const families = useMemo(
    () =>
      displayedFamilies.filter(
        (item) =>
          (type === "all" || item.tipo === type) && item.family_state === state,
      ),
    [displayedFamilies, state, type],
  );
  const stateCounts = useMemo(() => {
    const available = displayedFamilies.filter(
      (item) => type === "all" || item.tipo === type,
    );
    return {
      pendiente: available.filter((item) => item.family_state === "pendiente")
        .length,
      suprimida: available.filter((item) => item.family_state === "suprimida")
        .length,
      resuelta: available.filter((item) => item.family_state === "resuelta")
        .length,
    };
  }, [displayedFamilies, type]);
  const toggleAll = async () => {
    const nextOrigin = toggleIncidentAllScope(allOriginSite, siteId);
    if (nextOrigin === null) {
      setAllOriginSite(null);
      return;
    }
    setError("");
    setNotice("");
    try {
      await ensureAllSummaries();
      setAllOriginSite(nextOrigin);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cargar todas las sedes.",
      );
    }
  };
  const actSource = (
    source: IncidentFamilySource,
    action: "reactivate" | "propose_delete",
  ): Promise<void> => {
    const summary = store.peek("summary", { site_id: source.siteId }).data;
    if (!summary) {
      const reason = new Error(
        "La sede ya no tiene un summary vigente. Reintenta la acción.",
      );
      setError(reason.message);
      return Promise.reject(reason);
    }
    setError("");
    setNotice("");
    return store
      .mutation(
        action,
        {
          family_key: source.family.family_key,
          scope: "site",
          site_id: source.siteId,
        },
        summary.revisions.incidents,
        source.siteId,
      )
      .then(() => {
        if (action === "propose_delete")
          setNotice(
            "La propuesta de eliminación quedó pendiente para revisión en Catálogo.",
          );
      })
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo actualizar la incidencia.",
        );
        throw reason;
      });
  };
  const pendingIntent = store.intent("incidents");
  const pending = !!pendingIntent;
  const noticeMessage = error || pendingIntent?.error || notice;
  const noticeKey = String(
    pendingIntent?.payload.operation_id ?? noticeMessage,
  );
  const hasData = allActive || !!normalQuery.data;
  return (
    <section className="admin-incidents">
      <div className="admin-incidents__controls">
        <div
          className="admin-state-views"
          role="tablist"
          aria-label="Estado de incidencias"
          onKeyDown={(event) => {
            if (
              ![
                "ArrowRight",
                "ArrowDown",
                "ArrowLeft",
                "ArrowUp",
                "Home",
                "End",
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            const currentIndex = stateViews.findIndex(
              (view) => view.state === state,
            );
            const direction =
              event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? stateViews.length - 1
                  : (currentIndex + direction + stateViews.length) %
                    stateViews.length;
            const nextView = stateViews[nextIndex];
            setState(nextView.state);
            event.currentTarget
              .querySelector<HTMLButtonElement>(
                `#admin-incidents-state-${nextView.state}`,
              )
              ?.focus();
          }}
        >
          {stateViews.map((view) => (
            <button
              key={view.state}
              id={`admin-incidents-state-${view.state}`}
              type="button"
              role="tab"
              aria-selected={state === view.state}
              aria-controls="admin-incidents-state-panel"
              tabIndex={state === view.state ? 0 : -1}
              onClick={() => setState(view.state)}
            >
              <span>{view.label}</span>
              <strong>{stateCounts[view.state]}</strong>
            </button>
          ))}
        </div>
        <label className="admin-toolbar__filter admin-incidents__type">
          Tipo:
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "all" | IncidentType)
            }
          >
            <option value="all">Todos</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button--primary"
          aria-pressed={allActive}
          disabled={allLoading || !sites.length}
          onClick={() => void toggleAll()}
        >
          {allLoading ? "Cargando sedes…" : "Todas las sedes"}
        </button>
      </div>
      {noticeMessage && dismissedNotice !== noticeKey && (
        <AdminNotice
          tone={error || pendingIntent?.error ? "error" : "success"}
          onDismiss={() => setDismissedNotice(noticeKey)}
          action={
            pendingIntent && !pendingIntent.pending ? (
              <button
                type="button"
                className="button button--secondary"
                onClick={() =>
                  void store.retryMutation("incidents").catch(() => {})
                }
              >
                Reintentar
              </button>
            ) : undefined
          }
        >
          {error || pendingIntent?.error || notice}
        </AdminNotice>
      )}{" "}
      {hasData ? (
        <div className="admin-table-section admin__table">
          <div
            className="admin-v2-table"
            role="tabpanel"
            id="admin-incidents-state-panel"
            aria-labelledby={`admin-incidents-state-${state}`}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Incidencia</th>
                  <th>Estado</th>
                  <th>Casos</th>
                  <th>Supresión</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {families.map((item) => (
                  <tr key={item.family_key}>
                    <th scope="row">
                      <span>{typeLabels[item.tipo]}</span>
                      <small>
                        {item.c_interno ??
                          item.c_interno_original ??
                          "Sin código"}
                      </small>
                    </th>
                    <td>
                      <StateBadge state={item.family_state} />
                    </td>
                    <td>
                      {item.active_cases} activos · {item.resolved_cases}{" "}
                      resueltos
                    </td>
                    <td>
                      {item.active_suppression_until ? (
                        <>
                          Vigente hasta{" "}
                          {adminTimestamp(item.active_suppression_until)}
                        </>
                      ) : (
                        "Sin supresión"
                      )}
                    </td>
                    <td>
                      <div className="admin-v2-actions">
                        <button
                          type="button"
                          className="button button--secondary"
                          aria-label={`Ver repeticiones ${item.family_key}`}
                          onClick={() => setDetailFamily(item)}
                        >
                          <Eye size={16} aria-hidden="true" />
                        </button>
                        {item.active &&
                          !item.sources.every(
                            (source) => source.family.reactivate_available,
                          ) && (
                            <button
                              type="button"
                              className="button button--secondary icon-button--warning"
                              disabled={pending}
                              onClick={() => setIgnoreFamily(item)}
                            >
                              <AlarmClockOff size={16} aria-hidden="true" />
                            </button>
                          )}
                        {item.sources.find(
                          (source) => source.family.reactivate_available,
                        ) && (
                          <button
                            type="button"
                            className="button button--secondary"
                            disabled={pending}
                            onClick={() =>
                              void actSource(
                                item.sources.find(
                                  (source) =>
                                    source.family.reactivate_available,
                                )!,
                                "reactivate",
                              ).catch(() => {})
                            }
                          >
                            <RotateCcw size={16} aria-hidden="true" />
                          </button>
                        )}
                        {item.sources.find((source) =>
                          canProposeDelete(source.family),
                        ) && (
                          <button
                            type="button"
                            className="button button--secondary icon-button--danger"
                            disabled={pending}
                            aria-label="Proponer eliminación"
                            title="Proponer eliminación"
                            onClick={() => {
                              const source = item.sources.find((candidate) =>
                                canProposeDelete(candidate.family),
                              );
                              if (source)
                                setDeleteProposal({ family: item, source });
                            }}
                          >
                            <CircleOff size={16} aria-hidden="true" />
                          </button>
                        )}
                        {item.deletion_proposed && (
                          <button
                            type="button"
                            className="button button--secondary"
                            disabled
                          >
                            <CircleOff size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!families.length && (
                  <tr>
                    <td colSpan={5}>
                      No hay incidencias que coincidan con los filtros locales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ReadNotice {...normalQuery} />
      )}
      {detailFamily && (
        <FamilyDetail
          key={`${detailFamily.sources[0].siteId}:${detailFamily.family_key}`}
          family={detailFamily.sources[0].family}
          site={detailFamily.sources[0].siteId}
          onClose={() => setDetailFamily(null)}
        />
      )}
      {ignoreFamily && (
        <IgnoreDialog
          family={ignoreFamily}
          onClose={() => setIgnoreFamily(null)}
          onError={setError}
        />
      )}
      {deleteProposal && (
        <DeleteProposalDialog
          proposal={deleteProposal}
          onClose={() => setDeleteProposal(null)}
          onConfirm={() => actSource(deleteProposal.source, "propose_delete")}
        />
      )}
    </section>
  );
}
