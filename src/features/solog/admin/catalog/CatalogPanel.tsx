import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import {
  getSologCatalogChangeStatusLabel,
  getSologCatalogChangeTypeLabel,
} from "../../labels";
import type {
  SologCatalogChangeRow,
  SologCatalogChangeStatus,
  SologCatalogNewProductConfig,
} from "../../types";
import { getCatalogChangeLabel, formatCatalogDate } from "./catalog-format";
import { CatalogChangeDetail } from "./CatalogChangeDetail";
import { CatalogFilters } from "./CatalogFilters";
import { CatalogPublicationCard } from "./CatalogPublicationCard";
import { CatalogPublicationDialog } from "./CatalogPublicationDialog";
import { NewProductApprovalForm } from "./NewProductApprovalForm";
import { requiresNewProductConfiguration } from "../catalog-domain";
import {
  CATALOG_CHANGES_PAGE_SIZE,
  useCatalogChanges,
} from "./useCatalogChanges";
import { useCatalogPublication } from "./useCatalogPublication";
import { useCatalogStatus } from "./useCatalogStatus";

const STATUS_TABS: SologCatalogChangeStatus[] = [
  "pendiente",
  "aprobado",
  "ignorado",
  "incorporado",
];

const EMPTY_MESSAGES: Record<SologCatalogChangeStatus, string> = {
  pendiente: "No hay cambios pendientes.",
  aprobado: "No hay cambios aprobados para la próxima versión.",
  ignorado: "No hay cambios ignorados.",
  incorporado: "No hay cambios incorporados con estos filtros.",
};

function CatalogTable({
  caption,
  rows,
  showVersion,
  onSelect,
  relatedChangeIds,
}: {
  caption: string;
  rows: SologCatalogChangeRow[];
  showVersion?: boolean;
  onSelect: (row: SologCatalogChangeRow) => void;
  relatedChangeIds?: string[];
}) {
  if (rows.length === 0)
    return <div className="empty-state">No hay cambios en esta sección.</div>;
  return (
    <div className="admin-report-table-wrap catalog-table-wrap">
      <table className="admin-report-table admin-interactive-table catalog-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Producto</th>
            <th>Cambio</th>
            <th>Sedes</th>
            <th>Última detección</th>
            <th>Ocurrencias</th>
            {showVersion ? <th>Versión</th> : null}
            <th aria-label="Acción" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entity =
              row.producto ??
              row.catalogo_actual.producto ??
              (typeof row.datos.nombre === "string"
                ? row.datos.nombre
                : "Grupo sin nombre");
            const changeLabel = getCatalogChangeLabel(row);
            return (
              <tr
                className={
                  row.cambio_id && relatedChangeIds?.includes(row.cambio_id)
                    ? "catalog-row--related"
                    : undefined
                }
                key={row.propuesta_fingerprint}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(row);
                }}
                role="button"
                tabIndex={0}
              >
                <td>
                  <span className="catalog-type-cell">
                    <strong>{getSologCatalogChangeTypeLabel(row.tipo)}</strong>
                    <small>
                      {row.ambito === "grupo" ? "Grupo" : "Producto"}
                    </small>
                  </span>
                </td>
                <td>
                  <div
                    className="catalog-product-cell"
                    title={
                      row.c_interno === null
                        ? entity
                        : `${entity} · ${row.c_interno}`
                    }
                  >
                    <strong>{entity}</strong>
                    {row.c_interno !== null ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <small>{row.c_interno}</small>
                      </>
                    ) : null}
                  </div>
                </td>
                <td>
                  <span className="catalog-change-cell" title={changeLabel}>
                    {changeLabel}
                  </span>
                </td>
                <td>
                  <span
                    className="catalog-sites-cell"
                    title={row.sedes.map((site) => site.nombre).join(" · ")}
                  >
                    {row.sedes.length
                      ? row.sedes.map((site) => site.nombre).join(" · ")
                      : "Sin sedes"}
                  </span>
                </td>
                <td>{formatCatalogDate(row.last_seen_at)}</td>
                <td>
                  <strong className="catalog-occurrences">
                    {row.occurrence_count}×
                  </strong>
                </td>
                {showVersion ? (
                  <td>
                    {row.version_aplicada === null
                      ? "—"
                      : `V${row.version_aplicada}`}
                  </td>
                ) : null}
                <td className="catalog-row-action">
                  <ChevronRight aria-hidden="true" size={17} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CatalogPanel({
  refreshOperationalState,
  role,
}: {
  refreshOperationalState: () => Promise<void>;
  role: "admin" | "moderador";
}) {
  const catalog = useCatalogChanges({ refreshOperationalState });
  const {
    data: catalogStatusData,
    error: catalogStatusError,
    refresh: refreshCatalogStatus,
    status: catalogStatusLoadState,
  } = useCatalogStatus(refreshOperationalState);
  const [selected, setSelected] = useState<SologCatalogChangeRow | null>(null);
  const [configuring, setConfiguring] = useState<SologCatalogChangeRow | null>(
    null,
  );
  const [relatedChangeIds, setRelatedChangeIds] = useState<string[]>([]);
  const rows = catalog.response?.rows ?? [];
  const counts = catalog.response?.counts ?? {};
  const pendingCount =
    (counts.urgentes_pendientes ?? 0) + (counts.cambios_pendientes ?? 0);
  const activeStatus = catalog.appliedFilters.estado;
  const splitPending = activeStatus === "pendiente";
  const urgentRows = splitPending
    ? rows.filter((row) => row.seccion === "urgente")
    : [];
  const pendingRows = splitPending
    ? rows.filter((row) => row.seccion === "pendiente")
    : [];

  const handlePublished = useCallback(() => {
    setSelected(null);
    setConfiguring(null);
    catalog.selectStatus("incorporado");
    void refreshCatalogStatus();
  }, [catalog, refreshCatalogStatus]);
  const handlePublicationRejected = useCallback(() => {
    void catalog.refresh();
    void refreshOperationalState();
  }, [catalog, refreshOperationalState]);
  const publication = useCatalogPublication({
    onPublished: handlePublished,
    onRejected: handlePublicationRejected,
  });

  const getStatusCount = (status: SologCatalogChangeStatus): number =>
    status === "pendiente" ? pendingCount : (counts[status] ?? 0);

  const ignoreChange = async (change: SologCatalogChangeRow) => {
    if (
      !window.confirm(
        "¿Ignorar este cambio?\n\nEsta propuesta exacta dejará de aparecer como pendiente.\n\nSi ConeXion detecta posteriormente un valor diferente para el mismo producto, ese nuevo cambio podrá aparecer nuevamente.",
      )
    )
      return;
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: "ignore",
    });
    if (completed) setSelected(null);
  };

  const approveChange = async (change: SologCatalogChangeRow) => {
    if (requiresNewProductConfiguration(change)) {
      setSelected(null);
      setConfiguring(change);
      void catalog.loadReference();
      return;
    }
    if (
      !window.confirm(
        "¿Aprobar este cambio para la próxima versión?\n\nAprobar no modifica el catálogo actual. El cambio quedará pendiente de incorporación hasta que Administración publique una nueva versión.",
      )
    )
      return;
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: "approve",
    });
    if (completed) setSelected(null);
  };

  const approveNewProduct = async (
    change: SologCatalogChangeRow,
    config: SologCatalogNewProductConfig,
  ) => {
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: "approve",
      config,
    });
    if (completed) setConfiguring(null);
  };

  const withdrawChange = async (change: SologCatalogChangeRow) => {
    if (
      !window.confirm(
        "¿Retirar la aprobación?\n\nEl cambio volverá a Pendiente y no se incorporará mientras no sea aprobado nuevamente.",
      )
    )
      return;
    const completed = await catalog.applyDecision({
      propuesta_fingerprint: change.propuesta_fingerprint,
      decision: "withdraw",
    });
    if (completed) setSelected(null);
  };

  const viewRelatedChanges = (changeIds: string[]) => {
    setRelatedChangeIds(changeIds);
    publication.resetDialog();
    catalog.selectStatus("aprobado");
  };

  const selectChange = (change: SologCatalogChangeRow) => {
    setSelected(change);
    if (
      change.tipo === "clasificacion_producto" ||
      change.tipo === "definicion_grupo"
    )
      void catalog.loadReference();
  };

  const displayCurrentVersion =
    publication.publishedVersion ?? catalogStatusData?.version_actual ?? null;

  return (
    <div className="content-section admin-module catalog-workbench">
      <CatalogPublicationCard
        approvedCount={counts.aprobado ?? 0}
        currentVersion={displayCurrentVersion}
        isAdmin={role === "admin"}
        nextVersion={null}
        notice={publication.notice}
        onDismissNotice={publication.dismissNotice}
        onPrepare={() => void publication.prepare()}
        publishedAt={catalogStatusData?.publicado_at ?? null}
        preparing={
          publication.status === "preparing" ||
          publication.status === "publishing"
        }
        statusError={catalogStatusError}
        statusLoading={catalogStatusLoadState === "loading"}
      />

      <div
        className="catalog-state-chips"
        role="tablist"
        aria-label="Estado de cambios de catálogo"
      >
        {STATUS_TABS.map((status) => (
          <button
            aria-selected={catalog.draftFilters.estado === status}
            className={
              catalog.draftFilters.estado === status ? "is-active" : undefined
            }
            disabled={catalog.status === "loading"}
            key={status}
            onClick={() => catalog.selectStatus(status)}
            role="tab"
            type="button"
          >
            <span>{getSologCatalogChangeStatusLabel(status)}</span>
            <strong>{getStatusCount(status)}</strong>
          </button>
        ))}
      </div>
      <CatalogFilters
        filters={catalog.draftFilters}
        loading={catalog.status === "loading"}
        onApply={catalog.applyFilters}
        onReset={catalog.resetFilters}
        onUpdate={catalog.updateFilters}
      />
      {catalog.notice ? (
        <div className="notice notice--success" role="status">
          <strong>{catalog.notice}</strong>
          <button className="text-button" onClick={catalog.dismissNotice}>
            Cerrar
          </button>
        </div>
      ) : null}
      {relatedChangeIds.length && activeStatus === "aprobado" ? (
        <div className="notice" role="status">
          <strong>Cambios relacionados con el conflicto</strong>
          <p>
            Las filas disponibles en esta página están resaltadas. IDs
            involucrados: {relatedChangeIds.length}.
          </p>
          <button
            className="text-button"
            onClick={() => setRelatedChangeIds([])}
          >
            Quitar resaltado
          </button>
        </div>
      ) : null}
      {catalog.error ? (
        <div className="notice notice--error" role="alert">
          <strong>No se pudieron cargar los cambios de catálogo</strong>
          <p>{catalog.error}</p>
        </div>
      ) : null}
      {catalog.status === "loading" ? (
        <div className="empty-state" role="status">
          Consultando cambios de catálogo…
        </div>
      ) : null}
      {catalog.status === "ready" && rows.length === 0 ? (
        <div className="empty-state">{EMPTY_MESSAGES[activeStatus]}</div>
      ) : null}

      {catalog.status === "ready" && rows.length > 0 && splitPending ? (
        <div className="admin-catalog-groups">
          <section>
            <h3>
              Cambios urgentes <span>· {urgentRows.length}</span>
            </h3>
            <CatalogTable
              caption="Cambios urgentes pendientes"
              onSelect={selectChange}
              rows={urgentRows}
              relatedChangeIds={relatedChangeIds}
            />
          </section>
          <section>
            <h3>
              Cambios pendientes <span>· {pendingRows.length}</span>
            </h3>
            <CatalogTable
              caption="Cambios no urgentes pendientes"
              onSelect={selectChange}
              rows={pendingRows}
              relatedChangeIds={relatedChangeIds}
            />
          </section>
        </div>
      ) : null}
      {catalog.status === "ready" && rows.length > 0 && !splitPending ? (
        <CatalogTable
          caption={`Cambios de catálogo: ${getSologCatalogChangeStatusLabel(activeStatus)}`}
          onSelect={selectChange}
          relatedChangeIds={relatedChangeIds}
          rows={rows}
          showVersion={activeStatus === "incorporado"}
        />
      ) : null}

      {catalog.response && rows.length > 0 ? (
        <nav
          className="admin-report-pagination"
          aria-label="Paginación de catálogo"
        >
          <button
            className="button button--secondary"
            disabled={catalog.offset === 0 || catalog.status === "loading"}
            onClick={catalog.previousPage}
            type="button"
          >
            <ArrowLeft size={17} /> Anterior
          </button>
          <span>
            Página {Math.floor(catalog.offset / CATALOG_CHANGES_PAGE_SIZE) + 1}
          </span>
          <button
            className="button button--secondary"
            disabled={
              rows.length < CATALOG_CHANGES_PAGE_SIZE ||
              catalog.status === "loading"
            }
            onClick={catalog.nextPage}
            type="button"
          >
            Siguiente <ArrowRight size={17} />
          </button>
        </nav>
      ) : null}

      {selected ? (
        <CatalogChangeDetail
          acting={catalog.actingFingerprint === selected.propuesta_fingerprint}
          change={selected}
          onApprove={() => void approveChange(selected)}
          onClose={() => setSelected(null)}
          onIgnore={() => void ignoreChange(selected)}
          onWithdraw={() => void withdrawChange(selected)}
          reference={catalog.reference}
        />
      ) : null}
      {configuring ? (
        <NewProductApprovalForm
          change={configuring}
          key={configuring.propuesta_fingerprint}
          onClose={() => setConfiguring(null)}
          onLoadReference={() => void catalog.loadReference()}
          onSubmit={(config) => void approveNewProduct(configuring, config)}
          reference={catalog.reference}
          referenceError={catalog.referenceError}
          referenceStatus={catalog.referenceStatus}
          submitting={
            catalog.actingFingerprint === configuring.propuesta_fingerprint
          }
        />
      ) : null}
      {publication.status !== "idle" ? (
        <CatalogPublicationDialog
          conflicts={publication.conflicts}
          error={publication.error}
          onClose={publication.resetDialog}
          onPrepare={() => void publication.prepare()}
          onPublish={() => void publication.publish()}
          onViewRelated={viewRelatedChanges}
          preview={publication.preview}
          status={publication.status}
          validationErrors={publication.validationErrors}
        />
      ) : null}
    </div>
  );
}
