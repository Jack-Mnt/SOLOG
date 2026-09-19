import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClockOff,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Eye,
  RotateCcw,
} from "lucide-react";
import { useAdminStore } from "../admin.v2.context";
import { useManagement, useManagementQuery } from "../admin.management.context";
import { AdminDialog } from "../admin.dialog";
import { ReadNotice } from "../admin.management.presentation";
import { AdminNotice, AdminPagination, IconButton } from "../admin.primitives";
import { paginateAdminRows } from "../admin.pagination";
import {
  incidentSiteAbbreviation,
  incidentTimestamp,
} from "./admin.incidents.presentation";
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
  codigo_interno_invalido: "C.interno inválido",
  codigo_interno_duplicado: "C.interno duplicado",
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
  site?: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const query = useManagementQuery("detail", {
    family_key: family.family_key,
    ...(site ? { site_id: site } : {}),
    page,
    page_size: 100,
  });
  return (
    <AdminDialog
      title={`Repeticiones · ${typeLabels[family.tipo]}`}
      description={
        site
          ? "Detalle solicitado bajo demanda para una sede fuente."
          : "Detalle solicitado bajo demanda para todas las sedes."
      }
      onClose={onClose}
      variant="drawer"
      footer={
        <>
          {query.data && (
            <div className="admin-dialog__footer-navigation admin-v2-toolbar">
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
          )}
          <div className="admin-dialog__footer-actions">
            <button type="button" className="button button--secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      }
    >
      {query.data ? (
        <>
          <div
            className="admin-auxiliary-table admin-incidents__detail-table"
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
                    <td>{incidentTimestamp(item.first_seen_at)}</td>
                    <td>{incidentTimestamp(item.last_seen_at)}</td>
                    <td>
                      {item.resuelta_at
                        ? incidentTimestamp(item.resuelta_at)
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
        </>
      ) : (
        <ReadNotice {...query} variant="compact" />
      )}
    </AdminDialog>
  );
}

function canProposeDelete(family: Family) {
  return (
    family.tipo === "producto_ausente" &&
    family.active &&
    family.family_state === "pendiente" &&
    family.c_interno !== null &&
    Number.isSafeInteger(family.c_interno) &&
    family.c_interno > 0 &&
    !family.deletion_proposed
  );
}

function globalIncidentRevision(
  store: ReturnType<typeof useManagement>,
  family: MergedIncidentFamily,
) {
  const revisions = [
    ...new Set(
      family.sources
        .map(
          (source) =>
            store.peek("summary", { site_id: source.siteId }).data?.revisions
              .incidents_global,
        )
        .filter((value): value is number => typeof value === "number"),
    ),
  ];
  return revisions.length === 1 ? revisions[0] : null;
}

function IgnoreDialog({
  family,
  onClose,
  onSuccess,
}: {
  family: MergedIncidentFamily;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const store = useManagement();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const retryable = store.intent("incidents")?.action === "ignore_30d";
  const ignore = () => {
    const revision = globalIncidentRevision(store, family);
    if (!retryable && revision === null) {
      setError(
        "La revisión global de incidencias no está disponible. Actualiza la vista y reintenta.",
      );
      return;
    }
    setError("");
    setRunning(true);
    const request = retryable
      ? store.retryMutation("incidents")
      : store.mutation(
          "ignore_30d",
          {
            family_key: family.family_key,
            scope: "global",
          },
          revision!,
        );
    void request
      .then(() => {
        onSuccess();
        onClose();
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo ignorar la incidencia.",
        ),
      )
      .finally(() => setRunning(false));
  };
  return (
    <AdminDialog
      title="Ignorar incidencia durante 30 días"
      description={`${typeLabels[family.tipo]} · ${family.c_interno ?? family.c_interno_original ?? "Sin código"}`}
      onClose={onClose}
      closeDisabled={running}
      footer={
        <>
          <button
            type="button"
            className="button button--secondary"
            disabled={running}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={running}
            onClick={ignore}
          >
            <AlarmClockOff size={16} aria-hidden="true" />
            {running ? "Procesando…" : retryable ? "Reintentar" : "Ignorar 30 días"}
          </button>
        </>
      }
    >
      <p>Esta incidencia se ignorará durante 30 días en todas las sedes.</p>
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
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
  onRetry,
  retryable,
}: {
  proposal: DeleteProposal;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onRetry: () => Promise<void>;
  retryable: boolean;
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
    void (retryable ? onRetry() : onConfirm())
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
            {proposing ? "Procesando…" : retryable ? "Reintentar" : "Proponer eliminación"}
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
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
    </AdminDialog>
  );
}
export function AdminIncidentsV2() {
  const admin = useAdminStore();
  const store = useManagement();
  const [type, setType] = useState<"all" | IncidentType>("all");
  const [state, setState] = useState<IncidentState>("pendiente");
  const [page, setPage] = useState(0);
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
  const [error, setErrorState] = useState("");
  const [notice, setNoticeState] = useState("");
  const [feedbackOccurrence, setFeedbackOccurrence] = useState(0);
  const [dismissedNotice, setDismissedNotice] = useState("");
  const setError = (message: string) => {
    setErrorState(message);
    if (message) setFeedbackOccurrence((current) => current + 1);
  };
  const setNotice = (message: string) => {
    setNoticeState(message);
    if (message) setFeedbackOccurrence((current) => current + 1);
  };
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
  const paginationKey = JSON.stringify([type, state, siteId, allActive]);
  const [previousPaginationKey, setPreviousPaginationKey] = useState(paginationKey);
  if (paginationKey !== previousPaginationKey) {
    setPreviousPaginationKey(paginationKey);
    setPage(0);
  }
  const paginatedFamilies = useMemo(
    () => paginateAdminRows(families, page),
    [families, page],
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
  const reactivateFamily = (family: MergedIncidentFamily): Promise<void> => {
    const revision = globalIncidentRevision(store, family);
    if (revision === null) {
      const reason = new Error(
        "La revisión global de incidencias no está disponible. Actualiza la vista y reintenta.",
      );
      setError(reason.message);
      return Promise.reject(reason);
    }
    setError("");
    setNotice("");
    return store
      .mutation(
        "reactivate",
        {
          family_key: family.family_key,
          scope: "global",
        },
        revision,
      )
      .then(() => {
        setAllSnapshot([]);
        setNotice("La incidencia fue reactivada.");
      })
      .catch((reason) => {
        if (!store.intent("incidents")) {
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudo actualizar la incidencia.",
          );
        }
        throw reason;
      });
  };
  const proposeDeleteSource = (
    source: IncidentFamilySource,
  ): Promise<void> => {
    const summary = store.peek("summary", { site_id: source.siteId }).data;
    if (!summary) {
      return Promise.reject(
        new Error("La sede ya no tiene un summary vigente. Reintenta la acción."),
      );
    }
    setError("");
    setNotice("");
    return store
      .mutation(
        "propose_delete",
        {
          family_key: source.family.family_key,
          scope: "site",
          site_id: source.siteId,
        },
        summary.revisions.incidents,
        source.siteId,
      )
      .then(() => {
        setNotice(
          "La propuesta de eliminación quedó pendiente para revisión en Catálogo.",
        );
      })
      .catch((reason) => {
        throw reason;
      });
  };
  const pendingIntent = store.intent("incidents");
  const pending = !!pendingIntent;
  const retryIncidentIntent = (): Promise<void> => {
    const intent = store.intent("incidents");
    if (!intent) return Promise.reject(new Error("No hay una operación pendiente."));
    setError("");
    setNotice("");
    return store.retryMutation("incidents").then(() => {
      setAllSnapshot([]);
      const success =
        intent.action === "ignore_30d"
          ? "La incidencia fue ignorada durante 30 días."
          : intent.action === "reactivate"
            ? "La incidencia fue reactivada."
            : "La propuesta de eliminación quedó pendiente para revisión en Catálogo.";
      setNotice(success);
    }).catch((reason) => {
      if (!store.intent("incidents")) {
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo actualizar la incidencia.",
        );
      }
      throw reason;
    });
  };
  const mutationModalOpen = !!ignoreFamily || !!deleteProposal;
  const noticeMessage = error || pendingIntent?.error || notice;
  const noticeKey = pendingIntent
    ? `intent:${String(pendingIntent.payload.operation_id)}:${pendingIntent.attempt}:${pendingIntent.error ? "error" : "pending"}`
    : `local:${feedbackOccurrence}`;
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
          aria-busy={allLoading}
          aria-pressed={allActive}
          disabled={allLoading || !sites.length}
          onClick={() => void toggleAll()}
        >
          Todas las sedes
        </button>
      </div>
      {noticeMessage && !mutationModalOpen && dismissedNotice !== noticeKey && (
        <AdminNotice
          tone={error || pendingIntent?.error ? "error" : "success"}
          onDismiss={pendingIntent ? undefined : () => setDismissedNotice(noticeKey)}
          action={
            pendingIntent && !pendingIntent.pending ? (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void retryIncidentIntent().catch(() => {})}
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
        <div className="admin-table-section">
          <div
            className="admin-main-table"
            role="tabpanel"
            id="admin-incidents-state-panel"
            aria-labelledby={`admin-incidents-state-${state}`}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Tipo</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Sedes</th>
                  <th scope="col">
                    {state === "pendiente"
                      ? "Última detección"
                      : state === "suprimida"
                        ? "Ignorada hasta"
                        : "Resuelta"}
                  </th>
                  <th scope="col" className="admin-table-action-cell">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFamilies.rows.map((item) => {
                  const product =
                    typeof item.datos.producto === "string" &&
                    item.datos.producto.trim()
                      ? item.datos.producto
                      : "Producto sin nombre";
                  const date =
                    state === "pendiente"
                      ? item.last_seen_at
                      : state === "suprimida"
                        ? item.active_suppression_until
                        : item.resolved_at;
                  const reactivable = item.active_suppression_until !== null;
                  const deletable = item.sources.find((source) =>
                    canProposeDelete(source.family),
                  );
                  return (
                    <tr key={item.family_key}>
                      <td>
                        <span className="admin-attribute-badge admin-incidents__type-badge">
                          {typeLabels[item.tipo]}
                        </span>
                      </td>
                      <th scope="row">
                        <span className="admin-table-cell-stack">
                          <span className="admin-table-cell-primary">{product}</span>
                          <span className="admin-table-cell-secondary">
                            {item.c_interno ??
                              item.c_interno_original ??
                              "Sin código"}
                          </span>
                        </span>
                      </th>
                      <td>
                        <div className="admin-incidents__sites">
                          {item.sources.map((source) => (
                            <span
                              key={source.siteId}
                              className="admin-attribute-badge"
                            >
                              {incidentSiteAbbreviation(source.siteName)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{incidentTimestamp(date)}</td>
                      <td className="admin-table-action-cell">
                        <div className="admin-table-actions">
                          <IconButton
                            aria-label={`Ver repeticiones ${item.family_key}`}
                            title="Ver detalle"
                            onClick={() => setDetailFamily(item)}
                          >
                            <Eye size={16} aria-hidden="true" />
                          </IconButton>
                          {state === "pendiente" &&
                            item.active &&
                            !item.sources.every(
                              (source) => source.family.reactivate_available,
                            ) && (
                              <IconButton
                                variant="warning"
                                aria-label="Ignorar 30 días"
                                title="Ignorar 30 días"
                                disabled={pending}
                                onClick={() => setIgnoreFamily(item)}
                              >
                                <AlarmClockOff size={16} aria-hidden="true" />
                              </IconButton>
                            )}
                          {state === "pendiente" && deletable && (
                            <IconButton
                              variant="danger"
                              aria-label="Proponer eliminación"
                              title="Proponer eliminación"
                              disabled={pending}
                              onClick={() =>
                                setDeleteProposal({
                                  family: item,
                                  source: deletable,
                                })
                              }
                            >
                              <CircleOff size={16} aria-hidden="true" />
                            </IconButton>
                          )}
                          {state === "suprimida" && reactivable && (
                            <IconButton
                              aria-label="Reactivar incidencia"
                              title="Reactivar incidencia"
                              disabled={pending}
                              onClick={() =>
                                void reactivateFamily(item).catch(() => {})
                              }
                            >
                              <RotateCcw size={16} aria-hidden="true" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}{" "}
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
          <AdminPagination
            total={families.length}
            currentPage={paginatedFamilies.currentPage}
            pageCount={paginatedFamilies.pageCount}
            onPageChange={setPage}
            ariaLabel="Paginación de incidencias"
          />
        </div>
      ) : (
        <ReadNotice {...normalQuery} />
      )}
      {detailFamily && (
        <FamilyDetail
          key={`${allActive ? "all" : siteId}:${detailFamily.family_key}`}
          family={detailFamily}
          site={allActive ? undefined : siteId}
          onClose={() => setDetailFamily(null)}
        />
      )}
      {ignoreFamily && (
        <IgnoreDialog
          family={ignoreFamily}
          onClose={() => setIgnoreFamily(null)}
          onSuccess={() => {
            setAllSnapshot([]);
            setNotice("La incidencia fue ignorada durante 30 días.");
          }}
        />
      )}
      {deleteProposal && (
        <DeleteProposalDialog
          proposal={deleteProposal}
          onClose={() => setDeleteProposal(null)}
          onConfirm={() => proposeDeleteSource(deleteProposal.source)}
          onRetry={retryIncidentIntent}
          retryable={pendingIntent?.action === "propose_delete"}
        />
      )}
    </section>
  );
}
