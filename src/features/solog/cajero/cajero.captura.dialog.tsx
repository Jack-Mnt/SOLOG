import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowLeft, ChevronDown, ChevronUp, X } from "lucide-react";
import { getSologErrorMessageFromUnknown } from "../errors";
import type { CajeroSessionController } from "./cajero.session";
import { CajeroCalculator } from "./cajero.calculadora";
import {
  getCajeroBufferRevision,
  readCajeroRecountDrafts,
  saveCajeroRecountDraft,
  readCajeroBuffer,
  readCajeroExpressionDrafts,
  saveCajeroLocalCapture,
  setCajeroExpressionDraft,
  subscribeCajeroBufferChanges,
} from "./cajero.storage";
import type {
  CajeroBufferScope,
  CajeroCountGroup,
  CajeroCountView,
} from "./cajero.types";
import {
  evaluateCajeroExpression,
  calculateCajeroValuationPreview,
  calculateDifference,
  formatCajeroDifference,
  formatCajeroCurrency,
  getCajeroCapturedCount,
  getCajeroDifferenceClass,
} from "./cajero.utils";

export type CajeroCaptureView = Extract<
  CajeroCountView,
  "categoria" | "stock_cero" | "stock_negativo" | "conteo_diario" | "revisar"
>;

function CaptureGroupHeading({
  group,
  review,
}: {
  group: CajeroCountGroup;
  review: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const productsId = useId();
  const products = group.productos ?? [];
  return (
    <>
      <div className="cajero-capture-group-heading">
        <h3>
          {group.nombre}
          {review ? (
            <small>
              Última diferencia:{" "}
              <span
                className={getCajeroDifferenceClass(
                  group.ultima_diferencia ?? null,
                )}
              >
                {formatCajeroDifference(group.ultima_diferencia ?? null)}
              </span>
            </small>
          ) : null}
        </h3>
        {products.length > 1 ? (
          <button
            type="button"
            className="cajero-capture-modal__icon-button"
            aria-label="Productos incluidos"
            aria-expanded={expanded}
            aria-controls={productsId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronUp aria-hidden="true" size={22} />
            ) : (
              <ChevronDown aria-hidden="true" size={22} />
            )}
          </button>
        ) : null}
      </div>
      {products.length > 1 && expanded ? (
        <section
          className="cajero-capture-products"
          id={productsId}
          aria-label="Productos incluidos"
        >
          <strong>Productos incluidos</strong>
          <ul>
            {products.map((product) => (
              <li key={product.c_interno}>
                <small>
                  {product.producto} - #{product.c_interno}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function CajeroCaptureModal({
  categoryName,
  session,
  groups,
  scope,
  view,
  disabled,
  initialGroupId,
  lockedGroupIds,
  onClose,
  onNextCategory,
  onObservationSaved,
}: {
  categoryName: string;
  session: CajeroSessionController;
  groups: readonly CajeroCountGroup[];
  scope: CajeroBufferScope;
  view: CajeroCaptureView;
  disabled: boolean;
  initialGroupId?: string;
  lockedGroupIds?: ReadonlySet<string>;
  onClose: () => void;
  onNextCategory?: () => void;
  onObservationSaved: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() =>
    initialGroupId && groups.some((group) => group.grupo_id === initialGroupId)
      ? initialGroupId
      : null,
  );
  useSyncExternalStore(
    subscribeCajeroBufferChanges,
    getCajeroBufferRevision,
    () => 0,
  );

  const review = view === "revisar";
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const buffer = readCajeroBuffer(scope);
  const drafts = readCajeroExpressionDrafts(scope);
  const recountDrafts = readCajeroRecountDrafts(scope);
  const pendingByGroup = useMemo(
    () => new Map(buffer.items.map((item) => [item.grupo_id, item])),
    [buffer.items],
  );
  const expressionByGroup = useMemo(
    () => new Map(drafts.items.map((item) => [item.grupo_id, item.expresion])),
    [drafts.items],
  );
  const recountByDetail = useMemo(
    () => new Map(recountDrafts.items.map((item) => [item.detalle_id, item])),
    [recountDrafts.items],
  );
  const registeredCount = review
    ? groups.filter(
        (group) =>
          group.detalle_origen_id &&
          recountByDetail.has(group.detalle_origen_id),
      ).length
    : getCajeroCapturedCount(groups, new Set(pendingByGroup.keys()));
  const percentage =
    groups.length > 0 ? Math.round((registeredCount / groups.length) * 100) : 0;
  const activeIndex = groups.findIndex(
    (group) => group.grupo_id === activeGroupId,
  );
  const activeGroup = activeIndex >= 0 ? groups[activeIndex] : null;
  const activePending = activeGroup
    ? (pendingByGroup.get(activeGroup.grupo_id) ?? null)
    : null;
  const detailId = review ? (activeGroup?.detalle_origen_id ?? null) : null;
  const draftId = review
    ? "recount:" + detailId
    : (activeGroup?.grupo_id ?? "");
  const recountDraft = detailId
    ? (recountByDetail.get(detailId) ?? null)
    : null;
  const activeExpression = activeGroup
    ? expressionByGroup.has(draftId)
      ? (expressionByGroup.get(draftId) ?? "")
      : recountDraft
        ? String(recountDraft.stock_fisico)
        : activePending
          ? String(activePending.stock_fisico)
          : ""
    : "";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const modal = modalRef.current;
    const initialFocus = modal?.querySelector<HTMLElement>("button");
    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !modal) return;
      const focusable = [
        ...modal.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const saveActiveGroup = async (stockFisico: number): Promise<boolean> => {
    if (
      !activeGroup ||
      disabled ||
      saveLock.current ||
      lockedGroupIds?.has(activeGroup.grupo_id)
    )
      return false;
    saveLock.current = true;
    setSaving(true);
    setCaptureError(null);
    try {
      if (review) {
        if (!detailId) return false;
        saveCajeroRecountDraft(
          scope,
          {
            detalle_id: detailId,
            grupo_id: activeGroup.grupo_id,
            stock_fisico: stockFisico,
            contado_at: session.captureTimestamp(),
          },
          activeExpression,
        );
        onObservationSaved();
      } else {
        saveCajeroLocalCapture(
          scope,
          {
            grupo_id: activeGroup.grupo_id,
            stock_fisico: stockFisico,
            contado_at: session.captureTimestamp(),
            display: {
              vista: view,
              categoria_id: activeGroup.categoria_id,
              grupo: activeGroup.nombre,
              categoria: activeGroup.categoria,
              stock_teorico:
                activePending?.display.stock_teorico ??
                activeGroup.stock_teorico,
              precio: activeGroup.precio,
            },
          },
          activeExpression,
        );
        onObservationSaved();
      }
      return true;
    } catch (saveError) {
      setCaptureError(getSologErrorMessageFromUnknown(saveError));
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const navigateNext = () => {
    if (activeIndex < groups.length - 1) {
      setActiveGroupId(groups[activeIndex + 1]?.grupo_id ?? null);
      return;
    }
    if (!review && onNextCategory) {
      setActiveGroupId(null);
      onNextCategory();
    }
  };

  const expressionEvaluation = evaluateCajeroExpression(activeExpression);
  const hasExpression = activeExpression.trim().length > 0;
  const needsCapture =
    hasExpression &&
    (!review ||
      !recountDraft ||
      expressionEvaluation.status !== "valid" ||
      expressionEvaluation.value !== recountDraft.stock_fisico);
  const canNavigateNext =
    activeIndex < groups.length - 1 || (!review && Boolean(onNextCategory));
  const continueDisabled =
    saving ||
    (needsCapture
      ? disabled || expressionEvaluation.status !== "valid"
      : !canNavigateNext);

  const continueToNext = async () => {
    if (continueDisabled) return;
    if (!needsCapture) {
      navigateNext();
      return;
    }
    if (
      expressionEvaluation.status === "valid" &&
      expressionEvaluation.value !== null &&
      (await saveActiveGroup(expressionEvaluation.value))
    ) {
      if (canNavigateNext) navigateNext();
      else if (!review) setActiveGroupId(null);
    }
  };

  const theoretical =
    activePending?.display.stock_teorico ?? activeGroup?.stock_teorico ?? null;
  const physical =
    expressionEvaluation.status === "valid"
      ? expressionEvaluation.value
      : (recountDraft?.stock_fisico ?? activePending?.stock_fisico ?? null);
  const savedDifference =
    physical !== null && theoretical !== null
      ? calculateDifference(physical, theoretical)
      : null;
  const savedValuation =
    activeGroup && savedDifference !== null
      ? calculateCajeroValuationPreview(
          savedDifference,
          activeGroup.precio,
          activeGroup.unidades_por_paquete,
          activeGroup.precio_paquete,
        )
      : null;
  const activeLocked = activeGroup
    ? disabled || saving || lockedGroupIds?.has(activeGroup.grupo_id) === true
    : disabled;

  return (
    <div
      className="cajero-capture-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="cajero-capture-modal"
        ref={modalRef}
        role="dialog"
      >
        <header className="cajero-capture-modal__header">
          <button
            aria-label={
              activeGroup ? "Regresar a la lista" : "Cerrar categoría"
            }
            className="cajero-capture-modal__icon-button"
            onClick={() =>
              activeGroup
                ? review
                  ? onClose()
                  : setActiveGroupId(null)
                : onClose()
            }
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={22} />
          </button>
          <h2 id={titleId}>{categoryName}</h2>
          <strong>
            {registeredCount} / {groups.length}
          </strong>
          <button
            aria-label="Cerrar"
            className="cajero-capture-modal__icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={22} />
          </button>
        </header>
        <div
          className="cajero-capture-modal__progress"
          aria-label={`${percentage}% registrado`}
        >
          <span aria-hidden="true">
            <span style={{ width: `${percentage}%` }} />
          </span>
          <strong>{percentage}%</strong>
        </div>

        <div
          className={`cajero-capture-modal__body${activeGroup ? " cajero-capture-modal__body--detail" : ""}`}
        >
          {activeGroup ? (
            <div className="cajero-capture-detail">
              <div className="cajero-capture-detail__information">
                <section
                  className={`cajero-capture-detail__card${review ? " cajero-capture-detail__card--review" : ""}`}
                >
                  <CaptureGroupHeading
                    key={activeGroup.grupo_id}
                    group={activeGroup}
                    review={review}
                  />
                  <dl>
                    <div>
                      <dt>Stock TumiSoft</dt>
                      <dd>{theoretical ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Conteo</dt>
                      <dd>{physical ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{review ? "Diferencia actual" : "Diferencia"}</dt>
                      <dd className={getCajeroDifferenceClass(savedDifference)}>
                        {formatCajeroDifference(savedDifference)}
                      </dd>
                    </div>
                    <div>
                      <dt>Valorizado</dt>
                      <dd className={getCajeroDifferenceClass(savedDifference)}>
                        {savedValuation === null
                          ? "—"
                          : savedValuation > 0
                            ? `+${formatCajeroCurrency(savedValuation)}`
                            : formatCajeroCurrency(savedValuation)}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
              {captureError ? (
                <div className="cajero-alert cajero-alert--error" role="alert">
                  <p>{captureError}</p>
                </div>
              ) : null}
              <CajeroCalculator
                disabled={activeLocked}
                expression={activeExpression}
                onChange={(expression) => {
                  setCajeroExpressionDraft(scope, draftId, expression);
                }}
              />
              <nav
                className="cajero-capture-detail__navigation"
                aria-label="Navegación entre grupos"
              >
                <button
                  className="button button--secondary"
                  disabled={saving || activeIndex <= 0}
                  onClick={() =>
                    setActiveGroupId(groups[activeIndex - 1]?.grupo_id ?? null)
                  }
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="button button--secondary"
                  onClick={() => (review ? onClose() : setActiveGroupId(null))}
                  type="button"
                >
                  Regresar
                </button>
                <button
                  className="button"
                  disabled={continueDisabled}
                  onClick={() => void continueToNext()}
                  type="button"
                >
                  {needsCapture ? "Continuar" : "Siguiente"}
                </button>
              </nav>
            </div>
          ) : (
            <div className="cajero-capture-summary">
              <div className="cajero-capture-summary__head" aria-hidden="true">
                <span>Nombre</span>
                <span>Stock TumiSoft</span>
                <span>Diferencia</span>
                <span />
              </div>
              <div className="cajero-capture-summary__rows">
                {groups.map((group) => {
                  const pending = pendingByGroup.get(group.grupo_id);
                  const difference = pending
                    ? calculateDifference(
                        pending.stock_fisico,
                        pending.display.stock_teorico,
                      )
                    : null;
                  return (
                    <button
                      className={pending ? "is-counted" : undefined}
                      key={group.grupo_id}
                      onClick={() => setActiveGroupId(group.grupo_id)}
                      type="button"
                    >
                      <strong>{group.nombre}</strong>
                      <span>{group.stock_teorico}</span>
                      <span className={getCajeroDifferenceClass(difference)}>
                        {formatCajeroDifference(difference)}
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
