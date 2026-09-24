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
  type CatalogMutations,
  type CatalogProposal,
  type CatalogProposalStatus,
  type CatalogReads,
} from "./admin.catalogo.v4";
import { adminTimestamp } from "../admin.v2.format";
import { QueryState, Value } from "../admin.v2.presentation";
import {
  AdminBinarySwitch,
  AdminNotice,
  AdminPagination,
  IconButton,
} from "../admin.primitives";
import { paginateAdminRows } from "../admin.pagination";

type ProposalAction =
  | "approve"
  | "ignore"
  | "reactivate"
  | "withdraw"
  | "discard";
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
const proposalStatusTones: Record<
  CatalogProposalStatus,
  "warning" | "success" | "info"
> = {
  pendiente: "warning",
  aprobado: "success",
  ignorado: "info",
  incorporado: "success",
};
const resolutionSwitchOptions = [
  { value: "update_group_price", label: "Actualizar grupo" },
  { value: "separate_sku", label: "Separar producto" },
] as const;

type PackageAction =
  | "keep"
  | "clear"
  | "not_applicable"
  | "set"
  | "update"
  | "";
type PreparedValuation = {
  unidades_por_paquete: number;
  precio_paquete: number;
};

const blockReasonLabels: Record<string, string> = {
  propuesta_desactualizada:
    "Existe evidencia más reciente. Revisa la propuesta antes de publicar.",
  configuracion_requerida:
    "El producto requiere configuración antes de publicar.",
  producto_con_stock: "El producto no puede eliminarse mientras tenga stock.",
  producto_no_encontrado: "El producto ya no está disponible en el Catálogo.",
  producto_excluido: "El producto está excluido del Catálogo.",
  grupo_no_disponible: "El grupo actual ya no está disponible.",
  resolucion_precio_desactualizada:
    "La resolución de precio preparada quedó desactualizada. Vuelve a resolver el cambio.",
  resolucion_precio_requerida:
    "Debes resolver el cambio de precio antes de publicar.",
  decision_precio_paquete_requerida:
    "Debes definir el valorizado por paquete antes de publicar.",
  precio_paquete_invalido: "El precio por paquete preparado no es válido.",
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
  throw new Error("Tipo de propuesta Catálogo V4 no clasificable.");
}

function ProposalsSurface() {
  const store = useCatalogStore();
  const [status, setStatus] = useState<CatalogProposalStatus>("pendiente");
  const [selected, setSelected] = useState<CatalogProposal | null>(null);
  const [approval, setApproval] = useState<CatalogProposal | null>(null);
  const [error, setError] = useState("");
  const query = useCatalogQuery("proposals", { estado: status });
  const rows = query.data?.rows ?? [];
  const urgent = rows.filter(
    (proposal) => classifyProposal(proposal) === "urgent",
  );
  const emerging = rows.filter(
    (proposal) => classifyProposal(proposal) === "emerging",
  );
  const intent = store.intent();

  const approve = (proposal: CatalogProposal) => {
    setError("");
    if (
      proposal.tipo === "agregar_producto" ||
      proposal.tipo === "reincorporar_producto"
    ) {
      if (proposalSetupPrice(proposal) === null) {
        setSelected(proposal);
        return;
      }
      setApproval(proposal);
      return;
    }
    if (proposal.tipo === "precio") {
      setApproval(proposal);
      return;
    }
    void store
      .mutation(
        "proposal_action",
        {
          propuesta_fingerprint: proposal.propuesta_fingerprint,
          action: "approve",
        },
        { proposal },
      )
      .catch((reason: unknown) =>
        setError(
          catalogMutationError(
            store,
            reason,
            "No se pudo aprobar la propuesta.",
          ),
        ),
      );
  };

  const retry = () => {
    setError("");
    void store
      .retryMutation()
      .catch((reason: unknown) =>
        setError(
          catalogMutationError(
            store,
            reason,
            "No se pudo confirmar la aprobación.",
          ),
        ),
      );
  };

  const setupPrice = approval ? proposalSetupPrice(approval) : null;
  const setupTarget: ProductSetupTarget | null =
    approval &&
    (approval.tipo === "agregar_producto" ||
      approval.tipo === "reincorporar_producto") &&
    setupPrice !== null
      ? {
          propuesta_fingerprint: approval.propuesta_fingerprint,
          c_interno: approval.c_interno,
          producto:
            approval.producto ??
            approval.catalogo_actual.producto ??
            `SKU ${approval.c_interno}`,
          precio: setupPrice,
          tipo: approval.tipo,
        }
      : null;

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
      {intent && !approval && <CatalogMutationNotice onRetry={retry} />}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
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
              onApprove={approve}
              pending={!!intent}
            />
            <ProposalSection
              key={`${status}:emerging`}
              title="Emergentes"
              rows={emerging}
              section="emerging"
              onSelect={setSelected}
              onApprove={approve}
              pending={!!intent}
            />
          </div>
        )}
      </div>
      {selected && (
        <ProposalDetail proposal={selected} onClose={() => setSelected(null)} />
      )}
      {approval && setupTarget && (
        <ProductSetupDialog
          target={setupTarget}
          flow="resolve"
          onClose={() => setApproval(null)}
          onComplete={() => setApproval(null)}
        />
      )}
      {approval?.tipo === "precio" && (
        <PriceResolutionDialog
          fingerprint={approval.propuesta_fingerprint}
          flow="resolve"
          onClose={() => setApproval(null)}
          onComplete={() => setApproval(null)}
        />
      )}
    </>
  );
}
function ProposalSection({
  title,
  rows,
  section,
  onSelect,
  onApprove,
  pending,
}: {
  title: string;
  rows: CatalogProposal[];
  section: ProposalSection;
  onSelect: (proposal: CatalogProposal) => void;
  onApprove: (proposal: CatalogProposal) => void;
  pending: boolean;
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
              <th scope="col" className="admin-table-action-cell">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.rows.map((proposal) => (
              <ProposalRow
                key={proposal.propuesta_fingerprint}
                proposal={proposal}
                onSelect={onSelect}
                onApprove={onApprove}
                pending={pending}
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
  onApprove,
  pending,
}: {
  proposal: CatalogProposal;
  onSelect: (proposal: CatalogProposal) => void;
  onApprove: (proposal: CatalogProposal) => void;
  pending: boolean;
}) {
  const product = proposal.producto ?? proposal.catalogo_actual.producto ?? "—";
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
      <td className="admin-table-action-cell">
        <div className="admin-table-actions">
          {proposal.estado === "pendiente" && (
            <IconButton
              aria-label={`Aprobar ${product}`}
              title="Aprobar"
              variant="primary"
              disabled={pending}
              onClick={() => onApprove(proposal)}
            >
              <Check size={16} aria-hidden="true" />
            </IconButton>
          )}
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

function ProposalStateNotice({ proposal }: { proposal: CatalogProposal }) {
  if (proposal.stale) {
    return (
      <AdminNotice tone="warning">
        Existe evidencia más reciente. Revisa la propuesta antes de publicar.
      </AdminNotice>
    );
  }

  if (proposal.estado === "pendiente") {
    return (
      <AdminNotice tone="info">
        {proposal.origen === "automatico"
          ? "Aprueba la propuesta para incluirla en la próxima publicación, o ignórala si no requiere acción."
          : "Aprueba la propuesta para incluirla en la próxima publicación."}
      </AdminNotice>
    );
  }

  if (proposal.estado === "ignorado") {
    return (
      <AdminNotice tone="info">
        Esta evidencia está suprimida. Reactívala para volver a evaluarla.
      </AdminNotice>
    );
  }

  if (proposal.estado === "incorporado") {
    return (
      <AdminNotice tone="success">
        Esta propuesta ya fue incorporada al Catálogo.
      </AdminNotice>
    );
  }

  const blockMessage = proposalBlockMessage(proposal.block_reason);
  if (blockMessage) {
    return <AdminNotice tone="error">{blockMessage}</AdminNotice>;
  }

  return proposal.publicable ? (
    <AdminNotice tone="success">
      La propuesta está lista para publicación.
    </AdminNotice>
  ) : (
    <AdminNotice tone="info">
      La propuesta está aprobada; el estado de publicación aún no está
      disponible.
    </AdminNotice>
  );
}

function ProposalDetailChange({ proposal }: { proposal: CatalogProposal }) {
  const change = catalogProposalChange(proposal);
  return (
    <section className="admin-catalog__dialog-section admin-catalog__proposal-change-section">
      <div className="admin-catalog__proposal-change-heading">
        <h3>Cambio propuesto</h3>
        <span
          className={`admin-status-badge admin-status-badge--${proposalStatusTones[proposal.estado]}`}
        >
          {proposalStatusLabels[proposal.estado]}
        </span>
      </div>
      <div className="admin-catalog__proposal-change-card">
        {change.kind === "price" ? (
          <>
            <div className="admin-catalog__proposal-change-item">
              <span>Precio actual</span>
              <strong>
                <Value value={change.previous} money />
              </strong>
            </div>
            <span
              className="admin-catalog__proposal-change-arrow"
              aria-hidden="true"
            >
              ↓
            </span>
            <div className="admin-catalog__proposal-change-item">
              <span>Precio nuevo</span>
              <strong>
                <Value value={change.next} money />
              </strong>
            </div>
          </>
        ) : change.kind === "text" ? (
          <>
            <div className="admin-catalog__proposal-change-item">
              <span>
                {proposal.tipo === "nombre" ? "Nombre actual" : "Código actual"}
              </span>
              <strong>{change.previous ?? "—"}</strong>
            </div>
            <span
              className="admin-catalog__proposal-change-arrow"
              aria-hidden="true"
            >
              ↓
            </span>
            <div className="admin-catalog__proposal-change-item">
              <span>
                {proposal.tipo === "nombre" ? "Nombre nuevo" : "Código nuevo"}
              </span>
              <strong>{change.next ?? "—"}</strong>
            </div>
          </>
        ) : (
          <div className="admin-catalog__proposal-change-item">
            <span>Acción</span>
            <strong>{change.label}</strong>
          </div>
        )}
      </div>
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
  const [discard, setDiscard] = useState(false);
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
  const complexPending =
    proposal.estado === "pendiente" && (canSetup || proposal.tipo === "precio");

  return (
    <>
      <AdminDialog
        title={
          proposal.producto ??
          proposal.catalogo_actual.producto ??
          `Propuesta ${proposal.c_interno}`
        }
        description={`C. interno ${proposal.c_interno}`}
        onClose={onClose}
        closeDisabled={!!intent?.pending}
        format="drawer"
        drawerMaxWidth={720}
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
                {proposal.origen === "automatico" && (
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!!intent}
                    onClick={() => run("ignore")}
                  >
                    <EyeOff size={16} aria-hidden="true" />
                    Ignorar propuesta
                  </button>
                )}
                {canSetup ? (
                  <button
                    type="button"
                    className="button"
                    disabled={!!intent || !setupTarget}
                    onClick={() => setupTarget && setSetup(true)}
                  >
                    <Settings size={16} aria-hidden="true" />
                    Configurar y aprobar
                  </button>
                ) : proposal.tipo === "precio" ? (
                  <button
                    type="button"
                    className="button"
                    disabled={!!intent}
                    onClick={() => setPrice(true)}
                  >
                    <DollarSign size={16} aria-hidden="true" />
                    Resolver y aprobar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button"
                    disabled={!!intent}
                    onClick={() => run("approve")}
                  >
                    <Check size={16} aria-hidden="true" />
                    Aprobar
                  </button>
                )}
              </>
            )}
            {proposal.estado === "ignorado" &&
              proposal.origen === "automatico" && (
                <button
                  type="button"
                  className="button"
                  disabled={!!intent}
                  onClick={() => run("reactivate")}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  Reactivar
                </button>
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
                  Volver a pendiente
                </button>
                {proposal.origen === "automatico" ? (
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!!intent}
                    onClick={() => run("ignore")}
                  >
                    <EyeOff size={16} aria-hidden="true" />
                    Ignorar propuesta
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={!!intent}
                    onClick={() => setDiscard(true)}
                  >
                    <CircleOff size={16} aria-hidden="true" />
                    Descartar
                  </button>
                )}
                {canSetup && (
                  <button
                    type="button"
                    className="button"
                    disabled={!!intent || !setupTarget}
                    onClick={() => setupTarget && setSetup(true)}
                  >
                    <Settings size={16} aria-hidden="true" />
                    Actualizar configuración
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
                    Actualizar resolución de precio
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        <div className="admin-catalog__proposal-detail">
          <ProposalStateNotice proposal={proposal} />

          <ProposalDetailChange proposal={proposal} />

          <section className="admin-catalog__dialog-section">
            <h3>Evidencia</h3>
            <dl className="admin-catalog__proposal-summary">
              <div>
                <dt>Origen</dt>
                <dd>
                  {proposal.origen === "automatico"
                    ? proposal.sedes.length
                      ? proposal.sedes.map((site) => site.nombre).join(", ")
                      : "Sin sedes asociadas"
                    : "Administrativo"}
                </dd>
              </div>

              {proposal.origen === "automatico" && (
                <>
                  <div>
                    <dt>Apariciones</dt>
                    <dd>{proposal.occurrence_count}</dd>
                  </div>
                  <div className="admin-catalog__proposal-period">
                    <dt>Periodo detectado</dt>
                    <dd className="admin-catalog__proposal-period-values">
                      <time dateTime={proposal.first_seen_at}>
                        {adminTimestamp(proposal.first_seen_at)}
                      </time>
                      <span
                        className="admin-catalog__proposal-period-arrow"
                        aria-hidden="true"
                      >
                        →
                      </span>
                      <time dateTime={proposal.last_seen_at}>
                        {adminTimestamp(proposal.last_seen_at)}
                      </time>
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          {canSetup &&
            !setupTarget &&
            (proposal.estado === "aprobado" || complexPending) && (
              <AdminNotice tone="error">
                La propuesta no contiene un precio válido para configurar el
                producto.
              </AdminNotice>
            )}

          {intent && !setup && !price && !discard && (
            <CatalogMutationNotice onRetry={retry} />
          )}
          {error && <AdminNotice tone="error">{error}</AdminNotice>}
        </div>
      </AdminDialog>

      {setup && setupTarget && (
        <ProductSetupDialog
          target={setupTarget}
          flow={proposal.estado === "pendiente" ? "resolve" : "prepare"}
          onClose={() => setSetup(false)}
          onComplete={onClose}
        />
      )}

      {price && (
        <PriceResolutionDialog
          fingerprint={proposal.propuesta_fingerprint}
          flow={proposal.estado === "pendiente" ? "resolve" : "prepare"}
          onClose={() => setPrice(false)}
          onComplete={onClose}
        />
      )}

      {discard && (
        <AdminDialog
          title="Descartar propuesta"
          description="Esta acción es terminal y la propuesta dejará de aparecer en el flujo normal."
          onClose={() => setDiscard(false)}
          closeDisabled={!!intent?.pending}
          footer={
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={!!intent?.pending}
                onClick={() => setDiscard(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={!!intent}
                onClick={() => run("discard")}
              >
                <CircleOff size={16} aria-hidden="true" />
                Descartar propuesta
              </button>
            </>
          }
        >
          <AdminNotice tone="warning">
            El historial se conservará en backend, pero esta instancia no podrá
            reactivarse.
          </AdminNotice>
        </AdminDialog>
      )}
    </>
  );
}

function PriceResolutionDialog({
  fingerprint,
  flow,
  onClose,
  onComplete,
}: {
  fingerprint: string;
  flow: "resolve" | "prepare";
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
        size="wide"
      >
        <QueryState {...query} variant="compact" />
      </AdminDialog>
    );
  }

  return (
    <PriceResolutionContent
      key={`${fingerprint}:${JSON.stringify(query.data.prepared_resolution)}`}
      fingerprint={fingerprint}
      flow={flow}
      options={query.data}
      onClose={onClose}
      onComplete={onComplete}
    />
  );
}

function PriceResolutionContent({
  fingerprint,
  flow,
  options,
  onClose,
  onComplete,
}: {
  fingerprint: string;
  flow: "resolve" | "prepare";
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

  const [resolution, setResolution] = useState<PriceResolution | "">(
    initialResolution,
  );
  const [packageAction, setPackageAction] =
    useState<PackageAction>(initialPackageAction);
  const [preparedValuation, setPreparedValuation] =
    useState<PreparedValuation | null>(initialPreparedValuation);
  const [valuation, setValuation] = useState(false);
  const [error, setError] = useState("");
  const [valuationError, setValuationError] = useState("");

  const currentValuation =
    options.grupo.unidades_por_paquete && options.grupo.precio_paquete
      ? `x${options.grupo.unidades_por_paquete} · S/ ${options.grupo.precio_paquete.toFixed(2)}`
      : "Sin valorizado";
  const targetMember = options.members.find(
    (member) => member.c_interno === options.c_interno,
  );
  const canKeep = resolution !== "separate_sku";
  const groupConflict =
    resolution === "update_group_price" &&
    options.conflicting_proposals.length > 0;
  const groupResolutionCount =
    resolution === "update_group_price"
      ? options.equivalent_proposals.length + 1
      : 1;

  const selectResolution = (value: PriceResolution) => {
    setResolution(value);
    setPackageAction(
      value !== "separate_sku" && !options.package_decision_required
        ? "keep"
        : "",
    );
    setPreparedValuation(null);
    setError("");
    setValuationError("");
  };

  const currentComparable = JSON.stringify({
    resolution,
    package_action: packageAction,
    unidades_por_paquete:
      packageAction === "set" || packageAction === "update"
        ? (preparedValuation?.unidades_por_paquete ?? null)
        : null,
    precio_paquete:
      packageAction === "set" || packageAction === "update"
        ? (preparedValuation?.precio_paquete ?? null)
        : null,
  });
  const preparedComparable = prepared
    ? JSON.stringify({
        resolution: preparedResolution,
        package_action: preparedPackageAction,
        unidades_por_paquete:
          preparedPackageAction === "set" || preparedPackageAction === "update"
            ? (initialPreparedValuation?.unidades_por_paquete ?? null)
            : null,
        precio_paquete:
          preparedPackageAction === "set" || preparedPackageAction === "update"
            ? (initialPreparedValuation?.precio_paquete ?? null)
            : null,
      })
    : null;

  const valid =
    !!resolution &&
    !!packageAction &&
    !groupConflict &&
    ((packageAction !== "set" && packageAction !== "update") ||
      preparedValuation !== null);
  const hasChanges =
    preparedComparable === null || currentComparable !== preparedComparable;

  const executeResolution = (
    nextPackageAction: Exclude<PackageAction, "">,
    nextValuation: PreparedValuation | null,
    reportError: (message: string) => void,
  ) => {
    if (!resolution) {
      reportError("Selecciona una resolución de precio.");
      return;
    }
    const expectedState = flow === "resolve" ? "pendiente" : "aprobado";
    if (options.change_state !== expectedState) {
      reportError(
        flow === "resolve"
          ? "La propuesta ya no está pendiente. Actualiza la bandeja."
          : "La propuesta ya no está aprobada. Actualiza la bandeja.",
      );
      return;
    }
    if (
      resolution === "update_group_price" &&
      options.conflicting_proposals.length
    ) {
      reportError(
        "El grupo contiene propuestas de precio incompatibles. Revisa las diferencias antes de actualizar todo el grupo.",
      );
      return;
    }
    if (
      (nextPackageAction === "set" || nextPackageAction === "update") &&
      !nextValuation
    ) {
      reportError("Configura un valorizado válido antes de guardar.");
      return;
    }

    type MutationInput<T> = T extends unknown
      ? Omit<
          T,
          | "operation_id"
          | "expected_catalog_revision"
          | "expected_groups_revision"
        >
      : never;
    type PriceMutationInput = MutationInput<CatalogMutations["resolve_price"]>;

    let payload: PriceMutationInput;

    if (resolution === "separate_sku") {
      payload =
        nextPackageAction === "set"
          ? {
              propuesta_fingerprint: fingerprint,
              resolution: "separate_sku",
              package_action: "set",
              ...nextValuation!,
            }
          : {
              propuesta_fingerprint: fingerprint,
              resolution: "separate_sku",
              package_action:
                nextPackageAction === "clear" ? "clear" : "not_applicable",
            };
    } else {
      const groupedResolution: "update_group_price" | "keep_structure" =
        resolution;
      payload =
        nextPackageAction === "set"
          ? {
              propuesta_fingerprint: fingerprint,
              resolution: groupedResolution,
              package_action: "set",
              ...nextValuation!,
            }
          : nextPackageAction === "update"
            ? {
                propuesta_fingerprint: fingerprint,
                resolution: groupedResolution,
                package_action: "update",
                precio_paquete: nextValuation!.precio_paquete,
              }
            : {
                propuesta_fingerprint: fingerprint,
                resolution: groupedResolution,
                package_action:
                  nextPackageAction === "clear" ? "clear" : "keep",
              };
    }

    reportError("");
    const request =
      flow === "resolve"
        ? store.mutation("resolve_price", payload)
        : store.mutation("prepare_price", payload);
    void request
      .then(onComplete)
      .catch((reason: unknown) =>
        reportError(store.intent() ? "" : priceErrorMessage(reason)),
      );
  };

  const chooseValuation = (decision: ValuationDecision) => {
    const nextValuation = decision.enabled
      ? {
          unidades_por_paquete: decision.unitsPerPackage!,
          precio_paquete: decision.packagePrice!,
        }
      : null;
    const nextPackageAction: Exclude<PackageAction, ""> = decision.enabled
      ? "set"
      : resolution === "separate_sku"
        ? "not_applicable"
        : "clear";

    setPreparedValuation(nextValuation);
    setPackageAction(nextPackageAction);
    setError("");
    setValuationError("");
    executeResolution(nextPackageAction, nextValuation, setValuationError);
  };

  const submit = () => {
    if (!packageAction) {
      setError("Decide explícitamente el valorizado antes de guardar.");
      return;
    }
    executeResolution(packageAction, preparedValuation, setError);
  };

  const retry = () => {
    setError("");
    setValuationError("");
    void store
      .retryMutation()
      .then(onComplete)
      .catch((reason: unknown) => {
        const message = store.intent() ? "" : priceErrorMessage(reason);
        if (valuation) setValuationError(message);
        else setError(message);
      });
  };

  const valuationInitial =
    (packageAction === "set" || packageAction === "update") && preparedValuation
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
        size="wide"
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
                options.change_state !==
                  (flow === "resolve" ? "pendiente" : "aprobado") ||
                !valid ||
                (flow === "prepare" && !hasChanges)
              }
              onClick={submit}
            >
              {flow === "resolve" ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              {flow === "resolve" ? "Resolver y aprobar" : "Guardar resolución"}
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
                      <td>
                        <Value value={member.precio} money />
                      </td>
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

          {resolution === "update_group_price" &&
            options.equivalent_proposals.length > 0 &&
            !groupConflict && (
              <AdminNotice tone="info">
                Esta decisión resolverá {groupResolutionCount} propuestas de
                precio equivalentes del grupo.
              </AdminNotice>
            )}

          {groupConflict && (
            <AdminNotice tone="error">
              El grupo contiene propuestas de precio incompatibles:{" "}
              {options.conflicting_proposals
                .map(
                  (item) =>
                    `${item.producto} → S/ ${item.nuevo_precio.toFixed(2)}`,
                )
                .join(" · ")}
              . Separa el producto o resuelve primero el conflicto.
            </AdminNotice>
          )}

          {resolution && (
            <section className="admin-catalog__dialog-section admin-catalog__valuation-section">
              <h3>Valorizado</h3>
              <div className="admin-catalog__valuation-actions">
                {canKeep && (
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-pressed={packageAction === "keep"}
                    disabled={!!intent || groupConflict}
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
                  disabled={!!intent || groupConflict}
                  onClick={() => {
                    setValuationError("");
                    setValuation(true);
                  }}
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
                  {resolution === "separate_sku"
                    ? "El nuevo grupo quedará sin valorizado al publicar."
                    : "El grupo quedará sin valorizado al confirmar esta resolución."}
                </p>
              )}

              {(packageAction === "set" || packageAction === "update") &&
                preparedValuation && (
                  <p className="admin-dialog-help">
                    {resolution === "separate_sku"
                      ? `Se aplicará x${preparedValuation.unidades_por_paquete} · S/ ${preparedValuation.precio_paquete.toFixed(2)} al nuevo grupo al publicar.`
                      : `Se aplicará x${preparedValuation.unidades_por_paquete} · S/ ${preparedValuation.precio_paquete.toFixed(2)} al confirmar esta resolución.`}
                  </p>
                )}
            </section>
          )}

          <AdminNotice tone="info">
            {resolution === "separate_sku"
              ? "El precio y el nuevo grupo se aplicarán al publicar el Catálogo."
              : "El precio se aplicará al publicar; el valorizado del grupo se actualiza al confirmar esta resolución."}
          </AdminNotice>

          {intent && !valuation && <CatalogMutationNotice onRetry={retry} />}
          {error && <AdminNotice tone="error">{error}</AdminNotice>}
        </div>
      </AdminDialog>

      {valuation && (
        <ValuationDialog
          unitPrice={options.nuevo_precio}
          initial={valuationInitial}
          description={
            resolution === "separate_sku"
              ? "El valorizado se guardará para el nuevo grupo y se aplicará al publicar."
              : "El valorizado se aplicará inmediatamente al grupo al confirmar."
          }
          confirmLabel="Aplicar"
          pending={!!intent?.pending}
          error={valuationError}
          onRetry={retry}
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
  const noApprovedChanges =
    preview?.ok === false && preview.codigo === "NO_APPROVED_CATALOG_CHANGES";

  const closeDialog = () => {
    if (completed) store.acknowledgeCompletedPublication();
    onClose();
  };

  const publish = () => {
    void store.publish().catch(() => {});
  };

  const footer =
    completed || !admin ? (
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
      size="wide"
      footer={footer}
    >
      <div className="admin-dialog-task">
        {completed && receipt.result ? (
          <AdminNotice tone="success">
            Catálogo publicado · versión {receipt.result.version}.
          </AdminNotice>
        ) : !preview ? (
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
                <dd>
                  {preview.sku_actuales} → {preview.sku_resultantes}
                </dd>
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
        ) : noApprovedChanges ? (
          <AdminNotice tone="info">
            No hay cambios aprobados para publicar.
          </AdminNotice>
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

        {!completed && !admin && (
          <AdminNotice tone="info">
            Puedes revisar esta publicación, pero solo un administrador puede
            publicarla.
          </AdminNotice>
        )}

        {!completed && recoverable && !receipt.error && !receipt.result && (
          <AdminNotice tone="info">
            No se pudo confirmar el resultado de la publicación. Recuperar
            reutilizará la misma operación sin duplicar los cambios.
          </AdminNotice>
        )}

        {!completed && receipt.error && (
          <AdminNotice tone="error">
            {recoverable
              ? "No se pudo confirmar el resultado de la publicación. Usa Recuperar publicación para reutilizar la misma operación."
              : "No se pudo completar la publicación. Revisa el preview y vuelve a intentarlo."}
          </AdminNotice>
        )}

        {!completed &&
          receipt.result &&
          !receipt.result.completion_recorded && (
            <AdminNotice tone="info">
              La nueva versión fue publicada, pero falta confirmar el cierre de
              la operación. Usa Recuperar publicación.
            </AdminNotice>
          )}
      </div>
    </AdminDialog>
  );
}
export function AdminCatalogV4() {
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
