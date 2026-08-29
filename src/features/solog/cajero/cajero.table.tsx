import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  getCajeroBufferRevision,
  readCajeroBuffer,
  removeCajeroObservation,
  subscribeCajeroBufferChanges,
  upsertCajeroObservation,
} from "./cajero.storage";
import type {
  CajeroBufferScope,
  CajeroCountGroup,
  CajeroCountView,
} from "./cajero.types";
import {
  calculateDifference,
  calculateValuation,
  formatCajeroCurrency,
  getFollowupGroupLabel,
  isCajeroRecountGroup,
  isValidPhysicalCount,
} from "./cajero.utils";

export function CajeroCountTable({
  groups,
  scope,
  view,
  disabled,
  onBufferChange,
}: {
  groups: CajeroCountGroup[];
  scope: CajeroBufferScope;
  view: CajeroCountView;
  disabled: boolean;
  onBufferChange: (pendingCount: number) => void;
}) {
  const review = view === "revisar";
  useSyncExternalStore(
    subscribeCajeroBufferChanges,
    getCajeroBufferRevision,
    () => 0,
  );
  const buffer = readCajeroBuffer(scope);
  const pendingByGroup = useMemo(
    () => new Map(buffer.items.map((item) => [item.grupo_id, item])),
    [buffer.items],
  );
  const restored = useMemo(
    () =>
      new Map(
        readCajeroBuffer(scope).items.map((item) => [
          item.grupo_id,
          String(item.stock_fisico),
        ]),
      ),
    [scope],
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(restored),
  );
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const updateCount = (group: CajeroCountGroup, rawValue: string) => {
    if (!/^\d*$/.test(rawValue)) return;
    const recount = review && isCajeroRecountGroup(group);
    if (recount && !group.detalle_origen_id) return;
    setDrafts((current) => ({ ...current, [group.grupo_id]: rawValue }));

    if (rawValue === "") {
      removeCajeroObservation(scope, group.grupo_id);
      onBufferChange(readCajeroBuffer(scope).items.length);
      return;
    }

    const stockFisico = Number(rawValue);
    if (!isValidPhysicalCount(stockFisico)) return;
    upsertCajeroObservation(scope, {
      grupo_id: group.grupo_id,
      stock_fisico: stockFisico,
      contado_at: new Date().toISOString(),
      tipo_observacion: review
        ? recount
          ? "reconteo"
          : "seguimiento"
        : "auto",
      observacion_origen_id: recount ? (group.detalle_origen_id ?? null) : null,
      display: {
        vista: view,
        categoria_id: group.categoria_id,
        grupo: group.nombre,
        categoria: group.categoria,
        stock_teorico: group.stock_teorico,
        precio: group.precio,
        ultima_diferencia: group.ultima_diferencia ?? null,
        motivo_seguimiento: group.motivo_seguimiento ?? null,
      },
    });
    onBufferChange(readCajeroBuffer(scope).items.length);
  };

  if (groups.length === 0) {
    return (
      <div className="cajero-empty-state" role="status">
        <CheckCircle2 aria-hidden="true" size={28} />
        <div>
          <strong>No hay grupos pendientes en esta vista.</strong>
          <p>El backend no devolvió trabajo aplicable para esta sesión.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        review
          ? "cajero-count-table-wrap cajero-count-table-wrap--review"
          : "cajero-count-table-wrap cajero-count-table-wrap--entry"
      }
    >
      <table className="cajero-count-table">
        <thead>
          <tr>
            {review ? <th>Motivo</th> : null}
            <th>Nombre</th>
            {review ? <th>Última diferencia</th> : null}
            <th>Stock TumiSoft</th>
            <th>Conteo</th>
            <th>{review ? "Diferencia actual" : "Diferencia"}</th>
            <th>Valorizado</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const lastDifference = group.ultima_diferencia ?? null;
            const rawValue = drafts[group.grupo_id] ?? "";
            const stockFisico = rawValue === "" ? null : Number(rawValue);
            const valid =
              stockFisico !== null && isValidPhysicalCount(stockFisico);
            const difference = valid
              ? calculateDifference(stockFisico, group.stock_teorico)
              : null;
            const valuation =
              difference === null
                ? null
                : calculateValuation(difference, group.precio);
            const pending = pendingByGroup.get(group.grupo_id);
            const recountMissingOrigin =
              review && isCajeroRecountGroup(group) && !group.detalle_origen_id;
            const status = pending?.error ? (
              <span className="cajero-row-status cajero-row-status--error">
                <AlertCircle aria-hidden="true" size={16} /> Revisar conteo
              </span>
            ) : recountMissingOrigin ? (
              <span className="cajero-row-status cajero-row-status--error">
                <AlertCircle aria-hidden="true" size={16} /> Origen no
                disponible
              </span>
            ) : valid ? (
              <span className="cajero-row-status">
                <CheckCircle2 aria-hidden="true" size={16} /> Guardado local
              </span>
            ) : (
              <span className="cajero-row-status cajero-row-status--empty">
                Pendiente
              </span>
            );

            return (
              <tr key={group.grupo_id}>
                {review ? (
                  <td data-label="Motivo">
                    <span className="cajero-review-reason">
                      {getFollowupGroupLabel(group)}
                    </span>
                  </td>
                ) : null}
                <td data-label="Nombre">
                  <strong>{group.nombre}</strong>
                </td>
                {review ? (
                  <td
                    className={
                      lastDifference === 0
                        ? "is-zero"
                        : lastDifference === null
                          ? undefined
                          : lastDifference < 0
                            ? "is-negative"
                            : "is-positive"
                    }
                    data-label="Última diferencia"
                  >
                    {lastDifference === null
                      ? "—"
                      : lastDifference > 0
                        ? `+${lastDifference}`
                        : lastDifference}
                  </td>
                ) : null}
                <td data-label="Stock TumiSoft">{group.stock_teorico}</td>
                <td data-label="Conteo">
                  <input
                    aria-describedby={
                      review ? `cajero-status-${group.grupo_id}` : undefined
                    }
                    aria-invalid={
                      pending?.error || recountMissingOrigin ? true : undefined
                    }
                    autoComplete="off"
                    disabled={disabled || recountMissingOrigin}
                    id={`cajero-count-${group.grupo_id}`}
                    inputMode="numeric"
                    min="0"
                    onChange={(event) => updateCount(group, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || !valid) return;
                      event.preventDefault();
                      inputRefs.current[index + 1]?.focus();
                    }}
                    pattern="[0-9]*"
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    step="1"
                    type="text"
                    value={rawValue}
                  />
                  {review ? (
                    <span id={`cajero-status-${group.grupo_id}`}>{status}</span>
                  ) : null}
                </td>
                <td
                  data-label={review ? "Diferencia actual" : "Diferencia"}
                  className={
                    difference === 0
                      ? "is-zero"
                      : difference === null
                        ? undefined
                        : difference < 0
                          ? "is-negative"
                          : "is-positive"
                  }
                >
                  {difference === null
                    ? "—"
                    : difference > 0
                      ? `+${difference}`
                      : difference}
                </td>
                <td
                  className={
                    difference === 0
                      ? "is-zero"
                      : difference === null
                        ? undefined
                        : difference < 0
                          ? "is-negative"
                          : "is-positive"
                  }
                  data-label="Valorizado"
                >
                  {valuation === null
                    ? "—"
                    : valuation > 0
                      ? "+" + formatCajeroCurrency(valuation)
                      : formatCajeroCurrency(valuation)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
