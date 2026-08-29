import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
} from "lucide-react";
import type {
  SologGroupProductSearchRow,
  SologGroupSummary,
} from "../../types";
import { AdminDialog } from "../AdminDialog";
import { formatAdminCurrency } from "../format";
import { GroupDefinitionDialog } from "./GroupDefinitionDialog";
import { GroupValuationDialog } from "./GroupValuationDialog";
import { ProductClassificationDialog } from "./ProductClassificationDialog";
import { GROUPS_PAGE_SIZE, useAdminGroups } from "./useAdminGroups";
import { formatGroupValuation, getGroupValuationLines } from "./valuation";

export function GroupsPanel({
  refreshOperationalState,
}: {
  refreshOperationalState: () => Promise<void>;
}) {
  const groups = useAdminGroups(refreshOperationalState);
  const [selected, setSelected] = useState<SologGroupSummary | null>(null);
  const [definition, setDefinition] = useState<
    SologGroupSummary | "new" | null
  >(null);
  const [classification, setClassification] = useState<{
    product: SologGroupProductSearchRow | null;
    group: SologGroupSummary | null;
  } | null>(null);
  const [valuation, setValuation] = useState<SologGroupSummary | null>(null);
  const rows = groups.response?.rows ?? [];
  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    groups.applyFilters();
  };
  const memberToSearchRow = (
    product: SologGroupSummary["integrantes"][number],
    group: SologGroupSummary,
  ): SologGroupProductSearchRow => ({
    ...product,
    categoria_id: group.categoria_id,
    categoria: group.categoria,
    grupo_id: group.id,
    grupo: group.nombre,
  });
  const saveAndCloseDetail = async (
    payload: Parameters<typeof groups.save>[0],
  ) => {
    const completed = await groups.save(payload);
    if (completed) setSelected(null);
    return completed;
  };
  const saveValuation = async (
    payload: Parameters<typeof groups.saveValuation>[0],
  ) => {
    const completed = await groups.saveValuation(payload);
    if (completed) {
      setSelected((current) =>
        current?.id === payload.grupo_id
          ? {
              ...current,
              unidades_por_paquete: payload.unidades_por_paquete,
              precio_paquete: payload.precio_paquete,
            }
          : current,
      );
    }
    return completed;
  };
  const openValuation = (group: SologGroupSummary) => {
    groups.clearValuationError();
    setValuation(group);
  };

  return (
    <div className="content-section admin-module groups-workbench">
      <div className="groups-workbench__toolbar">
        <button
          className="button"
          disabled={!groups.reference}
          onClick={() => setDefinition("new")}
          type="button"
        >
          <Plus size={17} />
          Nuevo grupo
        </button>
      </div>
      <form
        className="groups-filters admin-filter-bar"
        onSubmit={submitFilters}
      >
        <label className="admin-filter-field admin-filter-search-field">
          Buscar
          <span className="catalog-search__control admin-filter-search-control">
            <Search size={16} />
            <input
              disabled={groups.status === "loading"}
              onChange={(event) =>
                groups.setDraftFilters((current) => ({
                  ...current,
                  buscar: event.target.value,
                }))
              }
              placeholder="Grupo, producto o C. interno…"
              value={groups.draftFilters.buscar}
            />
          </span>
        </label>
        <label className="admin-filter-field admin-filter-field--select">
          Categoría
          <select
            disabled={groups.status === "loading"}
            onChange={(event) =>
              groups.setDraftFilters((current) => ({
                ...current,
                categoria_id: event.target.value,
              }))
            }
            value={groups.draftFilters.categoria_id}
          >
            <option value="">Todas</option>
            {groups.reference?.categorias.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter-field admin-filter-field--select">
          Tipo
          <select
            disabled={groups.status === "loading"}
            onChange={(event) =>
              groups.setDraftFilters((current) => ({
                ...current,
                tipo: event.target.value as "" | "Único" | "Agrupado",
              }))
            }
            value={groups.draftFilters.tipo}
          >
            <option value="">Todos</option>
            <option value="Único">Único</option>
            <option value="Agrupado">Agrupado</option>
          </select>
        </label>
        <div className="admin-report-filter-actions admin-filter-actions">
          <button
            className="button admin-filter-apply"
            disabled={groups.status === "loading"}
            type="submit"
          >
            {" "}
            <Filter aria-hidden="true" size={17} />
            Aplicar
          </button>
          <button
            className="button button--secondary"
            disabled={groups.status === "loading"}
            onClick={groups.resetFilters}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={17} /> Limpiar
          </button>
        </div>
      </form>
      {groups.notice ? (
        <div className="notice notice--success" role="status">
          <strong>{groups.notice}</strong>
          <button className="text-button" onClick={groups.dismissNotice}>
            Cerrar
          </button>
        </div>
      ) : null}
      {groups.error ? (
        <div className="notice notice--error" role="alert">
          <strong>No se pudo completar la operación</strong>
          <p>{groups.error}</p>
        </div>
      ) : null}
      {groups.status === "loading" ? (
        <div className="empty-state" role="status">
          Consultando estructura de grupos…
        </div>
      ) : null}
      {groups.status === "ready" && !rows.length ? (
        <div className="empty-state">No hay grupos con estos filtros.</div>
      ) : null}
      {groups.status === "ready" && rows.length ? (
        <div className="admin-report-table-wrap groups-table-wrap">
          <table className="admin-report-table admin-interactive-table groups-table">
            <caption>Grupos de conteo actuales</caption>
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Categoría</th>
                <th>Valorización</th>
                <th>Productos</th>
                <th>Estado</th>
                <th aria-label="Acción" />
              </tr>
            </thead>
            <tbody>
              {rows.map((group) => (
                <tr
                  key={group.id}
                  onClick={() => setSelected(group)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSelected(group);
                  }}
                >
                  <td>
                    <strong>{group.nombre}</strong>
                  </td>
                  <td>{group.categoria}</td>
                  <td className="groups-valuation-cell">
                    {formatGroupValuation(group, true)}
                  </td>
                  <td>{group.sku_count}</td>
                  <td>
                    <span
                      className={`admin-state-badge admin-state-badge--${group.activo ? "aprobado" : "ignorado"}`}
                    >
                      {group.activo ? group.tipo : "Inactivo"}
                    </span>
                  </td>
                  <td className="catalog-row-action">
                    <ChevronRight size={17} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {groups.response && rows.length > 0 ? (
        <nav
          className="admin-report-pagination"
          aria-label="Paginación de grupos"
        >
          <button
            className="button button--secondary"
            disabled={!groups.offset || groups.status === "loading"}
            onClick={groups.previousPage}
          >
            <ArrowLeft size={17} />
            Anterior
          </button>
          <span>Página {Math.floor(groups.offset / GROUPS_PAGE_SIZE) + 1}</span>
          <button
            className="button button--secondary"
            disabled={
              rows.length < GROUPS_PAGE_SIZE || groups.status === "loading"
            }
            onClick={groups.nextPage}
          >
            Siguiente
            <ArrowRight size={17} />
          </button>
        </nav>
      ) : null}
      {selected ? (
        <AdminDialog
          className="group-detail-dialog"
          footer={
            <>
              <button
                className="button button--secondary"
                onClick={() =>
                  setClassification({ product: null, group: selected })
                }
              >
                <Shuffle size={17} />
                Buscar producto
              </button>
              <button
                className="button"
                onClick={() => setDefinition(selected)}
              >
                <Pencil size={17} />
                Editar grupo
              </button>
            </>
          }
          onClose={() => setSelected(null)}
          title={selected.nombre}
          wide
        >
          <div className="group-detail-summary">
            <article>
              <span>Categoría</span>
              <strong>{selected.categoria}</strong>
            </article>
            <article className="group-detail-valuation">
              <span>Valorización</span>
              {(() => {
                const lines = getGroupValuationLines(selected);
                return (
                  <strong>
                    {lines.primary}
                    {lines.secondary ? <small>{lines.secondary}</small> : null}
                  </strong>
                );
              })()}
              <button
                className="text-button"
                onClick={() => openValuation(selected)}
                type="button"
              >
                <Pencil size={14} />
                Editar valorización
              </button>
            </article>
            <article>
              <span>Estado</span>
              <strong>{selected.activo ? selected.tipo : "Inactivo"}</strong>
            </article>
            <article>
              <span>Productos</span>
              <strong>{selected.sku_count}</strong>
            </article>
          </div>
          <section className="admin-detail-section">
            <h3>Integrantes</h3>
            {selected.integrantes.length ? (
              <div className="group-members">
                {selected.integrantes.map((product) => (
                  <button
                    key={product.c_interno}
                    onClick={() =>
                      setClassification({
                        product: memberToSearchRow(product, selected),
                        group: selected,
                      })
                    }
                  >
                    <span>
                      <strong>{product.producto}</strong>
                      <small>
                        C. interno {product.c_interno} ·{" "}
                        {product.marca ?? "Sin marca"}
                      </small>
                    </span>
                    <span>
                      {formatAdminCurrency(product.precio)} · {product.estado}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                Este grupo no tiene integrantes.
              </div>
            )}
          </section>
        </AdminDialog>
      ) : null}
      {valuation ? (
        <GroupValuationDialog
          error={groups.valuationError}
          group={valuation}
          onClose={() => setValuation(null)}
          onSave={saveValuation}
          saving={groups.saving}
        />
      ) : null}
      {definition && groups.reference ? (
        <GroupDefinitionDialog
          group={definition === "new" ? null : definition}
          onClose={() => setDefinition(null)}
          onSave={saveAndCloseDetail}
          reference={groups.reference}
          saving={groups.saving}
        />
      ) : null}
      {classification && groups.reference ? (
        <ProductClassificationDialog
          initialGroup={classification.group}
          initialProduct={classification.product}
          onClose={() => setClassification(null)}
          onSave={saveAndCloseDetail}
          reference={groups.reference}
          saving={groups.saving}
        />
      ) : null}
    </div>
  );
}
