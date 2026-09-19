import { useMemo, useState, type FormEvent } from "react";
import {
  CircleDollarSign,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Tags,
} from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import {
  ValuationDialog,
  type ValuationDecision,
} from "../admin.valuation-dialog";
import { useMasterData } from "../masterdata/admin.masterdata.context";
import type {
  MasterDataGroup,
  MasterDataProduct,
} from "../masterdata/admin.masterdata.v1";
import { QueryState, Value } from "../admin.v2.presentation";
import { AdminPagination, AdminSort, IconButton } from "../admin.primitives";
import { paginateAdminRows } from "../admin.pagination";
import { AdminCategoriesDialog } from "./admin.categories.dialog";
import { useGroupsStore } from "./admin.grupos.context";
import {
  GroupCandidatePicker,
  GroupMembersDialog,
} from "./admin.grupos.members-dialog";
import {
  deriveGroupRows,
  filterAndSortGroups,
  type DerivedGroupRow,
  type GroupDerivedType,
  type GroupSort,
  type GroupValuationFilter,
} from "./admin.grupos.model";
import { groupsErrorMessage } from "./admin.grupos.messages";

function Valuation({
  group,
}: {
  group: Pick<MasterDataGroup, "unidades_por_paquete" | "precio_paquete">;
}) {
  return group.unidades_por_paquete !== null &&
    group.precio_paquete !== null ? (
    <>
      x{group.unidades_por_paquete} ·{" "}
      <Value value={group.precio_paquete} money />
    </>
  ) : (
    <>Sin paquete</>
  );
}

function MutationError({ error, retry }: { error: string; retry: () => void }) {
  const intent = useGroupsStore().intent();
  return (
    <div className="notice notice--error" role="alert">
      <p>{error}</p>
      {intent && !intent.pending && (
        <button
          type="button"
          className="button button--secondary"
          onClick={retry}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Reintentar misma operación
        </button>
      )}
    </div>
  );
}

function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const masterData = useMasterData();
  const store = useGroupsStore();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [members, setMembers] = useState<MasterDataProduct[]>([]);
  const [error, setError] = useState("");
  const selectedPrice = members[0]?.precio;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (members.length < 2) {
      setError("Selecciona al menos dos SKU para crear el grupo.");
      return;
    }
    try {
      setError("");
      await store.mutation("group_create", {
        nombre: name.trim(),
        categoria_id: categoryId,
        member_codes: members.map((member) => member.c_interno),
      });
      onClose();
    } catch (reason) {
      setError(groupsErrorMessage(reason));
    }
  };
  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .then(onClose)
      .catch((reason) => setError(groupsErrorMessage(reason)));
  };
  return (
    <AdminDialog
      title="Crear grupo"
      description="Crea una estructura de conteo con dos o más SKU incluidos y compatibles."
      onClose={onClose}
      closeDisabled={!!store.intent()?.pending}
      wide
    >
      {!masterData.snapshot || !masterData.derived ? (
        <QueryState error={masterData.error} retry={masterData.retry} />
      ) : (
        <form className="admin-v2-form" onSubmit={(event) => void save(event)}>
          <label>
            Nombre
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Categoría
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Seleccionar</option>
              {masterData.snapshot.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
          </label>
          <GroupCandidatePicker
            snapshot={masterData.snapshot}
            derived={masterData.derived}
            selected={members}
            onChange={setMembers}
            price={selectedPrice}
          />
          <p>
            El precio unitario se toma del Catálogo y el backend confirma la
            compatibilidad.
          </p>
          <button
            className="button"
            disabled={
              !!store.intent() ||
              !name.trim() ||
              !categoryId ||
              members.length < 2
            }
          >
            <Plus size={16} aria-hidden="true" />
            Crear grupo
          </button>
        </form>
      )}
      {error && <MutationError error={error} retry={retry} />}
    </AdminDialog>
  );
}

function EditGroupDialog({
  group,
  onClose,
}: {
  group: DerivedGroupRow;
  onClose: () => void;
}) {
  const masterData = useMasterData();
  const store = useGroupsStore();
  const [name, setName] = useState(group.nombre);
  const [categoryId, setCategoryId] = useState(group.categoria_id);
  const [error, setError] = useState("");
  const categoryChanged = categoryId !== group.categoria_id;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setError("");
      await store.mutation("group_update", {
        grupo_id: group.id,
        nombre: name.trim(),
        categoria_id: categoryId,
      });
      onClose();
    } catch (reason) {
      setError(groupsErrorMessage(reason));
    }
  };
  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .then(onClose)
      .catch((reason) => setError(groupsErrorMessage(reason)));
  };
  return (
    <AdminDialog
      title="Editar nombre y categoría"
      description="La nombre operativa no modifica el nombre comercial de los SKU."
      onClose={onClose}
      closeDisabled={!!store.intent()?.pending}
    >
      {!masterData.snapshot ? (
        <QueryState error={masterData.error} retry={masterData.retry} />
      ) : (
        <form className="admin-v2-form" onSubmit={(event) => void save(event)}>
          <label>
            Nombre
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Categoría
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {masterData.snapshot.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
          </label>
          <p>
            Precio unitario: <Value value={group.precio} money /> · solo
            lectura.
          </p>
          {categoryChanged && (
            <p className="notice">
              La categoría se aplicará a todos los integrantes del grupo.
            </p>
          )}
          <button
            className="button"
            disabled={!!store.intent() || !name.trim() || !categoryId}
          >
            <Save size={16} aria-hidden="true" />
            Guardar cambios
          </button>
        </form>
      )}
      {error && <MutationError error={error} retry={retry} />}
    </AdminDialog>
  );
}

function GroupValuationDialog({
  group,
  onClose,
}: {
  group: DerivedGroupRow;
  onClose: () => void;
}) {
  const store = useGroupsStore();
  const [error, setError] = useState("");
  const save = async (decision: ValuationDecision) => {
    try {
      setError("");
      await store.mutation(
        "valuation_save",
        decision.enabled
          ? {
              grupo_id: group.id,
              enabled: true,
              unidades_por_paquete: decision.unitsPerPackage!,
              precio_paquete: decision.packagePrice!,
            }
          : { grupo_id: group.id, enabled: false },
      );
      onClose();
    } catch (reason) {
      setError(groupsErrorMessage(reason));
    }
  };
  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .then(onClose)
      .catch((reason) => setError(groupsErrorMessage(reason)));
  };
  return (
    <ValuationDialog
      unitPrice={group.precio}
      initial={{
        unitsPerPackage: group.unidades_por_paquete,
        packagePrice: group.precio_paquete,
      }}
      description="Este cambio se aplica inmediatamente en Grupos y se confirma con la fuente autoritativa."
      pending={!!store.intent()?.pending}
      error={error}
      onRetry={store.intent() ? retry : undefined}
      onClose={onClose}
      onConfirm={(decision) => void save(decision)}
    />
  );
}

export function AdminGroupsV2() {
  const masterData = useMasterData();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [type, setType] = useState<"all" | GroupDerivedType>("all");
  const [valuation, setValuation] = useState<GroupValuationFilter>("all");
  const [sort, setSort] = useState<GroupSort>("name");
  const [page, setPage] = useState(0);
  const filterKey = JSON.stringify([search, categoryId, type, valuation, sort]);
  const [previousFilter, setPreviousFilter] = useState(filterKey);
  if (filterKey !== previousFilter) {
    setPreviousFilter(filterKey);
    setPage(0);
  }
  const [create, setCreate] = useState(false);
  const [members, setMembers] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [valuationGroup, setValuationGroup] = useState<string | null>(null);
  const [categories, setCategories] = useState(false);
  const rows = useMemo(
    () =>
      masterData.snapshot && masterData.derived
        ? deriveGroupRows(masterData.snapshot, masterData.derived)
        : [],
    [masterData.derived, masterData.snapshot],
  );
  const visible = useMemo(
    () =>
      filterAndSortGroups(rows, { search, categoryId, type, valuation, sort }),
    [categoryId, rows, search, sort, type, valuation],
  );
  const paginated = useMemo(
    () => paginateAdminRows(visible, page),
    [page, visible],
  );
  const typeCounts = useMemo(() => {
    const available = filterAndSortGroups(rows, {
      search,
      categoryId,
      type: "all",
      valuation,
      sort,
    });
    return {
      all: available.length,
      Único: available.filter((group) => group.derivedType === "Único").length,
      Agrupado: available.filter((group) => group.derivedType === "Agrupado")
        .length,
    };
  }, [categoryId, rows, search, sort, valuation]);
  const valuationCounts = useMemo(() => {
    const available = filterAndSortGroups(rows, {
      search,
      categoryId,
      type,
      valuation: "all",
      sort,
    });
    return {
      all: available.length,
      configured: available.filter(
        (group) =>
          group.unidades_por_paquete !== null && group.precio_paquete !== null,
      ).length,
      none: available.filter(
        (group) =>
          group.unidades_por_paquete === null || group.precio_paquete === null,
      ).length,
    };
  }, [categoryId, rows, search, sort, type]);
  if (!masterData.snapshot || !masterData.derived)
    return (
      <section className="admin-groups">
        <QueryState error={masterData.error} retry={masterData.retry} />
      </section>
    );
  const byId = new Map(rows.map((group) => [group.id, group]));
  const selectedMembers = members ? byId.get(members) : undefined;
  const selectedEdit = edit ? byId.get(edit) : undefined;
  const selectedValuation = valuationGroup
    ? byId.get(valuationGroup)
    : undefined;
  return (
    <section className="admin-groups">
      <form
        className="admin-toolbar admin-toolbar-surface admin-groups__filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="admin-toolbar__search">
          Buscar
          <span className="admin-filter-search">
            <Search size={16} aria-hidden="true" />
            <input
              placeholder="Nombre, integrante, SKU o marca"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>
        <label className="admin-toolbar__filter">
          Categoría
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="all">Todas</option>
            {masterData.snapshot.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-toolbar__actions admin-groups__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setCategories(true)}
          >
            <Tags size={17} aria-hidden="true" />
            Administrar categorías
          </button>
          <button
            type="button"
            className="button"
            onClick={() => setCreate(true)}
          >
            <Plus size={17} aria-hidden="true" />
            Crear grupo
          </button>
        </div>
      </form>
      <div className="admin-section-secondary-row">
        <div
          className="admin-quick-filter-chips"
          role="group"
          aria-label="Integrantes"
        >
          <button
            key={"all"}
            type="button"
            className="admin-quick-filter-chip"
            aria-pressed={type === "all"}
            onClick={() => setType("all")}
          >
            <span>Todos</span>
            <strong>{typeCounts["all"]}</strong>
          </button>
          {(
            [
              ["Único", "Único"],
              ["Agrupado", "Agrupado"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="admin-quick-filter-chip tone--color"
              aria-pressed={type === value}
              onClick={() => setType(value)}
            >
              <span>{label}</span>
              <strong>{typeCounts[value]}</strong>
            </button>
          ))}
        </div>
        <div
          className="admin-quick-filter-chips"
          role="group"
          aria-label="Valorizado"
        >
          <button
            key={"all"}
            type="button"
            className="admin-quick-filter-chip"
            aria-pressed={valuation === "all"}
            onClick={() => setValuation("all")}
          >
            <span>Todos</span>
            <strong>{valuationCounts["all"]}</strong>
          </button>
          {(
            [
              ["configured", "S/. paquete"],
              ["none", "S/. unitario"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="admin-quick-filter-chip tone--color"
              aria-pressed={valuation === value}
              onClick={() => setValuation(value)}
            >
              <span>{label}</span>
              <strong>{valuationCounts[value]}</strong>
            </button>
          ))}
        </div>
        <AdminSort<GroupSort>
          value={sort}
          defaultValue="name"
          onChange={setSort}
          options={[
            { value: "name", label: "Predeterminado" },
            { value: "category", label: "Categoría" },
            { value: "type", label: "Tipo derivado" },
            { value: "unit_price", label: "Precio unitario" },
            { value: "valuation", label: "Valorizado primero" },
            { value: "members_desc", label: "Más integrantes" },
            { value: "members_asc", label: "Menos integrantes" },
          ]}
        />
      </div>
      <div className="admin-table-section admin-groups__table">
        <div
          className="admin-main-table"
          role="region"
          aria-label="Lista de grupos"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                <th scope="col">Categoría</th>
                <th scope="col">Integrantes</th>
                <th scope="col" className="admin-table-number">Valorizado</th>
                <th scope="col" className="admin-table-action-cell">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.rows.map((group) => (
                <tr key={group.id}>
                  <th scope="row">
                    <span>{group.nombre}</span>
                  </th>
                  <td>{group.categoryName}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--secondary admin-groups__members"
                      aria-label={`Ver integrantes de ${group.nombre}`}
                      onClick={() => setMembers(group.id)}
                    >
                      <Package
                        className="admin-groups__members-icon"
                        size={16}
                        aria-hidden="true"
                      />
                      <PackageOpen
                        className="admin-groups__members-icon admin-groups__members-icon--hover"
                        size={16}
                        aria-hidden="true"
                      />
                      <span>
                        {group.derivedType === "Único"
                          ? "Único"
                          : `${group.memberCount} SKU`}
                      </span>
                    </button>
                  </td>
                  <td className="admin-groups__valuation admin-table-number">
                    <span>
                      <Value value={group.precio} money /> / unidad
                    </span>
                    <small>
                      <Valuation group={group} />
                    </small>
                  </td>
                  <td className="admin-table-action-cell">
                    <div className="admin-table-actions">
                      <IconButton
                        aria-label={`Editar nombre y categoría de ${group.nombre}`}
                        title="Editar grupo"
                        onClick={() => setEdit(group.id)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        aria-label={`Editar valorizado de ${group.nombre}`}
                        title="Editar valorizado"
                        onClick={() => setValuationGroup(group.id)}
                      >
                        <CircleDollarSign size={16} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={5}>
                    No hay grupos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AdminPagination
        total={visible.length}
        currentPage={paginated.currentPage}
        pageCount={paginated.pageCount}
        onPageChange={setPage}
        ariaLabel="Paginación de grupos"
      />
      {create && <CreateGroupDialog onClose={() => setCreate(false)} />}
      {selectedMembers && (
        <GroupMembersDialog
          group={selectedMembers}
          snapshot={masterData.snapshot}
          derived={masterData.derived}
          onClose={() => setMembers(null)}
        />
      )}
      {selectedEdit && (
        <EditGroupDialog group={selectedEdit} onClose={() => setEdit(null)} />
      )}
      {selectedValuation && (
        <GroupValuationDialog
          group={selectedValuation}
          onClose={() => setValuationGroup(null)}
        />
      )}
      {categories && (
        <AdminCategoriesDialog onClose={() => setCategories(false)} />
      )}
    </section>
  );
}
