import { useState, type ReactNode } from "react";
import { FileSearch } from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import { useAdminStore } from "../admin.v2.context";
import { useManagement, useManagementQuery } from "../admin.management.context";
import type { ReadPayloads, Mutations } from "../admin.management.v2";
import type { CatalogChange as SologCatalogChangeRow } from "../admin.management.v2";
import { adminTimestamp } from "../admin.v2.format";
import { Value } from "../admin.v2.presentation";
import {
  PageControls,
  ReadNotice,
  MutationNotice,
} from "../admin.management.presentation";
import { PackagePrice } from "../admin.package-price.v2";

type CatalogView = "pendiente" | "aprobado" | "ignorado" | "incorporado";

const catalogViews: Array<{ id: CatalogView; label: string }> = [
  { id: "pendiente", label: "Pendientes" },
  { id: "aprobado", label: "Aprobados" },
  { id: "ignorado", label: "Ignorados" },
  { id: "incorporado", label: "Incorporados" },
];

const changeLabels: Record<string, string> = {
  agregar_producto: "Agregar producto",
  eliminar_producto: "Eliminar producto",
  excluir_producto: "Excluir producto",
  reincorporar_producto: "Reincorporar producto",
  nombre: "Cambiar nombre",
  codigo: "Cambiar código de barras",
  precio: "Cambiar precio",
  clasificacion_producto: "Clasificación de producto",
  definicion_grupo: "Definición de grupo",
};

function proposalValue(
  change: SologCatalogChangeRow,
  keys: string[],
): string | number | null {
  for (const key of keys) {
    const value = change.datos[key];
    if (typeof value === "string" || typeof value === "number") return value;
  }
  return null;
}

function changeLabel(change: SologCatalogChangeRow) {
  return changeLabels[change.tipo] ?? change.tipo;
}
function priceValue(value: unknown): ReactNode {
  return typeof value === "number" && Number.isFinite(value) ? (
    <Value value={value} money />
  ) : (
    "—"
  );
}
function urgentPrice(change: SologCatalogChangeRow) {
  if (change.tipo === "agregar_producto")
    return proposalValue(change, ["precio", "precio_nuevo"]);
  return change.catalogo_actual.precio;
}
function currentEmergentValue(change: SologCatalogChangeRow) {
  if (change.tipo === "nombre") return change.catalogo_actual.producto;
  if (change.tipo === "codigo") return change.catalogo_actual.c_barras;
  if (change.tipo === "precio") return change.catalogo_actual.precio;
  return null;
}
function proposedEmergentValue(change: SologCatalogChangeRow) {
  if (change.tipo === "nombre")
    return proposalValue(change, [
      "producto_nuevo",
      "nombre_nuevo",
      "producto",
      "nombre",
    ]);
  if (change.tipo === "codigo")
    return proposalValue(change, [
      "c_barras_nuevo",
      "codigo_nuevo",
      "c_barras",
      "codigo",
    ]);
  if (change.tipo === "precio")
    return proposalValue(change, ["precio_nuevo", "precio"]);
  return null;
}
function catalogValue(
  change: SologCatalogChangeRow,
  value: unknown,
): ReactNode {
  return change.tipo === "precio"
    ? priceValue(value)
    : typeof value === "string" || typeof value === "number"
      ? value
      : "—";
}

function NewProduct({
  change,
  revision,
  onClose,
}: {
  change: SologCatalogChangeRow;
  revision: number;
  onClose: () => void;
}) {
  const store = useManagement(),
    reference = useManagementQuery("reference", {});
  const [brand, setBrand] = useState(""),
    [category, setCategory] = useState(""),
    [mode, setMode] = useState<"Único" | "Agrupado" | "Excluido">("Único"),
    [group, setGroup] = useState(""),
    [error, setError] = useState("");
  return (
    <AdminDialog
      title="Aprobar producto nuevo"
      onClose={onClose}
      closeDisabled={!!store.intent("master")?.pending}
    >
      {!reference.data ? (
        <ReadNotice {...reference} />
      ) : (
        <form
          className="admin-v2-form"
          onSubmit={(e) => {
            e.preventDefault();
            const payload: Mutations["catalog_change_action"] = {
              propuesta_fingerprint: change.propuesta_fingerprint,
              action: "approve",
              marca: brand.trim(),
              categoria_id: category,
              ...(mode === "Agrupado"
                ? { estado: mode, grupo_conteo_id: group }
                : { estado: mode, grupo_conteo_id: null }),
            };
            setError("");
            void store
              .mutation("catalog_change_action", payload, revision)
              .then(onClose)
              .catch((e) => setError(e.message));
          }}
        >
          <p>
            {change.producto ?? change.c_interno}. Quedará aprobado para
            publicación; todavía no modifica el catálogo publicado.
          </p>
          <label>
            Marca
            <input
              required
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </label>
          <label>
            Categoría
            <select
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {reference.data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modalidad
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option>Único</option>
              <option>Agrupado</option>
              <option>Excluido</option>
            </select>
          </label>
          {mode === "Agrupado" && (
            <label>
              Grupo
              <select
                required
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="">Seleccionar</option>
                {reference.data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre} · {g.precio}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="button" disabled={!!store.intent("master")}>
            Confirmar aprobación
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <MutationNotice domain="master" onSuccess={onClose} />
    </AdminDialog>
  );
}
function PriceResolution({
  fingerprint,
  onClose,
}: {
  fingerprint: string;
  onClose: () => void;
}) {
  const store = useManagement(),
    query = useManagementQuery("price_mismatch_options", {
      propuesta_fingerprint: fingerprint,
    }),
    [error, setError] = useState(""),
    [pack, setPack] = useState(false);
  return (
    <AdminDialog
      title="Resolver precio del grupo"
      onClose={onClose}
      closeDisabled={!!store.intent("master")?.pending}
    >
      {!query.data ? (
        <ReadNotice {...query} />
      ) : (
        <>
          <p>
            Precio propuesto: {query.data.nuevo_precio}. Estado:{" "}
            {query.data.change_state}.
          </p>
          <ul>
            {query.data.members.map((m) => (
              <li key={m.c_interno}>
                {m.c_interno} · {m.producto} · {m.precio}
              </li>
            ))}
          </ul>
          <p>
            La resolución prepara la publicación; no publica el catálogo. Si se
            interrumpe, vuelve a esta propuesta aprobada para continuar.
          </p>
          {query.data.options.map((option) => (
            <button
              className="button"
              key={option}
              disabled={
                !!store.intent("master") ||
                query.data!.change_state !== "aprobado"
              }
              onClick={() => {
                setError("");
                void store
                  .mutation(
                    "resolve_group_price",
                    { propuesta_fingerprint: fingerprint, resolution: option },
                    query.data!.revisions.groups,
                  )
                  .then(onClose)
                  .catch((e) => setError(e.message));
              }}
            >
              {option === "update_group_price"
                ? "Actualizar precio de todo el grupo"
                : "Separar SKU como Único"}
            </button>
          ))}
          {query.data.unidades_por_paquete !== null &&
            query.data.unidades_por_paquete > 1 && (
              <button
                className="button button--secondary"
                onClick={() => setPack(true)}
              >
                Actualizar precio x{query.data.unidades_por_paquete}
              </button>
            )}
          <p>
            El precio por paquete es independiente y solo se actualiza con
            aceptación explícita.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <MutationNotice domain="master" onSuccess={onClose} />
      {pack && query.data && (
        <PackagePrice
          groupId={query.data.grupo_id}
          onClose={() => setPack(false)}
        />
      )}
    </AdminDialog>
  );
}
function ChangeDetail({
  change,
  revision,
  onClose,
}: {
  change: SologCatalogChangeRow;
  revision: number;
  onClose: () => void;
}) {
  const store = useManagement(),
    [error, setError] = useState(""),
    [newProduct, setNewProduct] = useState(false),
    [resolve, setResolve] = useState(false);
  const act = (action: "approve" | "ignore" | "withdraw") => {
    if (action === "approve" && change.tipo === "agregar_producto") {
      setNewProduct(true);
      return;
    }
    setError("");
    void store
      .mutation(
        "catalog_change_action",
        { propuesta_fingerprint: change.propuesta_fingerprint, action },
        revision,
      )
      .then(() => {
        if (
          action === "approve" &&
          change.tipo === "precio" &&
          change.catalogo_actual.estado === "Agrupado"
        )
          setResolve(true);
        else onClose();
      })
      .catch((e) => setError(e.message));
  };
  if (resolve)
    return (
      <PriceResolution
        fingerprint={change.propuesta_fingerprint}
        onClose={onClose}
      />
    );
  if (newProduct)
    return <NewProduct change={change} revision={revision} onClose={onClose} />;
  const emergent = change.seccion !== "urgente";
  const comparisonLabel =
    change.tipo === "nombre"
      ? "Nombre"
      : change.tipo === "codigo"
        ? "Código de barras"
        : change.tipo === "precio"
          ? "Precio"
          : "Valor";
  return (
    <AdminDialog
      title={
        change.producto ?? `Propuesta ${change.c_interno ?? change.grupo_id}`
      }
      description={changeLabel(change)}
      onClose={onClose}
      closeDisabled={!!store.intent("master")?.pending}
      wide
    >
      <div className="admin-catalog__proposal-context">
        <span>
          {change.c_interno === null
            ? "Sin código interno"
            : `C. interno ${change.c_interno}`}
        </span>
        <span>
          {change.sedes.length
            ? change.sedes.map((s) => s.nombre).join(", ")
            : "Origen no disponible"}
        </span>
        {change.occurrence_count > 0 && (
          <span>{change.occurrence_count} apariciones</span>
        )}
      </div>
      {emergent ? (
        <div className="admin-v2-table admin-catalog__comparison">
          <table>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Actual</th>
                <th>Propuesto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{comparisonLabel}</th>
                <td>{catalogValue(change, currentEmergentValue(change))}</td>
                <td>{catalogValue(change, proposedEmergentValue(change))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <dl className="admin-catalog__proposal-summary">
          <div>
            <dt>Producto</dt>
            <dd>{change.producto ?? change.catalogo_actual.producto ?? "—"}</dd>
          </div>
          <div>
            <dt>C. interno</dt>
            <dd>{change.c_interno ?? "—"}</dd>
          </div>
          <div>
            <dt>Precio</dt>
            <dd>{priceValue(urgentPrice(change))}</dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>{change.sedes.map((s) => s.nombre).join(", ") || "—"}</dd>
          </div>
        </dl>
      )}
      <div className="admin-v2-actions">
        {change.estado === "pendiente" && (
          <>
            <button
              className="button"
              disabled={!!store.intent("master")}
              onClick={() => act("approve")}
            >
              Aprobar
            </button>
            <button
              className="button button--secondary"
              disabled={!!store.intent("master")}
              onClick={() => act("ignore")}
            >
              Ignorar propuesta
            </button>
          </>
        )}
        {change.estado === "aprobado" && (
          <>
            <button
              className="button button--secondary"
              disabled={!!store.intent("master")}
              onClick={() => act("withdraw")}
            >
              Retirar aprobación
            </button>
            {change.tipo === "precio" &&
              change.catalogo_actual.estado === "Agrupado" && (
                <button className="button" onClick={() => setResolve(true)}>
                  Resolver precio del grupo
                </button>
              )}
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <MutationNotice
        domain="master"
        onSuccess={(payload) => {
          if (
            payload.action === "approve" &&
            change.tipo === "precio" &&
            change.catalogo_actual.estado === "Agrupado"
          )
            setResolve(true);
          else onClose();
        }}
      />
    </AdminDialog>
  );
}
function Publication({ onClose }: { onClose: () => void }) {
  const store = useManagement(),
    query = useManagementQuery("publication_preview", {}),
    admin = useAdminStore().bootstrap?.identity.rol === "admin";
  const p = query.data?.preview,
    receipt = store.publication;
  return (
    <AdminDialog
      title="Publicar catálogo"
      onClose={onClose}
      closeDisabled={!!receipt.pending}
      wide
    >
      {p ? (
        <>
          <p>{p.codigo}</p>
          {p.ok && (
            <>
              <p>
                Versión {p.version_actual} → {p.version_nueva} ·{" "}
                {p.cambios_total} cambios
              </p>
              <dl className="admin-v2-data">
                {Object.entries(p.cambios).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {p.errores?.map((e, i) => (
            <p role="alert" key={i}>
              {e}
            </p>
          ))}
          {p.conflictos?.map((c, i) => (
            <p role="alert" key={i}>
              {c.codigo}: {c.mensaje}
            </p>
          ))}
        </>
      ) : (
        <ReadNotice {...query} />
      )}
      {receipt.operationId && (
        <p>
          Publicación pendiente de confirmar: {receipt.operationId}. Reintentar
          conserva la misma reserva.
        </p>
      )}
      {receipt.error && <p role="alert">{receipt.error}</p>}
      {receipt.result && (
        <p role="status">
          {receipt.result.codigo} · versión {receipt.result.version}
          {receipt.result.replay ? " · replay confirmado" : ""}
        </p>
      )}
      <button
        className="button"
        disabled={
          !admin ||
          !!receipt.pending ||
          (!receipt.operationId && !p?.puede_publicar)
        }
        onClick={() => void store.publish().catch(() => {})}
      >
        {receipt.pending
          ? "Publicando…"
          : receipt.operationId
            ? "Reintentar publicación"
            : "Confirmar publicación"}
      </button>
      {!admin && <p>Solo admin puede publicar.</p>}
    </AdminDialog>
  );
}

function ReviewAction({
  change,
  revision,
  onSelect,
}: {
  change: SologCatalogChangeRow;
  revision: number;
  onSelect: (value: {
    change: SologCatalogChangeRow;
    revision: number;
  }) => void;
}) {
  return (
    <button
      type="button"
      className="icon-button admin-catalog__review"
      title="Revisar propuesta"
      aria-label={`Revisar propuesta: ${change.producto ?? change.c_interno ?? change.grupo_id}`}
      onClick={() => onSelect({ change, revision })}
    >
      <FileSearch size={17} aria-hidden="true" />
    </button>
  );
}

function CatalogRows({
  rows,
  revision,
  onSelect,
  urgent,
}: {
  rows: SologCatalogChangeRow[];
  revision: number;
  onSelect: (value: {
    change: SologCatalogChangeRow;
    revision: number;
  }) => void;
  urgent: boolean;
}) {
  if (urgent)
    return (
      <div className="admin-v2-table admin-catalog__table">
        <table>
          <thead>
            <tr>
              {["Tipo", "Nombre", "C. Interno", "Precio", "Acciones"].map(
                (label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((change) => (
              <tr key={change.propuesta_fingerprint}>
                <td>{changeLabel(change)}</td>
                <th scope="row">
                  {change.producto ?? change.catalogo_actual.producto ?? "—"}
                </th>
                <td>{change.c_interno ?? "—"}</td>
                <td className="admin-catalog__money">
                  {priceValue(urgentPrice(change))}
                </td>
                <td>
                  <ReviewAction
                    change={change}
                    revision={revision}
                    onSelect={onSelect}
                  />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>No hay propuestas en esta sección.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="admin-v2-table admin-catalog__table">
      <table>
        <thead>
          <tr>
            {["Tipo", "Nombre", "Actual", "Nuevo valor", "Acciones"].map(
              (label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((change) => (
            <tr key={change.propuesta_fingerprint}>
              <td>{changeLabel(change)}</td>
              <th scope="row">
                {change.producto ?? change.catalogo_actual.producto ?? "—"}
              </th>
              <td>{catalogValue(change, currentEmergentValue(change))}</td>
              <td>{catalogValue(change, proposedEmergentValue(change))}</td>
              <td>
                <ReviewAction
                  change={change}
                  revision={revision}
                  onSelect={onSelect}
                />
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5}>No hay propuestas en esta sección.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function AdminCatalogV2() {
  const [view, setView] = useState<CatalogView>("pendiente"),
    [filters, setFilters] = useState<ReadPayloads["catalog_changes"]>({
      limit: 50,
      offset: 0,
      estado: "pendiente",
    }),
    [search, setSearch] = useState(""),
    [code, setCode] = useState(""),
    [selected, setSelected] = useState<{
      change: SologCatalogChangeRow;
      revision: number;
    } | null>(null),
    [publishing, setPublishing] = useState(false);
  const query = useManagementQuery("catalog_changes", filters),
    status = useManagementQuery("status", {}),
    store = useManagement();
  const selectView = (next: CatalogView) => {
    setView(next);
    setFilters((current) => ({ ...current, estado: next, offset: 0 }));
  };
  const rows = query.data?.rows ?? [],
    urgent = rows.filter((change) => change.seccion === "urgente"),
    emerging = rows.filter((change) => change.seccion !== "urgente");
  return (
    <section className="admin-catalog">
      <header className="admin-catalog__header">
        <div>
          <h2>Catálogo compartido</h2>
          {status.data ? (
            <p>
              Versión {status.data.catalog.version_actual ?? "sin publicar"} ·{" "}
              {adminTimestamp(status.data.catalog.publicado_at)}
            </p>
          ) : (
            <ReadNotice {...status} />
          )}
        </div>
        <button
          type="button"
          className="button"
          onClick={() => setPublishing(true)}
        >
          {store.publication.operationId
            ? "Recuperar publicación"
            : "Revisar publicación"}
        </button>
      </header>
      <MutationNotice domain="master" />
      <div
        className="admin-catalog__views"
        role="group"
        aria-label="Vistas de propuestas"
      >
        {catalogViews.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={view === item.id}
            onClick={() => selectView(item.id)}
          >
            {item.label}
            {query.data?.counts[item.id] !== undefined && (
              <strong>{query.data.counts[item.id]}</strong>
            )}
          </button>
        ))}
      </div>
      <form
        className="admin-v2-filters admin-catalog__filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters((current) => ({
            ...current,
            producto: search || undefined,
            c_interno: code ? Number(code) : undefined,
            offset: 0,
          }));
        }}
      >
        <label>
          Producto
          <input
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          C. interno
          <input
            type="number"
            min="0"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button className="button button--secondary">Buscar</button>
      </form>
      {query.data ? (
        <>
          {view === "pendiente" ? (
            <div className="admin-catalog__pending">
              <section className="admin-catalog__section admin-catalog__section--urgent">
                <header>
                  <h3>Urgentes</h3>
                  <span>{urgent.length}</span>
                </header>
                <CatalogRows
                  rows={urgent}
                  revision={query.data.revisions.groups}
                  onSelect={setSelected}
                  urgent
                />
              </section>
              <section className="admin-catalog__section admin-catalog__section--emerging">
                <header>
                  <h3>Emergentes</h3>
                  <span>{emerging.length}</span>
                </header>
                <CatalogRows
                  rows={emerging}
                  revision={query.data.revisions.groups}
                  onSelect={setSelected}
                  urgent={false}
                />
              </section>
            </div>
          ) : (
            <CatalogRows
              rows={rows}
              revision={query.data.revisions.groups}
              onSelect={setSelected}
              urgent={false}
            />
          )}
          <PageControls
            offset={filters.offset}
            length={query.data.rows.length}
            onChange={(offset) =>
              setFilters((current) => ({ ...current, offset }))
            }
          />
        </>
      ) : (
        <ReadNotice {...query} />
      )}
      {selected && (
        <ChangeDetail
          change={selected.change}
          revision={selected.revision}
          onClose={() => setSelected(null)}
        />
      )}
      {publishing && <Publication onClose={() => setPublishing(false)} />}
    </section>
  );
}
