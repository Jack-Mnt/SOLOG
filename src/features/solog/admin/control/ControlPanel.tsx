import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import { getSologDifferenceStateLabel } from "../../labels";
import type {
  SologControlRow,
  SologDifferenceState,
} from "../../types";
import { formatAdminCurrency, formatSignedInteger } from "../format";
import { formatControlDate, getControlDifferenceClass } from "./control-format";
import { ControlDrawer } from "./ControlDrawer";
import { SOLOG_CONTROL_PAGE_SIZE, useSologControl } from "./useSologControl";
import { useSologControlExport } from "./useSologControlExport";

const RESOLVER_STATES: SologDifferenceState[] = [
  "pendiente",
  "parcialmente_explicada",
  "persistente",
  "confirmada_reconteo",
  "conteos_inconsistentes",
];

const HISTORY_STATES: SologDifferenceState[] = [
  "coincide",
  "pendiente",
  "probablemente_explicada",
  ...RESOLVER_STATES.slice(1),
];

function DifferenceBadge({ state }: { state: SologDifferenceState }) {
  return (
    <span className={`control-state-badge control-state-badge--${state}`}>
      {getSologDifferenceStateLabel(state)}
    </span>
  );
}

function ControlTable({
  rows,
  disabled,
  onSelect,
}: {
  rows: SologControlRow[];
  disabled: boolean;
  onSelect: (row: SologControlRow) => void;
}) {
  return (
    <div className="admin-report-table-wrap control-table-wrap">
      <table className="admin-report-table admin-interactive-table control-table">
        <caption>Observaciones de Control</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Grupo</th>
            <th>Categoría</th>
            <th>Teórico</th>
            <th>Físico</th>
            <th>Diferencia</th>
            <th>Valor</th>
            <th>Estado</th>
            <th>Stock posterior</th>
            <th>Reconteo</th>
            <th aria-label="Abrir detalle" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              aria-disabled={disabled}
              key={row.detalle_id}
              onClick={() => {
                if (!disabled) onSelect(row);
              }}
              onKeyDown={(event) => {
                if (!disabled && (event.key === "Enter" || event.key === " "))
                  onSelect(row);
              }}
              role="button"
              tabIndex={disabled ? -1 : 0}
            >
              <td>{formatControlDate(row.contado_at)}</td>
              <td>
                <strong>{row.grupo}</strong>
              </td>
              <td>{row.categoria}</td>
              <td>{row.stock_teorico}</td>
              <td>{row.stock_fisico}</td>
              <td>
                <span className={getControlDifferenceClass(row.diferencia)}>
                  {formatSignedInteger(row.diferencia)}
                </span>
              </td>
              <td>{formatAdminCurrency(row.valor_diferencia)}</td>
              <td>
                <DifferenceBadge state={row.estado_diferencia} />
              </td>
              <td>{row.stock_posterior ?? "—"}</td>
              <td>{row.reconteo_stock ?? "—"}</td>
              <td>
                <ChevronRight aria-hidden="true" size={17} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ControlPanel({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>;
}) {
  const control = useSologControl({ refreshOperationalState });
  const exportControl = useSologControlExport();
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const response = control.status === "error" ? null : control.response;
  const rows = response?.rows ?? [];
  const summary = response?.summary;
  const stateOptions =
    control.query.scope === "resolver" ? RESOLVER_STATES : HISTORY_STATES;
  const pageStart =
    response && response.total > 0 ? control.query.offset + 1 : 0;
  const pageEnd = response
    ? Math.min(control.query.offset + rows.length, response.total)
    : 0;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    control.submitSearch();
  };

  return (
    <section
      className="content-section admin-module control-workbench"
      aria-label="Bandeja de Control"
    >
      <div className="admin-view-toolbar">
        <div
          className="control-mode-switch"
          role="group"
          aria-label="Modo de Control"
        >
          <button
            aria-pressed={control.query.scope === "resolver"}
            className={
              control.query.scope === "resolver" ? "is-active" : undefined
            }
            onClick={() => control.selectScope("resolver")}
            type="button"
          >
            Por resolver
          </button>
          <button
            aria-pressed={control.query.scope === "historial"}
            className={
              control.query.scope === "historial" ? "is-active" : undefined
            }
            onClick={() => control.selectScope("historial")}
            type="button"
          >
            Historial
          </button>
        </div>
        <div className="admin-view-actions">
          <button
            className="button button--secondary control-export-button"
            disabled={exportControl.exporting || !control.query.sedeId}
            onClick={() =>
              void exportControl.exportExcel({
                sede_id: control.query.sedeId,
                date_from: control.query.dateFrom,
                date_to: control.query.dateTo,
              })
            }
            type="button"
          >
            {exportControl.exporting ? (
              <LoaderCircle aria-hidden="true" className="icon-spin" size={17} />
            ) : (
              <FileSpreadsheet aria-hidden="true" size={17} />
            )}
            {exportControl.exporting ? "Generando Excel…" : "Exportar Excel"}
          </button>
        </div>
      </div>

      {control.query.scope === "resolver" && summary ? (
        <div className="control-summary" aria-label="Resumen por estado">
          {(
            [
              ["pendiente", "Pendientes", summary.pendientes],
              ["persistente", "Persistentes", summary.persistentes],
              [
                "parcialmente_explicada",
                "Parcialmente explicadas",
                summary.parcialmente_explicadas,
              ],
              [
                "conteos_inconsistentes",
                "Inconsistentes",
                summary.inconsistentes,
              ],
            ] as const
          ).map(([state, label, value]) => (
            <button
              aria-pressed={control.query.estado === state}
              className={
                control.query.estado === state ? "is-active" : undefined
              }
              key={state}
              onClick={() =>
                control.selectState(control.query.estado === state ? "" : state)
              }
              type="button"
            >
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="control-toolbar admin-filter-bar">
        <label className="admin-filter-field admin-filter-field--select">
          Estado
          <select
            onChange={(event) =>
              control.selectState(
                event.target.value as "" | SologDifferenceState,
              )
            }
            value={control.query.estado}
          >
            <option value="">Todos los estados</option>
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {getSologDifferenceStateLabel(state)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter-field admin-filter-field--select">
          Categoría
          <select
            onFocus={() => void control.loadCategories()}
            onChange={(event) => control.selectCategory(event.target.value)}
            value={control.query.categoriaId}
          >
            <option value="">Todas las categorías</option>
            {control.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </select>
          {control.categoryStatus === "loading" ? (
            <small>Cargando categorías…</small>
          ) : null}
          {control.categoryError ? (
            <small className="control-validation">
              {control.categoryError}
            </small>
          ) : null}
        </label>
        <form
          className="control-search admin-filter-inline-form"
          onSubmit={handleSearch}
        >
          <label className="admin-filter-field admin-filter-search-field">
            Buscar
            <div className="admin-filter-search-control">
              <Search aria-hidden="true" size={17} />
              <input
                autoComplete="off"
                onChange={(event) => control.setSearchDraft(event.target.value)}
                placeholder="Buscar grupo, producto o código…"
                type="search"
                value={control.searchDraft}
              />
            </div>
          </label>
          <button className="button admin-filter-apply" type="submit">
            Aplicar
          </button>
        </form>
      </div>

      {exportControl.notice ? (
        <div
          className="notice notice--success control-export-message"
          role="status"
        >
          <span>{exportControl.notice}</span>
          <button
            className="text-button"
            onClick={exportControl.dismissNotice}
            type="button"
          >
            Cerrar
          </button>
        </div>
      ) : null}
      {exportControl.error ? (
        <div
          className="notice notice--error control-export-message"
          role="alert"
        >
          <span>{exportControl.error}</span>
          <button
            className="text-button"
            onClick={exportControl.dismissError}
            type="button"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {control.error ? (
        <div className="notice notice--error control-local-error" role="alert">
          <div>
            <strong>No se pudo cargar Control</strong>
            <p>{control.error}</p>
          </div>
          <button
            className="button button--secondary"
            onClick={control.retry}
            type="button"
          >
            <RotateCcw size={16} /> Reintentar
          </button>
        </div>
      ) : null}

      {control.status === "loading" && !response ? (
        <div
          className="control-table-skeleton"
          role="status"
          aria-label="Consultando observaciones"
        >
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {response && rows.length === 0 ? (
        <div className="empty-state">
          No hay observaciones para la sede, período y filtros seleccionados.
        </div>
      ) : null}
      {response && rows.length > 0 ? (
        <ControlTable
          disabled={control.status === "loading"}
          onSelect={(row) => setSelectedDetailId(row.detalle_id)}
          rows={rows}
        />
      ) : null}

      {response && response.total > 0 ? (
        <nav
          className="admin-report-pagination control-pagination"
          aria-label="Paginación de Control"
        >
          <span>
            {pageStart}–{pageEnd} de {response.total}
          </span>
          <button
            className="button button--secondary"
            disabled={
              control.query.offset === 0 || control.status === "loading"
            }
            onClick={control.previousPage}
            type="button"
          >
            <ArrowLeft size={16} /> Anterior
          </button>
          <button
            className="button button--secondary"
            disabled={
              control.query.offset + SOLOG_CONTROL_PAGE_SIZE >=
                response.total || control.status === "loading"
            }
            onClick={control.nextPage}
            type="button"
          >
            Siguiente <ArrowRight size={16} />
          </button>
        </nav>
      ) : null}

      {selectedDetailId ? (
        <ControlDrawer
          detailId={selectedDetailId}
          key={selectedDetailId}
          onClose={() => setSelectedDetailId(null)}
          refreshOperationalState={refreshOperationalState}
        />
      ) : null}
    </section>
  );
}
