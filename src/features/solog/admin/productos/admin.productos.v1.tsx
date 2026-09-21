import { useMemo, useState } from "react";
import {
  CircleOff,
  Clock,
  RotateCcw,
  Search,
  Settings,
} from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import { useMasterData } from "../masterdata/admin.masterdata.context";
import type { MasterDataProduct } from "../masterdata/admin.masterdata.v1";
import { QueryState, Value } from "../admin.v2.presentation";
import { AdminNotice, AdminPagination, AdminSort, IconButton } from "../admin.primitives";
import { paginateAdminRows } from "../admin.pagination";
import { useCatalogStore } from "../catalogo/admin.catalogo.context";
import { CatalogMutationNotice } from "../catalogo/admin.catalogo.feedback";
import { catalogMutationError } from "../catalogo/admin.catalogo.feedback.utils";
import {
  ProductSetupDialog,
  type ProductSetupTarget,
} from "./admin.product-setup.dialog";
import {
  filterAndSortProducts,
  type ProductModeFilter,
  type ProductSort,
} from "./admin.productos.model";

function ProductStateProposal({
  product,
  groupName,
  onClose,
}: {
  product: MasterDataProduct;
  groupName: string | null;
  onClose: () => void;
}) {
  const store = useCatalogStore();
  const [error, setError] = useState("");
  const [configure, setConfigure] = useState(false);
  const intent = store.intent();
  const action = product.estado === "Excluido" ? "reincorporate" : "exclude";

  if (action === "reincorporate" && configure) {
    return (
      <ProductSetupDialog
        target={{
          propuesta_fingerprint: null,
          c_interno: product.c_interno,
          producto: product.producto,
          precio: product.precio,
          tipo: "reincorporar_producto",
        }}
        flow="propose_reincorporation"
        onClose={() => setConfigure(false)}
        onComplete={onClose}
      />
    );
  }

  const title =
    action === "exclude" ? "Aprobar exclusión" : "Reincorporar producto";
  const description =
    action === "exclude"
      ? "El cambio quedará aprobado y listo para incluirse en la próxima publicación del Catálogo."
      : "La reincorporación debe configurarse antes de quedar aprobada.";

  const submitExclude = () => {
    setError("");
    void store
      .mutation("propose_product_state", {
        c_interno: product.c_interno,
        action: "exclude",
      })
      .then(onClose)
      .catch((reason: unknown) =>
        setError(catalogMutationError(store, reason, "No se pudo aprobar la exclusión.")),
      );
  };

  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .then(onClose)
      .catch((reason: unknown) =>
        setError(catalogMutationError(store, reason, "No se pudo confirmar la propuesta.")),
      );
  };

  return (
    <AdminDialog
      title={title}
      description={description}
      onClose={onClose}
      closeDisabled={!!intent?.pending}
      footer={
        <>
          <button
            type="button"
            className="button button--secondary"
            disabled={!!intent?.pending}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={action === "exclude" ? "button button--danger" : "button"}
            disabled={!!intent}
            onClick={action === "exclude" ? submitExclude : () => setConfigure(true)}
          >
            {action === "exclude" ? (
              <CircleOff size={16} aria-hidden="true" />
            ) : (
              <RotateCcw size={16} aria-hidden="true" />
            )}
            {action === "exclude" ? "Aprobar exclusión" : "Configurar reincorporación"}
          </button>
        </>
      }
    >
      <div className="admin-dialog-confirmation">
        <AdminNotice tone="info">
          {action === "exclude"
            ? "Esta acción aprueba el cambio, pero el producto no cambiará hasta publicar el Catálogo."
            : "La reincorporación no se aprobará hasta guardar una configuración válida."}
        </AdminNotice>
        <dl className="admin-dialog-context">
          <div>
            <dt>Producto</dt>
            <dd>{product.producto}</dd>
          </div>
          <div>
            <dt>C. interno</dt>
            <dd>{product.c_interno}</dd>
          </div>
          <div>
            <dt>Estado actual</dt>
            <dd>{product.estado === "Excluido" ? "Excluido" : "Incluido"}</dd>
          </div>
          <div>
            <dt>Grupo</dt>
            <dd>{groupName ?? "—"}</dd>
          </div>
        </dl>
        {intent && <CatalogMutationNotice onRetry={retry} />}
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
      </div>
    </AdminDialog>
  );
}

function ProductSetupPendingDialog({
  items,
  onConfigure,
  onClose,
}: {
  items: ProductSetupTarget[];
  onConfigure: (target: ProductSetupTarget) => void;
  onClose: () => void;
}) {
  return (
    <AdminDialog
      title="Configuración pendiente"
      description="Completa la configuración necesaria antes de publicar los productos."
      onClose={onClose}
      footer={
        <button type="button" className="button button--secondary" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="admin-products__setup-list">
        {items.map((item) => (
          <article
            key={item.propuesta_fingerprint ?? item.c_interno}
            className="admin-products__setup-item"
          >
            <div>
              <strong>{item.producto}</strong>
              <span>
                {item.tipo === "reincorporar_producto"
                  ? "Reincorporación"
                  : "Nuevo producto"}{" "}
                · C. interno {item.c_interno}
              </span>
            </div>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onConfigure(item)}
            >
              <Settings size={16} aria-hidden="true" />
              Configurar
            </button>
          </article>
        ))}
      </div>
    </AdminDialog>
  );
}
export function AdminProductsV1() {
  const masterData = useMasterData();
  const catalog = useCatalogStore();
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<ProductModeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState<ProductSort>("name");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<MasterDataProduct | null>(null);
  const [setup, setSetup] = useState<ProductSetupTarget | null>(null);
  const [setupListOpen, setSetupListOpen] = useState(false);
  const products = useMemo(
    () =>
      masterData.snapshot && masterData.derived
        ? filterAndSortProducts(
            masterData.snapshot.products,
            masterData.derived,
            { search, mode: modeFilter, categoryId: categoryFilter, sort },
          )
        : [],
    [
      categoryFilter,
      masterData.derived,
      masterData.snapshot,
      modeFilter,
      search,
      sort,
    ],
  );
  const modeCounts = useMemo(() => {
    if (!masterData.snapshot || !masterData.derived)
      return { all: 0, Único: 0, Agrupado: 0, Excluido: 0 };
    const available = filterAndSortProducts(
      masterData.snapshot.products,
      masterData.derived,
      { search, mode: "all", categoryId: categoryFilter, sort: "name" },
    );
    return {
      all: available.length,
      Único: available.filter((product) => product.estado === "Único").length,
      Agrupado: available.filter((product) => product.estado === "Agrupado")
        .length,
      Excluido: available.filter((product) => product.estado === "Excluido")
        .length,
    };
  }, [categoryFilter, masterData.derived, masterData.snapshot, search]);
  const visible = useMemo(
    () => paginateAdminRows(products, page),
    [page, products],
  );
  if (!masterData.snapshot || !masterData.derived)
    return <QueryState error={masterData.error} retry={masterData.retry} />;
  const derived = masterData.derived;
  const setupFromSnapshot = masterData.snapshot.setup_required.filter(
    (item) => !catalog.productSetupPrepared(item.propuesta_fingerprint),
  );
  const setupFingerprints = new Set(
    setupFromSnapshot.map((item) => item.propuesta_fingerprint),
  );
  const setupRequired = [
    ...setupFromSnapshot,
    ...catalog
      .confirmedSetupRequired()
      .filter((item) => !setupFingerprints.has(item.propuesta_fingerprint)),
  ];
  return (
    <section className="admin-catalog admin-products">

      <section className="admin-products__section">
        <form
          className="admin-toolbar admin-toolbar-surface"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="admin-toolbar__search">
            Buscar
            <span className="admin-filter-search">
              <Search size={16} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Producto, código, marca, categoría o grupo"
              />
            </span>
          </label>
          <label className="admin-toolbar__filter">
            Categoría
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">Todas</option>
              {masterData.snapshot.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-toolbar__actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={setupRequired.length === 0}
              onClick={() => setSetupListOpen(true)}
            >
              <Settings size={16} aria-hidden="true" />
              Configurar
              {setupRequired.length > 0 ? ` · ${setupRequired.length}` : null}
            </button>
          </div>
        </form>
        <div className="admin-section-secondary-row">
          <div
            className="admin-quick-filter-chips"
            role="group"
            aria-label="Modalidad"
          >
            <button
              key={"all"}
              type="button"
              className="admin-quick-filter-chip"
              aria-pressed={modeFilter === "all"}
              onClick={() => {
                setModeFilter("all");
                setPage(0);
              }}
            >
              <span>Todos</span>
              <strong>{modeCounts["all"]}</strong>
            </button>
            {(
              [
                ["Único", "Únicos"],
                ["Agrupado", "Agrupados"],
                ["Excluido", "Excluidos"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="admin-quick-filter-chip tone--color"
                aria-pressed={modeFilter === value}
                onClick={() => {
                  setModeFilter(value);
                  setPage(0);
                }}
              >
                <span>{label}</span>
                <strong>{modeCounts[value]}</strong>
              </button>
            ))}
          </div>
          <AdminSort<ProductSort>
            value={sort}
            defaultValue="name"
            onChange={(value) => {
              setSort(value);
              setPage(0);
            }}
            options={[
              { value: "name", label: "Predeterminado" },
              { value: "code", label: "Código interno" },
              { value: "price_asc", label: "Precio: menor a mayor" },
              { value: "price_desc", label: "Precio: mayor a menor" },
            ]}
          />
        </div>
        <div className="admin-table-section admin-catalog__table">
          <div className="admin-main-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">C. interno</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Grupo</th>
                  <th scope="col" className="admin-table-number">Precio</th>
                  <th scope="col" className="admin-table-action-cell">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.rows.map((product) => {
                  const category =
                    derived.categoryById.get(product.categoria_id)?.nombre ??
                    "—";
                  const group = product.grupo_id
                    ? (derived.groupById.get(product.grupo_id)?.nombre ?? "—")
                    : null;
                  const actionLabel =
                    product.estado === "Excluido"
                      ? "Aprobar reincorporación"
                      : "Aprobar exclusión";
                  const proposalOverride =
                    catalog.confirmedProductProposalStatus(product.c_interno);
                  const proposalState =
                    proposalOverride === "none"
                      ? undefined
                      : (proposalOverride ?? product.propuesta?.estado);
                  return (
                    <tr key={product.c_interno}>
                      <th scope="row">{product.producto}</th>
                      <td>{product.c_interno}</td>
                      <td>{category}</td>
                      <td>
                        <span className="admin-products__group">
                          <span
                            className={
                              product.estado === "Excluido"
                                ? "admin-status-badge admin-status-badge--danger"
                                : "admin-attribute-badge"
                            }
                          >
                            {product.estado}
                          </span>
                          <span>{group ?? "—"}</span>
                        </span>
                      </td>
                      <td className="admin-table-number">
                        <Value value={product.precio} money />
                      </td>
                      <td className="admin-table-action-cell">
                        <div className="admin-table-actions">
                          <IconButton
                            aria-label={
                              proposalState
                                ? proposalState === "aprobado"
                                  ? `Cambio aprobado para publicación: ${product.producto}`
                                  : `Propuesta en revisión para ${product.producto}`
                                : actionLabel
                            }
                            title={
                              proposalState
                                ? proposalState === "aprobado"
                                  ? "Cambio aprobado para publicación"
                                  : "Propuesta en revisión"
                                : actionLabel
                            }
                            variant={
                              product.estado === "Excluido" ? "primary" : "danger"
                            }
                            disabled={!!proposalState}
                            onClick={() => setSelected(product)}
                          >
                            {proposalState ? (
                              <Clock size={16} aria-hidden="true" />
                            ) : product.estado === "Excluido" ? (
                              <RotateCcw size={16} aria-hidden="true" />
                            ) : (
                              <CircleOff size={16} aria-hidden="true" />
                            )}
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!products.length && (
                  <tr>
                    <td colSpan={6}>
                      No hay productos que coincidan con los filtros locales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <AdminPagination
          total={products.length}
          currentPage={visible.currentPage}
          pageCount={visible.pageCount}
          onPageChange={setPage}
          ariaLabel="Paginación de productos"
        />
      </section>
      {selected && (
        <ProductStateProposal
          product={selected}
          groupName={
            selected.grupo_id
              ? (derived.groupById.get(selected.grupo_id)?.nombre ?? null)
              : null
          }
          onClose={() => setSelected(null)}
        />
      )}
      {setupListOpen && (
        <ProductSetupPendingDialog
          items={setupRequired}
          onClose={() => setSetupListOpen(false)}
          onConfigure={(item) => {
            setSetup({ ...item, propuesta_fingerprint: item.propuesta_fingerprint });
            setSetupListOpen(false);
          }}
        />
      )}
      {setup && (
        <ProductSetupDialog
          target={setup}
          onClose={() => setSetup(null)}
          onComplete={() => setSetup(null)}
        />
      )}
    </section>
  );
}
