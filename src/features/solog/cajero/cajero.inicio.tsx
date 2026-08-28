import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  CircleAlertIcon,
  Database,
  PackageOpen,
  Palette,
  Play,
  SearchCheck,
  Send,
} from "lucide-react";
import { navigateTo } from "../../../lib/router";
import { PaletteSwitcher } from "../../theme/PaletteSwitcher";
import type { SologOperationalBootstrap } from "../types";
import type { CajeroSessionController } from "./cajero.session";

const STOCK_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function getStockFreshness(confirmedAt: string, now = Date.now()) {
  const confirmedAtMs = Date.parse(confirmedAt);

  if (!Number.isFinite(confirmedAtMs)) {
    return { fresh: false, relativeTime: null };
  }

  const elapsedMs = Math.max(0, now - confirmedAtMs);
  if (elapsedMs > STOCK_STALE_AFTER_MS) {
    return { fresh: false, relativeTime: null };
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) {
    return { fresh: true, relativeTime: `hace ${elapsedMinutes} min` };
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;

  return {
    fresh: true,
    relativeTime:
      minutes > 0 ? `hace ${hours} h ${minutes} min` : `hace ${hours} h`,
  };
}

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
      <div className="cajero-home-metric__value">
        <strong>{session.pendingCount}</strong>
        <small>{pluralize(session.pendingCount, "conteo", "conteos")}</small>
      </div>
      {session.pendingCount > 0 ? (
        <button
          className="button button--secondary cajero-home-metric__send"
          disabled={session.sending}
          onClick={() => void session.sendPending()}
          type="button"
        >
          <Send aria-hidden="true" size={18} />
          {session.sending ? "Enviando…" : "Enviar conteo"}
        </button>
      ) : null}
    </article>
  );
}

export function CajeroInicio({
  bootstrap,
  session,
}: {
  bootstrap: SologOperationalBootstrap;
  session: CajeroSessionController;
}) {
  const stockAvailable = bootstrap.stock.disponible;
  const stockFreshness = stockAvailable
    ? getStockFreshness(bootstrap.stock.confirmado_at)
    : null;
  const canStart =
    stockAvailable &&
    bootstrap.stock.puede_iniciar_conteo &&
    !bootstrap.sesion_activa &&
    session.pendingCount === 0;
  const fortnightComplete = session.fortnightComplete;
  const operationalRoute = !fortnightComplete
    ? "/cajero/conteo"
    : session.dailyPending > 0
      ? "/cajero/diario"
      : session.reviewPending > 0
        ? "/cajero/revisar"
        : null;
  const coverage = bootstrap.cobertura_quincenal;
  const coveragePercentage = Math.max(0, Math.min(100, coverage.porcentaje));

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
          className={`cajero-stock-card${stockFreshness?.fresh ? "" : " cajero-stock-card--stale"}`}
          aria-labelledby="cajero-stock-title"
        >
          <div className="cajero-stock-card__status">
            <span className="cajero-stock-card__icon" aria-hidden="true">
              {stockFreshness?.fresh ? (
                <CheckCircle2 size={23} />
              ) : (
                <Database size={23} />
              )}
            </span>
            <div>
              <h2 id="cajero-stock-title">
                {stockFreshness?.fresh
                  ? "Stock actualizado"
                  : "Stock desactualizado"}
              </h2>
              <p>
                {stockFreshness?.fresh
                  ? stockFreshness.relativeTime
                  : "Vuelve a cargar un Excel para continuar conteo."}
              </p>
            </div>
          </div>

          {operationalRoute ? (
            bootstrap.sesion_activa ? (
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
        </section>
      )}

      {fortnightComplete ? (
        <>
          <div className="cajero-fortnight-complete" role="status">
            <ClipboardCheck aria-hidden="true" size={24} />
            <strong>Conteo quincenal completado</strong>
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
              aria-label={`Abrir Revisar, ${session.reviewPending} ${pluralize(session.reviewPending, "caso", "casos")}`}
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/revisar")}
              type="button"
            >
              <SearchCheck aria-hidden="true" size={23} />
              <span>Revisar</span>
              <div className="cajero-home-metric__value">
                <strong>{session.reviewPending}</strong>
                <small>
                  {pluralize(session.reviewPending, "caso", "casos")}
                </small>
              </div>
            </button>
            <PendingSendCard session={session} />
          </div>
        </>
      ) : (
        <>
          <section
            className="cajero-coverage-card"
            aria-labelledby="cajero-coverage-title"
          >
            <div className="cajero-coverage-card__copy">
              <span>Cobertura quincenal</span>
              <h2 id="cajero-coverage-title">
                {coverage.grupos_contados} / {coverage.grupos_totales}
              </h2>
              <p>
                {coverage.pendientes}{" "}
                {pluralize(
                  coverage.pendientes,
                  "grupo pendiente",
                  "grupos pendientes",
                )}
              </p>
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
          </section>

          <div className="cajero-home-metrics" aria-label="Resumen operativo">
            <button
              aria-label={`Abrir Conteo, ${coverage.pendientes} ${pluralize(coverage.pendientes, "grupo pendiente", "grupos pendientes")}`}
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/conteo")}
              type="button"
            >
              <CalendarCheck2 aria-hidden="true" size={23} />
              <span>Pendientes</span>
              <div className="cajero-home-metric__value">
                <strong>{coverage.pendientes}</strong>
                <small>
                  {pluralize(
                    coverage.pendientes,
                    "grupo pendiente",
                    "grupos pendientes",
                  )}
                </small>
              </div>
            </button>
            <button
              aria-label={`Abrir Stock 0, ${bootstrap.conteo_principal.stock_cero_pendientes} ${pluralize(bootstrap.conteo_principal.stock_cero_pendientes, "grupo pendiente", "grupos pendientes")}`}
              className="cajero-home-metric cajero-home-metric--action"
              onClick={() => navigateTo("/cajero/conteo")}
              type="button"
            >
              <PackageOpen aria-hidden="true" size={23} />
              <span>Stock 0</span>
              <div className="cajero-home-metric__value">
                <strong>
                  {bootstrap.conteo_principal.stock_cero_pendientes}
                </strong>
                <small>
                  {pluralize(
                    bootstrap.conteo_principal.stock_cero_pendientes,
                    "grupo pendiente",
                    "grupos pendientes",
                  )}
                </small>
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
