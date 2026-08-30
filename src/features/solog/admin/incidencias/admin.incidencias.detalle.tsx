import { CheckCheck, Clock3, PackageX } from "lucide-react";
import {
  getSologAdminIncidentDecisionLabel,
  getSologAdminIncidentStatusLabel,
  getSologAdminIncidentTypeLabel,
} from "../../labels";
import type {
  SologAdminIncidentDecision,
  SologAdminIncidentRow,
} from "../../types";
import { AdminDialog } from "../admin.dialog";
import {
  canDeleteMissingProduct,
  canIgnoreMissingProduct,
  canReviewIncident,
} from "../catalogo/admin.catalogo.domain";
import {
  abbreviateIdentifier,
  formatIncidentData,
  getSimpleIncidentData,
} from "./admin.incidencias.domain";
import { formatIncidentDate } from "./admin.incidencias.format";

export function IncidentDetail({
  incident,
  acting,
  onClose,
  onDecision,
}: {
  incident: SologAdminIncidentRow;
  acting: boolean;
  onClose: () => void;
  onDecision: (decision: SologAdminIncidentDecision) => void;
}) {
  const isPending = incident.estado === "pendiente";
  const canReview = isPending && canReviewIncident(incident);
  const canIgnore = isPending && canIgnoreMissingProduct(incident);
  const canDelete = isPending && canDeleteMissingProduct(incident);
  const hasActions = canReview || canIgnore || canDelete;
  const simpleData = getSimpleIncidentData(incident.datos);
  const hasTechnicalDetails = Boolean(
    incident.c_interno_original ||
    incident.primer_snapshot_id ||
    incident.ultimo_snapshot_id,
  );

  return (
    <AdminDialog
      className="incident-dialog"
      footer={
        hasActions ? (
          <>
            {canReview ? (
              <button
                className="button"
                disabled={acting}
                onClick={() => onDecision("reviewed")}
                type="button"
              >
                <CheckCheck size={17} />{" "}
                {getSologAdminIncidentDecisionLabel("reviewed")}
              </button>
            ) : null}
            {canIgnore ? (
              <button
                className="button button--secondary"
                disabled={acting}
                onClick={() => onDecision("ignore_15d")}
                type="button"
              >
                <Clock3 size={17} />{" "}
                {getSologAdminIncidentDecisionLabel("ignore_15d")}
              </button>
            ) : null}
            {canDelete ? (
              <button
                className="button button--danger"
                disabled={acting}
                onClick={() => onDecision("deleted")}
                type="button"
              >
                <PackageX size={17} /> Eliminar
              </button>
            ) : null}
          </>
        ) : undefined
      }
      onClose={onClose}
      title={getSologAdminIncidentTypeLabel(incident.tipo)}
    >
      <div className="incident-detail-hero">
        <span
          className={`admin-state-badge admin-state-badge--${incident.estado}`}
        >
          {getSologAdminIncidentStatusLabel(incident.estado)}
        </span>
        <strong>{incident.producto ?? "Producto no identificado"}</strong>
        <span>
          C. interno:{" "}
          {incident.c_interno ?? incident.c_interno_original ?? "No disponible"}
        </span>
      </div>

      <div className="incident-detail-context">
        <p>
          {incident.sede ?? "Sin sede"} <span aria-hidden="true">·</span>{" "}
          {incident.categoria ?? "Sin categoría"}
        </p>
        <p>
          <span>Grupo:</span> {incident.grupo ?? "No disponible"}
        </p>
      </div>

      <dl className="incident-detail-facts">
        <div>
          <dt>Ocurrencias</dt>
          <dd>{incident.occurrence_count}</dd>
        </div>
        <div>
          <dt>Primera detección</dt>
          <dd>{formatIncidentDate(incident.first_seen_at)}</dd>
        </div>
        <div>
          <dt>Última detección</dt>
          <dd>{formatIncidentDate(incident.last_seen_at)}</dd>
        </div>
        <div>
          <dt>Stock actual</dt>
          <dd>{incident.stock_actual ?? "No disponible"}</dd>
        </div>
      </dl>

      <section className="incident-detected-data">
        <h3>Datos detectados</h3>
        {simpleData ? (
          <dl>
            {simpleData.map((entry) => (
              <div key={entry.key}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <pre>{formatIncidentData(incident.datos)}</pre>
        )}
      </section>

      {hasTechnicalDetails ? (
        <details className="incident-technical-details">
          <summary>Detalles técnicos</summary>
          <dl>
            <div>
              <dt>C. interno original</dt>
              <dd>{incident.c_interno_original ?? "No aplica"}</dd>
            </div>
            <div title={incident.primer_snapshot_id ?? undefined}>
              <dt>Primer snapshot</dt>
              <dd><code>{abbreviateIdentifier(incident.primer_snapshot_id)}</code></dd>
            </div>
            <div title={incident.ultimo_snapshot_id ?? undefined}>
              <dt>Último snapshot</dt>
              <dd><code>{abbreviateIdentifier(incident.ultimo_snapshot_id)}</code></dd>
            </div>
          </dl>
        </details>
      ) : null}
    </AdminDialog>
  );
}
