import { useState } from "react";
import {
  Check,
  CircleOff,
  ClipboardCheck,
  DollarSign,
  Eye,
  EyeOff,
  Package,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Undo2,
  Upload,
} from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import {
  ValuationDialog,
  type ValuationDecision,
} from "../admin.valuation-dialog";
import { useAdminStore } from "../admin.v2.context";
import {
  ProductSetupDialog,
  type ProductSetupTarget,
} from "../productos/admin.product-setup.dialog";
import { useCatalogQuery, useCatalogStore } from "./admin.catalogo.context";
import { CatalogMutationNotice } from "./admin.catalogo.feedback";
import { catalogMutationError } from "./admin.catalogo.feedback.utils";
import {
  catalogProposalChange,
  type CatalogProposal,
  type CatalogProposalStatus,
  type CatalogReads,
} from "./admin.catalogo.v3";
import { adminTimestamp } from "../admin.v2.format";
import { QueryState, Value } from "../admin.v2.presentation";
import { AdminBinarySwitch, AdminNotice, AdminPagination, IconButton } from "../admin.primitives";
import { paginateAdminRows } from "../admin.pagination";

type ProposalAction = "approve" | "ignore" | "withdraw";
type ProposalSection = "urgent" | "emerging";
type PriceResolution = "update_group_price" | "separate_sku" | "keep_structure";

const CATALOG_PROPOSAL_PAGE_SIZE = 25;

const proposalStatuses: Array<{ id: CatalogProposalStatus; label: string }> = [
  { id: "pendiente", label: "Pendientes" },
  { id: "aprobado", label: "Aprobados" },
  { id: "ignorado", label: "Ignorados" },
  { id: "incorporado", label: "Publicados" },
];
const urgentTypes = new Set<CatalogProposal["tipo"]>([
  "agregar_producto",
  "precio",
  "reincorporar_producto",
]);
const emergingTypes = new Set<CatalogProposal["tipo"]>([
  "eliminar_producto",
  "excluir_producto",
  "nombre",
  "codigo",
]);
const proposalLabels: Record<CatalogProposal["tipo"], string> = {
  agregar_producto: "Agregar producto",
  eliminar_producto: "Eliminar producto",
  excluir_producto: "Excluir producto",
  reincorporar_producto: "Reincorporar producto",
  nombre: "Cambiar nombre",
  codigo: "Cambiar código de barras",
  precio: "Cambiar precio",
};
const proposalStatusLabels: Record<CatalogProposalStatus, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobada",
  ignorado: "Ignorada",
  incorporado: "Publicada",
};
const resolutionSwitchOptions = [
  { value: "update_group_price", label: "Actualizar grupo" },
  { value: "separate_sku", label: "Separar producto" },
] as const;

type PackageAction = "keep" | "clear" | "not_applicable" | "set" | "update" | "";
type PreparedValuation = {
  unidades_por_paquete: number;
  precio_paquete: number;
};

const blockReasonLabels: Record<string, string> = {
  propuesta_desactualizada:
    "Existe evidencia más reciente. Revisa la propuesta antes de publicar.",
  configuracion_requerida:
    "El producto requiere configuración antes de publicar.",
  producto_con_stock:
    "El producto no puede eliminarse mientras tenga stock.",
  producto_no_encontrado:
    "El producto ya no está disponible en el Catálogo.",
  producto_excluido:
    "El producto está excluido del Catálogo.",
  grupo_no_disponible:
    "El grupo actual ya no está disponible.",
  resolucion_precio_desactualizada:
    "La resolución de precio preparada quedó desactualizada. Vuelve a resolver el cambio.",
  resolucion_precio_requerida:
    "Debes resolver el cambio de precio antes de publicar.",
  decision_precio_paquete_requerida:
    "Debes definir el valorizado por paquete antes de publicar.",
  precio_paquete_invalido:
    "El precio por paquete preparado no es válido.",
};

function proposalBlockMessage(reason: string | null) {
  if (!reason) return null;
  return (
    blockReasonLabels[reason] ??
    "La propuesta tiene un bloqueo de publicación que requiere revisión."
  );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function proposalSetupPrice(proposal: CatalogProposal): number | null {
  const proposed = finiteNumber(proposal.datos["precio"]);
  const current = finiteNumber(proposal.catalogo_actual.precio);
  if (proposal.tipo === "agregar_producto") return proposed;
  if (proposal.tipo === "reincorporar_producto") return current ?? proposed;
  return current ?? proposed;
}

function proposalOrigin(proposal: CatalogProposal) {
  return proposal.cambio_id === null ? "Automático" : "Propuesto";
}

function preparedText(
  prepared: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = prepared?.[key];
  return typeof value === "string" ? value : null;
}

function preparedNumber(
  prepared: Record<string, unknown> | null,
  key: string,
): number | null {
  return finiteNumber(prepared?.[key]);
}

function priceErrorMessage(reason: unknown) {
  const code =
    reason && typeof reason === "object" && "code" in reason
      ? String(reason.code)
      : "";
  if (
    code === "INVALID_PACKAGE_CONFIGURATION" ||
    code === "SOLOG_INVALID_PACKAGE_CONFIGURATION"
  )
    return "La configuración de valorizado no es válida.";
  if (
    code === "INVALID_PACKAGE_PRICE" ||
    code === "SOLOG_INVALID_PACKAGE_PRICE"
  )
    return "El precio por paquete no es válido.";
  if (
    code === "PACKAGE_PRICE_DECISION_REQUIRED" ||
    code === "SOLOG_PACKAGE_PRICE_DECISION_REQUIRED"
  )
    return "Debes decidir explícitamente el valorizado antes de preparar.";
  return reason instanceof Error
    ? reason.message
    : "No se pudo preparar el precio.";
}

function CatalogStatus() {
  const status = useCatalogQuery("status", {});
  if (!status.data) {
    if (status.error) return <QueryState {...status} variant="compact" />;
    return null;
  }
  const catalog = status.data.catalog;
  return (
    <p>
      Versión {catalog.version_actual ?? "sin publicar"} ·{" "}
      {adminTimestamp(catalog.publicado_at)} · {catalog.total} SKU
    </p>
  );
}
function classifyProposal(proposal: CatalogProposal): ProposalSection {
  if (urgentTypes.has(proposal.tipo)) return "urgent";
  if (emergingTypes.has(proposal.tipo)) return "emerging";
  throw new Error("Tipo de propuesta Catálogo V3 no clasificable.");
}

function ProposalsSurface() {
  const [status, setStatus] = useState<CatalogProposalStatus>("pendiente");
  const [selected, setSelected] = useState<CatalogProposal | null>(null);
  const query = useCatalogQuery("proposals", { estado: status });
  const rows = query.data?.rows ?? [];
  const urgent = rows.filter(
    (proposal) => classifyProposal(proposal) === "urgent",
  );
  const emerging = rows.filter(
    (proposal) => classifyProposal(proposal) === "emerging",
  );
  return (
    <>
      <div
        className="admin-state-views"
        role="tablist"
        aria-label="Estado de propuestas"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const current = proposalStatuses.findIndex(
            (item) => item.id === status,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? proposalStatuses.length - 1
                : (current +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    proposalStatuses.length) %
                  proposalStatuses.length;
          setStatus(proposalStatuses[next].id);
          const tabs =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            );
          tabs.item(next)?.focus();
        }}
      >
        {proposalStatuses.map((item) => (
          <button
            type="button"
            role="tab"
            id={`admin-catalog-state-${item.id}`}
            key={item.id}
            aria-selected={status === item.id}
            aria-controls="admin-catalog-proposals-panel"
            tabIndex={status === item.id ? 0 : -1}
            onClick={() => setStatus(item.id)}
          >
            {item.label}
            {query.data && <strong>{query.data.counts[item.id]}</strong>}
          </button>
        ))}
      </div>
      <div
        id="admin-catalog-proposals-panel"
        role="tabpanel"
        aria-labelledby={`admin-catalog-state-${status}`}
      >
        {!query.data ? (
          <QueryState {...query} />
        ) : (
          <div className="admin-catalog__pending">
            <ProposalSection
              key={`${status}:urgent`}
              title="Urgentes"
              rows={urgent}
              section="urgent"
              onSelect={setSelected}
            />
            <ProposalSection
              key={`${status}:emerging`}
              title="Emergentes"
              rows={emerging}
              section="emerging"
              onSelect={setSelected}
            />
          </div>
        )}
      </div>
      {selected && (
        <ProposalDetail proposal={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
function ProposalSection({
  title,
  rows,
  section,
  onSelect,
}: {
  title: string;
  rows: CatalogProposal[];
  section: ProposalSection;
  onSelect: (proposal: CatalogProposal) => void;
}) {
  const [page, setPage] = useState(0);
  const paginated = paginateAdminRows(rows, page, CATALOG_PROPOSAL_PAGE_SIZE);
  if (paginated.currentPage !== page) setPage(paginated.currentPage);
  return (
    <section
      className={`admin-catalog__section admin-catalog__section--${section}`}
    >
      <header>
        <h3>{title}</h3>
        <span>{rows.length}</span>
      </header>
      <div className="admin-main-table admin-catalog__table">
        <table>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Producto</th>
              <th scope="col">Cambio</th>
              <th scope="col">Origen</th>
              <th scope="col" className="admin-table-action-cell">Acción</th>
            </tr>
          </thead>
          <tbody>
            {paginated.rows.map((proposal) => (
              <ProposalRow
                key={proposal.propuesta_fingerprint}
                proposal={proposal}
                onSelect={onSelect}
              />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>No hay propuestas {title.toLowerCase()}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AdminPagination
        total={rows.length}
        currentPage={paginated.currentPage}
        pageCount={paginated.pageCount}
        pageSize={CATALOG_PROPOSAL_PAGE_SIZE}
        onPageChange={setPage}
        ariaLabel={`Paginación de ${title.toLowerCase()}`}
      />
    </section>
  );
}
function accessibleChangeValue(value: string | number | null, money = false) {
  if (value === null) return "sin valor";
  return money
    ? new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "PEN",
      }).format(value as number)
    : String(value);
}
function ProposalChange({ proposal }: { proposal: CatalogProposal }) {
  const change = catalogProposalChange(proposal);
  if (change.kind === "price") {
    const label = `Anterior: ${accessibleChangeValue(change.previous, true)}; cambia a nuevo: ${accessibleChangeValue(change.next, true)}`;
    return (
      <>
        <span aria-hidden="true">
          <Value value={change.previous} money /> <span>→</span>{" "}
          <Value value={change.next} money />
        </span>
        <span className="admin-catalog__change-sr">{label}</span>
      </>
    );
  }
  if (change.kind === "text") {
    const label = `Anterior: ${accessibleChangeValue(change.previous)}; cambia a nuevo: ${accessibleChangeValue(change.next)}`;
    return (
      <>
        <span aria-hidden="true">
          {change.previous ?? "—"} <span>→</span> {change.next ?? "—"}
        </span>
        <span className="admin-catalog__change-sr">{label}</span>
      </>
    );
  }
  return <>{change.label}</>;
}
function ProposalRow({
  proposal,
  onSelect,
}: {
  proposal: CatalogProposal;
  onSelect: (proposal: CatalogProposal) => void;
}) {
  const product = proposal.producto ?? proposal.catalogo_actual.producto ?? "—";
  const origin =
    proposal.cambio_id === null
      ? "Automático"
      : proposal.sedes.map((site) => site.nombre).join(", ") || "Propuesto";
  return (
    <tr>
      <td>{proposalLabels[proposal.tipo]}</td>
      <th scope="row">
        <span className="admin-table-cell-stack">
          <span className="admin-table-cell-primary">{product}</span>
          <span className="admin-table-cell-secondary">
            {proposal.c_interno}
          </span>
        </span>
      </th>
      <td className="admin-catalog__change">
        <ProposalChange proposal={proposal} />
      </td>
      <td>
        <span className="admin-attribute-badge">{origin}</span>
      </td>
      <td className="admin-table-action-cell">
        <div className="admin-table-actions">
          <IconButton
            aria-label={`Ver detalle de ${product}`}
            title="Ver detalle"
            onClick={() => onSelect(proposal)}
          >
            <Eye size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </td>
    </tr>
  );
}

function ProposalDetailChange({ proposal }: { proposal: CatalogProposal }) {
  const change = catalogProposalChange(proposal);
  return (
    <section className="admin-catalog__dialog-section">
      <h3>Cambio propuesto</h3>
      <dl className="admin-dialog-context">
        {change.kind === "price" ? (
          <>
            <div>
              <dt>Precio actual</dt>
              <dd><Value value={change.previous} money /></dd>
            </div>
            <div>
              <dt>Precio nuevo</dt>
              <dd><Value value={change.next} money /></dd>
            </div>
          </>
        ) : change.kind === "text" ? (
          <>
            <div>
              <dt>{proposal.tipo === "nombre" ? "Nombre actual" : "Código actual"}</dt>
              <dd>{change.previous ?? "—"}</dd>
            </div>
            <div>
              <dt>{proposal.tipo === "nombre" ? "Nombre nuevo" : "Código nuevo"}</dt>
              <dd>{change.next ?? "—"}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Acción</dt>
            <dd>{change.label}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function ProposalDetail({
  proposal,
  onClose,
}: {
  proposal: CatalogProposal;
  onClose: () => void;
}) {
  const store = useCatalogStore();
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [price, setPrice] = useState(false);
  const intent = store.intent();
  const run = (action: ProposalAction) => {
    setError("");
    void store
      .mutation(
        "proposal_action",
        { propuesta_fingerprint: proposal.propuesta_fingerprint, action },
        { proposal },
      )
      .then(onClose)
      .catch((reason: unknown) =>
        setError(
          catalogMutationError(
            store,
            reason,
            "No se pudo actualizar la propuesta.",
          ),
        ),
      );
  };
  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .then(onClose)
      .catch((reason: unknown) =>
        setError(
          catalogMutationError(
            store,
            reason,
            "No se pudo confirmar la propuesta.",
          ),
        ),
      );
  };

  const blocked =
    proposal.estado === "aprobado" && proposal.block_reason !== null;
  const canSetup =
    proposal.tipo === "agregar_producto" ||
    proposal.tipo === "reincorporar_producto";
  const setupPrice = canSetup ? proposalSetupPrice(proposal) : null;
  const setupTarget: ProductSetupTarget | null =
    canSetup && setupPrice !== null
      ? {
          propuesta_fingerprint: proposal.propuesta_fingerprint,
          c_interno: proposal.c_interno,
          producto:
            proposal.producto ??
            proposal.catalogo_actual.producto ??
            `SKU ${proposal.c_interno}`,
          precio: setupPrice,
          tipo:
            proposal.tipo === "reincorporar_producto"
              ? "reincorporar_producto"
              : "agregar_producto",
        }
      : null;
  const blockMessage = proposalBlockMessage(proposal.block_reason);

  return (
    <>
      <AdminDialog
        title={
          proposal.producto ??
          proposal.catalogo_actual.producto ??
          `Propuesta ${proposal.c_interno}`
        }
        description={`${proposalLabels[proposal.tipo]} · ${proposalStatusLabels[proposal.estado]}`}
        onClose={onClose}
        closeDisabled={!!intent?.pending}
        variant="wide"
        footer={
          <>
            <button
              type="button"
              className="button button--secondary"
              disabled={!!intent?.pending}
              onClick={onClose}
            >
              Cerrar
            </button>
            {proposal.estado === "pendiente" && (
              <>
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={!!intent}
                  onClick={() => run("ignore")}
                >
                  <EyeOff size={16} aria-hidden="true" />
                  Ignorar propuesta
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!!intent}
                  onClick={() => run("approve")}
                >
                  <Check size={16} aria-hidden="true" />
                  Aprobar
                </button>
              </>
            )}
            {proposal.estado === "aprobado" && (
              <>
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={!!intent}
                  onClick={() => run("withdraw")}
                >
                  <Undo2 size={16} aria-hidden="true" />
                  Retirar aprobación
                </button>
                {canSetup && (
                  <button
                    type="button"
                    className="button"
                    disabled={!!intent || !setupTarget}
                    onClick={() => setupTarget && setSetup(true)}
                    title={
                      setupTarget
                        ? undefined
                        : "La propuesta no contiene un precio válido para configurar el producto."
                    }
                  >
                    <Settings size={16} aria-hidden="true" />
                    {proposal.setup
                      ? "Actualizar configuración"
                      : "Configurar producto"}
                  </button>
                )}
                {proposal.tipo === "precio" && (
                  <button
                    type="button"
                    className="button"
                    disabled={!!intent}
                    onClick={() => setPrice(true)}
                  >
                    <DollarSign size={16} aria-hidden="true" />
                    {proposal.price_resolution
                      ? "Actualizar resolución de precio"
                      : "Resolver precio"}
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        <div className="admin-dialog-task">
          <ProposalDetailChange proposal={proposal} />

          <section className="admin-catalog__dialog-section">
            <h3>Contexto</h3>
            <dl className="admin-catalog__proposal-summary">
              <div>
                <dt>C. interno</dt>
                <dd>{proposal.c_interno}</dd>
              </div>
              <div>
                <dt>Origen</dt>
                <dd>{proposalOrigin(proposal)}</dd>
              </div>
              <div>
                <dt>Sedes</dt>
                <dd>
                  {proposal.sedes.length
                    ? proposal.sedes.map((site) => site.nombre).join(", ")
                    : "Sin sedes asociadas"}
                </dd>
              </div>
              <div>
                <dt>Apariciones</dt>
                <dd>{proposal.occurrence_count}</dd>
              </div>
              <div>
                <dt>Primera evidencia</dt>
                <dd>{adminTimestamp(proposal.first_seen_at)}</dd>
              </div>
              <div>
                <dt>Última evidencia</dt>
                <dd>{adminTimestamp(proposal.last_seen_at)}</dd>
              </div>
            </dl>
          </section>

          {proposal.stale && (
            <AdminNotice tone="warning">
              Existe evidencia más reciente. Revisa la propuesta antes de
              publicar.
            </AdminNotice>
          )}

          {proposal.estado === "aprobado" &&
            !proposal.stale &&
            (blocked && blockMessage ? (
              <AdminNotice tone="error">{blockMessage}</AdminNotice>
            ) : proposal.publicable ? (
              <AdminNotice tone="success">
                La propuesta está lista para publicación.
              </AdminNotice>
            ) : (
              <AdminNotice tone="info">
                La propuesta está aprobada; el estado de publicación aún no está
                disponible.
              </AdminNotice>
            ))}

          {canSetup && !setupTarget && proposal.estado === "aprobado" && (
            <AdminNotice tone="error">
              La propuesta no contiene un precio válido para configurar el
              producto.
            </AdminNotice>
          )}

          {intent && !setup && !price && (
            <CatalogMutationNotice onRetry={retry} />
          )}
          {error && <AdminNotice tone="error">{error}</AdminNotice>}
        </div>
      </AdminDialog>

      {setup && setupTarget && (
        <ProductSetupDialog
          target={setupTarget}
          onClose={() => setSetup(false)}
          onComplete={onClose}
        />
      )}

      {price && (
        <PriceResolutionDialog
          fingerprint={proposal.propuesta_fingerprint}
          onClose={() => setPrice(false)}
          onComplete={onClose}
        />
      )}
    </>
  );
}

function PriceResolutionDialog({
  fingerprint,
  onClose,
  onComplete,
}: {
  fingerprint: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const store = useCatalogStore();
  const query = useCatalogQuery("price_options", {
    propuesta_fingerprint: fingerprint,
  });
  const intent = store.intent();

  if (!query.data) {
    return (
      <AdminDialog
        title="Resolver precio"
        onClose={onClose}
        closeDisabled={!!intent?.pending}
        variant="wide"
      >
        <QueryState {...query} variant="compact" />
      </AdminDialog>
    );
  }

  return (
    <PriceResolutionContent
      key={`${fingerprint}:${JSON.stringify(query.data.prepared_resolution)}`}
      fingerprint={fingerprint}
      options={query.data}
      onClose={onClose}
      onComplete={onComplete}
    />
  );
}

function PriceResolutionContent({
  fingerprint,
  options,
  onClose,
  onComplete,
}: {
  fingerprint: string;
  options: CatalogReads["price_options"];
  onClose: () => void;
  onComplete: () => void;
}) {
  const store = useCatalogStore();
  const intent = store.intent();
  const prepared =
    options.prepared_resolution &&
    typeof options.prepared_resolution === "object"
      ? (options.prepared_resolution as Record<string, unknown>)
      : null;
  const preparedResolutionValue = preparedText(prepared, "resolution");
  const preparedResolution: PriceResolution | "" =
    preparedResolutionValue === "update_group_price" ||
    preparedResolutionValue === "separate_sku" ||
    preparedResolutionValue === "keep_structure"
      ? preparedResolutionValue
      : "";
  const preparedPackageValue = preparedText(prepared, "package_action");
  const preparedPackageAction: PackageAction =
    preparedPackageValue === "keep" ||
    preparedPackageValue === "clear" ||
    preparedPackageValue === "not_applicable" ||
    preparedPackageValue === "set" ||
    preparedPackageValue === "update"
      ? preparedPackageValue
      : "";

  const onlyKeepStructure =
    options.options.length === 1 && options.options[0] === "keep_structure";
  const initialResolution: PriceResolution | "" = onlyKeepStructure
    ? "keep_structure"
    : options.options.includes(preparedResolution as PriceResolution)
      ? preparedResolution
      : "";
  const compatiblePreparedPackageAction: PackageAction =
    initialResolution === "separate_sku"
      ? preparedPackageAction === "set" ||
        preparedPackageAction === "clear" ||
        preparedPackageAction === "not_applicable"
        ? preparedPackageAction
        : ""
      : preparedPackageAction === "keep" ||
          preparedPackageAction === "clear" ||
          preparedPackageAction === "set" ||
          preparedPackageAction === "update"
        ? preparedPackageAction
        : "";
  const initialPackageAction: PackageAction =
    compatiblePreparedPackageAction ||
    (initialResolution &&
    initialResolution !== "separate_sku" &&
    !options.package_decision_required
      ? "keep"
      : "");

  const preparedUnits =
    preparedNumber(prepared, "unidades_por_paquete") ??
    (preparedPackageAction === "update"
      ? options.grupo.unidades_por_paquete
      : null);
  const preparedPrice = preparedNumber(prepared, "precio_paquete");
  const initialPreparedValuation: PreparedValuation | null =
    (preparedPackageAction === "set" || preparedPackageAction === "update") &&
    preparedUnits !== null &&
    preparedPrice !== null
      ? {
          unidades_por_paquete: preparedUnits,
          precio_paquete: preparedPrice,
        }
      : null;

  const [resolution, setResolution] =
    useState<PriceResolution | "">(initialResolution);
  const [packageAction, setPackageAction] =
    useState<PackageAction>(initialPackageAction);
  const [preparedValuation, setPreparedValuation] =
    useState<PreparedValuation | null>(initialPreparedValuation);
  const [valuation, setValuation] = useState(false);
  const [error, setError] = useState("");

  const currentValuation =
    options.grupo.unidades_por_paquete && options.grupo.precio_paquete
      ? `x${options.grupo.unidades_por_paquete} · S/ ${options.grupo.precio_paquete.toFixed(2)}`
      : "Sin valorizado";
  const targetMember = options.members.find(
    (member) => member.c_interno === options.c_interno,
  );
  const canKeep = resolution !== "separate_sku";

  const selectResolution = (value: PriceResolution) => {
    setResolution(value);
    setPackageAction(
      value !== "separate_sku" && !options.package_decision_required
        ? "keep"
        : "",
    );
    setPreparedValuation(null);
    setError("");
  };

  const chooseValuation = (decision: ValuationDecision) => {
    if (decision.enabled) {
      setPreparedValuation({
        unidades_por_paquete: decision.unitsPerPackage!,
        precio_paquete: decision.packagePrice!,
      });
      setPackageAction("set");
    } else {
      setPreparedValuation(null);
      setPackageAction(
        resolution === "separate_sku" ? "not_applicable" : "clear",
      );
    }
    setError("");
    setValuation(false);
  };

  const currentComparable = JSON.stringify({
    resolution,
    package_action: packageAction,
    unidades_por_paquete:
      packageAction === "set" || packageAction === "update"
        ? preparedValuation?.unidades_por_paquete ?? null
        : null,
    precio_paquete:
      packageAction === "set" || packageAction === "update"
        ? preparedValuation?.precio_paquete ?? null
        : null,
  });
  const preparedComparable = prepared
    ? JSON.stringify({
        resolution: preparedResolution,
        package_action: preparedPackageAction,
        unidades_por_paquete:
          preparedPackageAction === "set" || preparedPackageAction === "update"
            ? initialPreparedValuation?.unidades_por_paquete ?? null
            : null,
        precio_paquete:
          preparedPackageAction === "set" || preparedPackageAction === "update"
            ? initialPreparedValuation?.precio_paquete ?? null
            : null,
      })
    : null;

  const valid =
    !!resolution &&
    !!packageAction &&
    ((packageAction !== "set" && packageAction !== "update") ||
      preparedValuation !== null);
  const hasChanges =
    preparedComparable === null || currentComparable !== preparedComparable;

  const submit = () => {
    if (!resolution) {
      setError("Selecciona una resolución de precio.");
      return;
    }
    if (options.change_state !== "aprobado") {
      setError("La propuesta ya no está aprobada. Actualiza la bandeja.");
      return;
    }
    if (!packageAction) {
      setError("Decide explícitamente el valorizado antes de guardar.");
      return;
    }
    if (
      (packageAction === "set" || packageAction === "update") &&
      !preparedValuation
    ) {
      setError("Configura un valorizado válido antes de guardar.");
      return;
    }

    setError("");
    const done = () => onComplete();
    const failed = (reason: unknown) =>
      setError(store.intent() ? "" : priceErrorMessage(reason));

    if (resolution === "separate_sku") {
      const payload =
        packageAction === "set"
          ? {
              propuesta_fingerprint: fingerprint,
              resolution: "separate_sku" as const,
              package_action: "set" as const,
              ...preparedValuation!,
            }
          : {
              propuesta_fingerprint: fingerprint,
              resolution: "separate_sku" as const,
              package_action:
                packageAction === "clear"
                  ? ("clear" as const)
                  : ("not_applicable" as const),
            };
      void store.mutation("prepare_price", payload).then(done).catch(failed);
      return;
    }

    const payload =
      packageAction === "set"
        ? {
            propuesta_fingerprint: fingerprint,
            resolution,
            package_action: "set" as const,
            ...preparedValuation!,
          }
        : packageAction === "update"
          ? {
              propuesta_fingerprint: fingerprint,
              resolution,
              package_action: "update" as const,
              precio_paquete: preparedValuation!.precio_paquete,
            }
          : {
              propuesta_fingerprint: fingerprint,
              resolution,
              package_action:
                packageAction === "clear"
                  ? ("clear" as const)
                  : ("keep" as const),
            };

    void store.mutation("prepare_price", payload).then(done).catch(failed);
  };

  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .then(onComplete)
      .catch((reason: unknown) =>
        setError(store.intent() ? "" : priceErrorMessage(reason)),
      );
  };

  const valuationInitial =
    (packageAction === "set" || packageAction === "update") &&
    preparedValuation
      ? {
          unitsPerPackage: preparedValuation.unidades_por_paquete,
          packagePrice: preparedValuation.precio_paquete,
        }
      : {
          unitsPerPackage: options.grupo.unidades_por_paquete,
          packagePrice: options.grupo.precio_paquete,
        };

  return (
    <>
      <AdminDialog
        title="Resolver precio"
        description={`${targetMember?.producto ?? options.grupo.nombre} · C. interno ${options.c_interno}`}
        onClose={onClose}
        closeDisabled={!!intent?.pending}
        variant="wide"
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
              className="button"
              disabled={
                !!intent ||
                options.change_state !== "aprobado" ||
                !valid ||
                !hasChanges
              }
              onClick={submit}
            >
              <Save size={16} aria-hidden="true" />
              Guardar resolución
            </button>
          </>
        }
      >
        <div className="admin-dialog-task">
          <section className="admin-catalog__dialog-section">
            <h3>Resumen del cambio</h3>
            <dl className="admin-catalog__price-summary">
              <div>
                <dt>Grupo</dt>
                <dd>{options.grupo.nombre}</dd>
              </div>
              <div>
                <dt>Precio</dt>
                <dd className="admin-catalog__price-flow">
                  <Value value={options.grupo.precio} money />
                  <span aria-hidden="true">→</span>
                  <Value value={options.nuevo_precio} money />
                </dd>
              </div>
              <div>
                <dt>Valorizado</dt>
                <dd>{currentValuation}</dd>
              </div>
            </dl>
          </section>

          <section className="admin-catalog__dialog-section">
            <h3>Integrantes afectados · {options.members.length}</h3>
            <div className="admin-auxiliary-table admin-catalog__table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {options.members.map((member) => (
                    <tr key={member.c_interno}>
                      <td>{member.c_interno}</td>
                      <th scope="row">{member.producto}</th>
                      <td><Value value={member.precio} money /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {onlyKeepStructure ? (
            <AdminNotice tone="info">
              El producto es el único integrante del grupo; se conservará su
              estructura.
            </AdminNotice>
          ) : (
            <AdminBinarySwitch
              label="Resolución"
              value={
                resolution === "separate_sku"
                  ? "separate_sku"
                  : resolution === "update_group_price"
                    ? "update_group_price"
                    : ""
              }
              options={resolutionSwitchOptions}
              onChange={selectResolution}
              disabled={!!intent}
            />
          )}

          {resolution && (
            <section className="admin-catalog__dialog-section admin-catalog__valuation-section">
              <h3>Valorizado al publicar</h3>
              <div className="admin-catalog__valuation-actions">
                {canKeep && (
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-pressed={packageAction === "keep"}
                    disabled={!!intent}
                    onClick={() => {
                      setPackageAction("keep");
                      setPreparedValuation(null);
                      setError("");
                    }}
                  >
                    <Package size={16} aria-hidden="true" />
                    {options.package_decision_required
                      ? "Conservar valorizado"
                      : "Mantener sin valorizado"}
                  </button>
                )}

                <button
                  type="button"
                  className="button button--secondary"
                  aria-pressed={
                    packageAction === "set" ||
                    packageAction === "update" ||
                    packageAction === "clear"
                  }
                  disabled={!!intent}
                  onClick={() => setValuation(true)}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Configurar
                </button>

                {resolution === "separate_sku" && (
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-pressed={
                      packageAction === "not_applicable" ||
                      packageAction === "clear"
                    }
                    disabled={!!intent}
                    onClick={() => {
                      setPackageAction("not_applicable");
                      setPreparedValuation(null);
                      setError("");
                    }}
                  >
                    <CircleOff size={16} aria-hidden="true" />
                    Sin valorizado
                  </button>
                )}
              </div>

              {(packageAction === "clear" ||
                packageAction === "not_applicable") && (
                <p className="admin-dialog-help">
                  El producto quedará sin valorizado por paquete al publicar.
                </p>
              )}

              {(packageAction === "set" || packageAction === "update") &&
                preparedValuation && (
                  <p className="admin-dialog-help">
                    Se aplicará x{preparedValuation.unidades_por_paquete} · S/{" "}
                    {preparedValuation.precio_paquete.toFixed(2)} al publicar.
                  </p>
                )}
            </section>
          )}

          <AdminNotice tone="info">
            Los cambios se aplicarán al publicar el Catálogo.
          </AdminNotice>

          {intent && <CatalogMutationNotice onRetry={retry} />}
          {error && <AdminNotice tone="error">{error}</AdminNotice>}
        </div>
      </AdminDialog>

      {valuation && (
        <ValuationDialog
          unitPrice={options.nuevo_precio}
          initial={valuationInitial}
          description="Esta configuración se aplicará al guardar la resolución y publicar el Catálogo."
          confirmLabel="Aplicar"
          pending={!!intent?.pending}
          onClose={() => setValuation(false)}
          onConfirm={chooseValuation}
        />
      )}
    </>
  );
}

function PublicationDialog({ onClose }: { onClose: () => void }) {
  const store = useCatalogStore();
  const query = useCatalogQuery("publication_preview", {});
  const admin = useAdminStore().bootstrap?.identity.rol === "admin";
  const preview = query.data?.preview;
  const receipt = store.publication;
  const completed = receipt.result?.completion_recorded === true;
  const recoverable = !!receipt.operationId && !completed;

  const closeDialog = () => {
    if (completed) store.acknowledgeCompletedPublication();
    onClose();
  };

  const publish = () => {
    void store.publish().catch(() => {});
  };

  const footer = completed || !admin ? (
    <button
      type="button"
      className="button button--secondary"
      disabled={!!receipt.pending}
      onClick={closeDialog}
    >
      Cerrar
    </button>
  ) : recoverable ? (
    <>
      <button
        type="button"
        className="button button--secondary"
        disabled={!!receipt.pending}
        onClick={closeDialog}
      >
        Cerrar
      </button>
      <button
        type="button"
        className="button"
        disabled={!!receipt.pending}
        onClick={publish}
      >
        <RotateCcw size={16} aria-hidden="true" />
        {receipt.pending ? "Confirmando…" : "Recuperar publicación"}
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        className="button button--secondary"
        disabled={!!receipt.pending}
        onClick={closeDialog}
      >
        Cancelar
      </button>
      <button
        type="button"
        className="button"
        disabled={!!receipt.pending || !preview?.ok}
        onClick={publish}
      >
        <Upload size={16} aria-hidden="true" />
        {receipt.pending ? "Publicando…" : "Publicar catálogo"}
      </button>
    </>
  );

  return (
    <AdminDialog
      title="Publicar catálogo"
      description="Revisa los cambios antes de publicar una nueva versión."
      onClose={closeDialog}
      closeDisabled={!!receipt.pending}
      variant="wide"
      footer={footer}
    >
      <div className="admin-dialog-task">
        {!preview ? (
          <QueryState {...query} variant="compact" />
        ) : preview.ok ? (
          <>
            <dl className="admin-dialog-context">
              <div>
                <dt>Versión</dt>
                <dd>
                  {preview.version_actual ?? "Sin publicación"} →{" "}
                  {preview.version_nueva ?? "Pendiente"}
                </dd>
              </div>
              <div>
                <dt>Cambios</dt>
                <dd>{preview.cambios_total}</dd>
              </div>
              <div>
                <dt>SKU</dt>
                <dd>{preview.sku_actuales} → {preview.sku_resultantes}</dd>
              </div>
            </dl>

            <section className="admin-catalog__dialog-section">
              <h3>Cambios incluidos</h3>
              <dl className="admin-catalog__publication-changes">
                {Object.entries(preview.cambios)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <div key={type}>
                      <dt>{proposalLabels[type as CatalogProposal["tipo"]]}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          </>
        ) : (
          <>
            <AdminNotice
              tone="error"
              action={
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={query.retry}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  Reintentar
                </button>
              }
            >
              No se puede publicar todavía.
            </AdminNotice>

            {(preview.version_actual !== undefined ||
              preview.version_nueva !== undefined ||
              preview.cambios_total !== undefined) && (
              <dl className="admin-dialog-context">
                {(preview.version_actual !== undefined ||
                  preview.version_nueva !== undefined) && (
                  <div>
                    <dt>Versión</dt>
                    <dd>
                      {preview.version_actual ?? "Sin publicación"} →{" "}
                      {preview.version_nueva ?? "Pendiente"}
                    </dd>
                  </div>
                )}
                {preview.cambios_total !== undefined && (
                  <div>
                    <dt>Cambios</dt>
                    <dd>{preview.cambios_total}</dd>
                  </div>
                )}
              </dl>
            )}

            {preview.conflictos.length > 0 ? (
              <div className="admin-catalog__conflicts">
                {preview.conflictos.map((conflict, index) => {
                  const entityId =
                    typeof conflict.entidad_id === "string"
                      ? conflict.entidad_id
                      : null;
                  const message =
                    typeof conflict.mensaje === "string"
                      ? conflict.mensaje
                      : "No se pudo validar este cambio.";
                  return (
                    <div
                      className="admin-catalog__conflict"
                      key={String(entityId ?? index)}
                    >
                      <strong>
                        {entityId ? `C. interno ${entityId}` : "Conflicto"}
                      </strong>
                      <span>{message}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              preview.errores.map((message) => (
                <AdminNotice tone="error" key={message}>
                  {message}
                </AdminNotice>
              ))
            )}
          </>
        )}

        {!admin && (
          <AdminNotice tone="info">
            Puedes revisar esta publicación, pero solo un administrador puede
            publicarla.
          </AdminNotice>
        )}

        {recoverable && !receipt.error && !receipt.result && (
          <AdminNotice tone="info">
            No se pudo confirmar el resultado de la publicación. Recuperar
            reutilizará la misma operación sin duplicar los cambios.
          </AdminNotice>
        )}

        {receipt.error && (
          <AdminNotice tone="error">
            {recoverable
              ? "No se pudo confirmar el resultado de la publicación. Usa Recuperar publicación para reutilizar la misma operación."
              : "No se pudo completar la publicación. Revisa el preview y vuelve a intentarlo."}
          </AdminNotice>
        )}

        {receipt.result &&
          (receipt.result.completion_recorded ? (
            <AdminNotice tone="success">
              Catálogo publicado · versión {receipt.result.version}.
            </AdminNotice>
          ) : (
            <AdminNotice tone="info">
              La nueva versión fue publicada, pero falta confirmar el cierre de
              la operación. Usa Recuperar publicación.
            </AdminNotice>
          ))}
      </div>
    </AdminDialog>
  );
}

export function AdminCatalogV3() {
  const [publishing, setPublishing] = useState(false);
  const store = useCatalogStore();
  return (
    <section className="admin-catalog">
      <header className="admin-catalog__header">
        <div>
          <CatalogStatus />
        </div>
        <button
          type="button"
          className="button"
          onClick={() => setPublishing(true)}
        >
          {store.publication.operationId ? (
            <RotateCcw size={16} aria-hidden="true" />
          ) : (
            <ClipboardCheck size={16} aria-hidden="true" />
          )}
          {store.publication.operationId
            ? "Recuperar publicación"
            : "Revisar publicación"}
        </button>
      </header>
      <ProposalsSurface />
      {publishing && <PublicationDialog onClose={() => setPublishing(false)} />}
    </section>
  );
}
