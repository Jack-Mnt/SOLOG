import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  CircleAlertIcon,
  Database,
  PackageOpen,
  MinusCircle,
  Palette,
  Play,
  SearchCheck,
  Send,
} from "lucide-react";
import { navigateTo } from "../../../lib/router";
import { PaletteSwitcher } from "../../theme/palette-switcher";

import type { CashierBootstrap } from "./cajero.v2";
import { deriveCajeroProgress } from "./cajero.progress";
import { readCajeroBuffer } from "./cajero.storage";
import type { CajeroSessionController } from "./cajero.session";
import {
  formatCajeroElapsed,
  getCashierStockPresentation,
  useCajeroServerClock,
} from "./cajero.stock";

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function PendingSendCard({ session }: { session: CajeroSessionController }) {
  return (
    <article
      className={`cajero-home-metric${session.pendingCount > 0 ? " cajero-home-metric--pending" : ""}`}
    >
      <CircleAlertIcon aria-hidden="true" size={23} />
      <span>Pendientes de envío</span>
      <div className="cajero-home-metric__send-row">
        <div className="cajero-home-metric__value">
          <strong>{session.pendingCount}</strong>
          <small>{pluralize(session.pendingCount, "conteo", "conteos")}</small>
        </div>
        <button
          className="button button--secondary"
          disabled={
            session.sending ||
            (session.pendingCount === 0 &&
              !["save_batch", "recount_save_batch"].includes(
                session.pendingAction ?? "",
              )) ||
            Boolean(
              session.pendingAction &&
              !["save_batch", "recount_save_batch"].includes(
                session.pendingAction,
              ),
            )
          }
          onClick={() => void session.flushPendingDrafts()}
          type="button"
        >
          <Send aria-hidden="true" size={18} />
          {session.sending ? "Enviando…" : "Enviar conteo"}
        </button>
      </div>
    </article>
  );
}

export function CajeroInicio({
  bootstrap,
  session,
}: {
  bootstrap: CashierBootstrap;
  session: CajeroSessionController;
}) {
  const now = useCajeroServerClock(session.serverOffsetMs);
  const stockAvailable =
    bootstrap.panel_state.basis.snapshot_referencia_id !== null;
  const stockPresentation = getCashierStockPresentation(bootstrap, now);
  const canStart =
    bootstrap.start_capability.allowed &&
    !bootstrap.panel_state.session &&
    session.pendingCount === 0;
  const startRestriction = bootstrap.start_capability.reason;
  const periodComplete = session.periodComplete;
  const operationalRoute = !periodComplete
    ? "/cajero/conteo"
    : session.dailyPending > 0
      ? "/cajero/diario"
      : session.reviewPending > 0
        ? "/cajero/revisar"
        : null;
  const coverage = bootstrap.panel_state.kpis;
  const progress = deriveCajeroProgress(bootstrap.panel_state,
    session.activeScope ? readCajeroBuffer(session.activeScope).items : []);
  const coveragePercentage = progress.coveragePercent;

  const begin = async () => {
    if (operationalRoute && (await session.startSession()))
      navigateTo(operationalRoute);
  };

  return (
    <section
      className="cajero-module cajero-home"
      aria-labelledby="cajero-inicio-title"
    >
      <div className="cajero-home__heading">
        <h1 id="cajero-inicio-title">Inicio</h1>
      </div>

      {!stockAvailable ? (
        <div className="cajero-empty-state" role="status">
          <Database aria-hidden="true" size={28} />
          <div>
            <strong>No hay un inventario disponible.</strong>
            <p>
              Carga un nuevo inventario desde ConeXion para comenzar un conteo.
            </p>
          </div>
        </div>
      ) : (
        <section
          className={`cajero-stock-card cajero-stock-card--${stockPresentation.state}`}
          aria-labelledby="cajero-stock-title"
        >
          <div className="cajero-stock-card__status">
            <span className="cajero-stock-card__icon" aria-hidden="true">
              {stockPresentation.state === "updated" ? (
                <CheckCircle2 size={23} />
              ) : (
                <Database size={23} />
              )}
            </span>
            <div>
              <h2 id="cajero-stock-title">{stockPresentation.label}</h2>
              <p>
                {startRestriction === "SOLOG_STOCK_EXPIRED"
                  ? "Actualiza el inventario desde ConeXion para comenzar un nuevo conteo."
                  : startRestriction === "SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY" &&
                      !bootstrap.panel_state.session
                    ? "El stock está próximo a vencer. Actualiza el inventario antes de iniciar un nuevo conteo."
                    : formatCajeroElapsed(stockPresentation.elapsedMs)}
              </p>
            </div>
          </div>

          <div className="cajero-stock-card__actions">
            {operationalRoute ? (
              bootstrap.panel_state.session ? (
                <button
                  className="button"
                  onClick={() => navigateTo(operationalRoute)}
                  type="button"
                >
                  <Play aria-hidden="true" size={19} /> Continuar conteo
                </button>
              ) : (
                <button
                  className="button"
                  disabled={!canStart || session.starting}
                  onClick={() => void begin()}
                  type="button"
                >
                  <Play aria-hidden="true" size={19} />
                  {session.starting ? "Iniciando…" : "Iniciar conteo"}
                </button>
              )
            ) : null}
            {bootstrap.panel_state.session ? (
              <button
                className="button button--secondary"
                disabled={session.sending}
                onClick={() => void session.finishSession()}
                type="button"
              >
                Finalizar conteo
              </button>
            ) : null}
          </div>
        </section>
      )}

      {periodComplete ? (
        <>
          <div className="cajero-period-complete" role="status">
            <ClipboardCheck aria-hidden="true" size={24} />
            <strong>Conteo del período completado</strong>
          </div>

          <div
            className="cajero-home-metrics cajero-home-metrics--complete"
            aria-label="Trabajo operativo vigente"
          >
            <button
              aria-label={`Abrir Conteo diario, ${session.dailyPending} ${pluralize(session.dailyPending, "pendiente", "pendientes")}`}
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/diario")}
              type="button"
            >
              <CalendarCheck2 aria-hidden="true" size={23} />
              <span>Conteo diario</span>
              <div className="cajero-home-metric__value">
                <strong>{session.dailyPending}</strong>
                <small>
                  {pluralize(session.dailyPending, "pendiente", "pendientes")}
                </small>
              </div>
            </button>
            <button
              aria-label={`Abrir Revisar, ${session.recountPendingCount} de ${session.reviewPending} casos`}
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/revisar")}
              type="button"
            >
              <SearchCheck aria-hidden="true" size={23} />
              <span>Revisar</span>
              <div className="cajero-home-metric__value">
                <strong>
                  {session.recountPendingCount}/{session.reviewPending}
                </strong>
                <small>casos</small>
              </div>
            </button>
            <PendingSendCard session={session} />
          </div>
        </>
      ) : (
        <>
          <button
            className="cajero-coverage-card"
            aria-label="Cobertura de la quincena"
            type="button"
            onClick={() => navigateTo("/cajero/conteo")}
          >
            <div className="cajero-coverage-card__copy">
              <span>Cobertura de la quincena</span>
              <h2 id="cajero-coverage-title">
                {progress.coverageCount} / {coverage.groups_total}
              </h2>
            </div>
            <div
              className="cajero-progress-ring"
              role="img"
              aria-label={`${coveragePercentage}% completado`}
            >
              <svg aria-hidden="true" viewBox="0 0 120 120">
                <circle
                  className="cajero-progress-ring__track"
                  cx="60"
                  cy="60"
                  r="52"
                  pathLength="100"
                />
                <circle
                  className="cajero-progress-ring__value"
                  cx="60"
                  cy="60"
                  r="52"
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset={100 - coveragePercentage}
                />
              </svg>
              <strong>{coveragePercentage}%</strong>
            </div>
          </button>

          <div className="cajero-home-metrics cajero-home-metrics--incomplete" aria-label="Resumen operativo">
            <button
              aria-label="Abrir Stock 0"
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/conteo?stock=zero")}
              type="button"
            >
              <PackageOpen aria-hidden="true" size={23} />
              <span>Stock 0</span>
              <div className="cajero-home-metric__value">
                <strong>{progress.select("zero").completed}/{progress.select("zero").total}</strong>
                <small>grupos</small>
              </div>
            </button>
            <button
              aria-label="Abrir Stock negativo"
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/conteo?stock=negative")}
              type="button"
            >
              <MinusCircle aria-hidden="true" size={23} />
              <span>Stock negativo</span>
              <div className="cajero-home-metric__value">
                <strong>{progress.select("negative").completed}/{progress.select("negative").total}</strong>
                <small>grupos</small>
              </div>
            </button>
            <PendingSendCard session={session} />
          </div>
        </>
      )}

      <section
        className="cajero-home-appearance"
        aria-labelledby="cajero-appearance-title"
      >
        <div>
          <Palette aria-hidden="true" size={20} />
          <h2 id="cajero-appearance-title">Apariencia</h2>
        </div>
        <PaletteSwitcher variant="home" />
      </section>
    </section>
  );
}
