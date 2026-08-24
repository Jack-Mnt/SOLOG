import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { getSologAdminIncidentTypeLabel } from "../../labels";
import type {
  SologAdminIncidentDecision,
  SologAdminIncidentRow,
} from "../../types";
import { IncidentDetail } from "./IncidentDetail";
import { IncidentFilters } from "./IncidentFilters";
import { formatIncidentDate } from "./incident-format";
import {
  ADMIN_INCIDENTS_PAGE_SIZE,
  type AdminIncidentState,
  useAdminIncidents,
} from "./useAdminIncidents";

const DECISION_CONFIRMATIONS: Record<SologAdminIncidentDecision, string> = {
  reviewed:
    "¿Marcar esta incidencia como revisada?\n\nSi vuelve a detectarse, aparecerá nuevamente como pendiente.",
  ignore_15d:
    "¿Ignorar esta incidencia durante 15 días?\n\nLas nuevas detecciones del mismo C. interno + tipo permanecerán suprimidas durante ese periodo.",
  deleted:
    "¿Confirmar producto eliminado?\n\nEsto indica que Administración confirmó que el producto fue eliminado manualmente del POS.\n\nNo se eliminará inmediatamente del catálogo. Se creará una propuesta de eliminación en el módulo Catálogo.",
};

const COUNT_CARDS = [
  ["pendiente", "Pendientes"],
  ["revisada", "Revisadas"],
  ["suprimida", "Suprimidas"],
  ["eliminada", "Eliminadas"],
] as const;

export function IncidentsPanel({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>;
}) {
  const incidents = useAdminIncidents({ refreshOperationalState });
  const [selected, setSelected] = useState<SologAdminIncidentRow | null>(null);
  const rows = incidents.response?.rows ?? [];
  const counts = incidents.response?.counts ?? {};

  const handleDecision = async (decision: SologAdminIncidentDecision) => {
    if (!selected || !window.confirm(DECISION_CONFIRMATIONS[decision])) return;
    const completed = await incidents.applyDecision({
      incident_id: selected.id,
      action: decision,
    });
    if (completed) setSelected(null);
  };

  return (
    <div className="content-section admin-module incidents-workbench">
      <div
        className="incidents-state-chips"
        aria-label="Filtrar por estado"
        role="group"
      >
        {COUNT_CARDS.map(([key, label]) => (
          <button
            aria-pressed={incidents.draftFilters.estado === key}
            className={
              incidents.draftFilters.estado === key ? "is-active" : undefined
            }
            disabled={incidents.status === "loading"}
            key={key}
            onClick={() => incidents.selectState(key as AdminIncidentState)}
            type="button"
          >
            <span>{label}</span>
            <strong>{counts[key] ?? 0}</strong>
          </button>
        ))}
      </div>

      <IncidentFilters
        filters={incidents.draftFilters}
        loading={incidents.status === "loading"}
        onApply={incidents.applyFilters}
        onReset={incidents.resetFilters}
        onUpdate={incidents.updateFilters}
      />

      {incidents.notice ? (
        <div className="notice notice--success" role="status">
          <strong>{incidents.notice}</strong>
          <button className="text-button" onClick={incidents.dismissNotice}>
            Cerrar
          </button>
        </div>
      ) : null}
      {incidents.loadError ? (
        <div className="notice notice--error" role="alert">
          <strong>No se pudieron cargar las incidencias</strong>
          <p>{incidents.loadError}</p>
        </div>
      ) : null}
      {incidents.actionError ? (
        <div className="notice notice--error" role="alert">
          <strong>No se pudo aplicar la acción</strong>
          <p>{incidents.actionError}</p>
        </div>
      ) : null}
      {incidents.status === "loading" ? (
        <div className="empty-state" role="status">
          Consultando incidencias…
        </div>
      ) : null}
      {incidents.status === "ready" && rows.length === 0 ? (
        <div className="empty-state">
          No hay incidencias con los filtros seleccionados.
        </div>
      ) : null}

      {incidents.status === "ready" && rows.length > 0 ? (
        <div className="admin-report-table-wrap incidents-table-wrap">
          <table className="admin-report-table admin-interactive-table incidents-table">
            <caption>Incidencias administrativas</caption>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Producto</th>
                <th>Última detección</th>
                <th>Ocurrencias</th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      setSelected(row);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td>{getSologAdminIncidentTypeLabel(row.tipo)}</td>
                  <td>
                    <div className="incidents-product-cell">
                      <small>
                        {row.c_interno ??
                          row.c_interno_original ??
                          "Sin código"}
                      </small>
                      <span aria-hidden="true">·</span>
                      <strong>{row.producto ?? "Sin producto"}</strong>
                    </div>
                  </td>
                  <td>{formatIncidentDate(row.last_seen_at)}</td>
                  <td>
                    <strong className="incidents-occurrences">
                      {row.occurrence_count}×
                    </strong>
                  </td>
                  <td className="incidents-row-action">
                    <ChevronRight aria-hidden="true" size={17} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {incidents.response && rows.length > 0 ? (
        <nav
          className="admin-report-pagination"
          aria-label="Paginación de incidencias"
        >
          <button
            className="button button--secondary"
            disabled={incidents.offset === 0 || incidents.status === "loading"}
            onClick={incidents.previousPage}
            type="button"
          >
            <ArrowLeft size={17} /> Anterior
          </button>
          <span>
            Página{" "}
            {Math.floor(incidents.offset / ADMIN_INCIDENTS_PAGE_SIZE) + 1}
          </span>
          <button
            className="button button--secondary"
            disabled={
              rows.length < ADMIN_INCIDENTS_PAGE_SIZE ||
              incidents.status === "loading"
            }
            onClick={incidents.nextPage}
            type="button"
          >
            Siguiente <ArrowRight size={17} />
          </button>
        </nav>
      ) : null}

      {selected ? (
        <IncidentDetail
          acting={incidents.actingId === selected.id}
          incident={selected}
          onClose={() => setSelected(null)}
          onDecision={(decision) => void handleDecision(decision)}
        />
      ) : null}
    </div>
  );
}
