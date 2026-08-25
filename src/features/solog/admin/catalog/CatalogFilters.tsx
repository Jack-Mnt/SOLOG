import type { FormEvent } from "react";
import { Filter, RotateCcw, Search } from "lucide-react";
import { getSologCatalogChangeTypeLabel } from "../../labels";
import type { SologCatalogChangeType } from "../../types";
import type { CatalogDraftFilters } from "./useCatalogChanges";

const TYPES: SologCatalogChangeType[] = [
  "agregar_producto",
  "eliminar_producto",
  "nombre",
  "precio",
  "codigo",
  "clasificacion_producto",
  "definicion_grupo",
];

export function CatalogFilters({
  filters,
  loading,
  onUpdate,
  onApply,
  onReset,
}: {
  filters: CatalogDraftFilters;
  loading: boolean;
  onUpdate: (updates: Partial<CatalogDraftFilters>) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply();
  };

  return (
    <form
      className="catalog-filters catalog-filters--scoped admin-filter-bar"
      onSubmit={handleSubmit}
    >
      <label className="catalog-search admin-filter-field admin-filter-search-field">
        Buscar
        <span className="catalog-search__control admin-filter-search-control">
          <Search aria-hidden="true" size={16} />
          <input
            disabled={loading}
            onChange={(event) => onUpdate({ search: event.target.value })}
            placeholder="Producto, grupo o código interno…"
            type="search"
            value={filters.search}
          />
        </span>
      </label>
      <label className="admin-filter-field admin-filter-field--select">
        Ámbito
        <select
          disabled={loading}
          onChange={(event) =>
            onUpdate({
              ambito: event.target.value as CatalogDraftFilters["ambito"],
            })
          }
          value={filters.ambito}
        >
          <option value="">Todos</option>
          <option value="producto">Producto</option>
          <option value="grupo">Grupo</option>
        </select>
      </label>
      <label className="admin-filter-field admin-filter-field--select">
        Tipo
        <select
          disabled={loading}
          onChange={(event) =>
            onUpdate({
              tipo: event.target.value as CatalogDraftFilters["tipo"],
            })
          }
          value={filters.tipo}
        >
          <option value="">Todos los tipos</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {getSologCatalogChangeTypeLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <div className="admin-report-filter-actions catalog-filter-actions admin-filter-actions">
        <button
          className="button admin-filter-apply"
          disabled={loading}
          type="submit"
        >
          <Filter size={17} /> Aplicar
        </button>
        <button
          className="button button--secondary"
          disabled={loading}
          onClick={onReset}
          type="button"
        >
          <RotateCcw size={17} /> Limpiar
        </button>
      </div>
    </form>
  );
}
