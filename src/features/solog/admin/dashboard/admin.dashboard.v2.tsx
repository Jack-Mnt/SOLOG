import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Download,
  Store,
  TriangleAlert,
  ZoomIn,
} from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import { useAdminQuery, useAdminStore } from "../admin.v2.context";
import type { Biweekly, DashboardCards, DifferenceState } from "../admin.v2";
import { QueryState, Value } from "../admin.v2.presentation";
import { AdminBinarySwitch, AdminPagination } from "../admin.primitives";
import { paginateAdminRows } from "../admin.pagination";
import { adminSiteLabel, orderedAdminSites } from "../admin.site-ui";
import { AdminExportDialog } from "../control/admin.control.v2.export-dialog";

function dashboardDate(value: string) {
  const date = new Date(`${value}T12:00:00-05:00`);
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "short",
    day: "2-digit",
  }).formatToParts(date);
  const weekday = parts
    .find((part) => part.type === "weekday")!
    .value.replace(".", "");
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${parts.find((part) => part.type === "day")!.value}`;
}

function dashboardTimestamp(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toLowerCase();
  return `${day}, ${time}`;
}

type DailyStockView = "positive" | "zero";

const dailyStateViews: Array<{ state: DifferenceState; label: string }> = [
  { state: "Coincide", label: "Coincide" },
  { state: "Recontar", label: "Por recontar" },
  { state: "Confirmada", label: "Confirmadas" },
  { state: "Inconsistente", label: "Inconsistentes" },
];

function DailyDrawer({
  site,
  date,
  close,
}: {
  site: string;
  date: string;
  close: () => void;
}) {
  const admin = useAdminStore();
  const [page, setPage] = useState(0);
  const [stockView, setStockView] = useState<DailyStockView>("positive");
  const [selectedState, setSelectedState] =
    useState<DifferenceState>("Coincide");
  const query = useAdminQuery("daily_detail", {
    site_id: site,
    origin_date: date,
  });
  const data = query.data;
  const siteName = adminSiteLabel(
    admin.bootstrap?.allowed_sites.find((item) => item.id === site)?.nombre ??
      site,
  );
  const stockItems =
    data?.items.filter((item) => item.stock_class === stockView) ?? [];
  const stateCounts: Record<DifferenceState, number> = {
    Coincide: stockItems.filter((item) => item.estado === "Coincide").length,
    Recontar: stockItems.filter((item) => item.estado === "Recontar").length,
    Confirmada: stockItems.filter((item) => item.estado === "Confirmada").length,
    Inconsistente: stockItems.filter(
      (item) => item.estado === "Inconsistente",
    ).length,
  };
  const filteredItems = stockItems.filter(
    (item) => item.estado === selectedState,
  );
  const paginated = paginateAdminRows(filteredItems, page);

  useEffect(() => {
    setPage(0);
  }, [selectedState, stockView]);

  return (
    <AdminDialog
      title={`Detalle diario · ${siteName}`}
      description={`${dashboardDate(date)} · Estado vigente de los conteos de esta fecha.`}
      onClose={close}
      variant="drawer"
      drawerMaxWidth={720}
      footer={
        <>
          {data && (
            <div className="admin-dialog__footer-navigation">
              <AdminPagination
                total={filteredItems.length}
                currentPage={paginated.currentPage}
                pageCount={paginated.pageCount}
                onPageChange={setPage}
                ariaLabel="Paginación del detalle diario"
              />
            </div>
          )}
          <div className="admin-dialog__footer-actions">
            <button type="button" className="button button--secondary" onClick={close}>
              Cerrar
            </button>
          </div>
        </>
      }
    >
      {!data ? (
        <QueryState {...query} variant="compact" />
      ) : (
        <>
          <div className="admin-drawer-stock-filter">
            <AdminBinarySwitch
              label="Stock"
              value={stockView}
              options={[
                { value: "positive", label: "Stock positivo" },
                { value: "zero", label: "Stock 0" },
              ]}
              onChange={setStockView}
            />
          </div>

          <div className="admin-dashboard-daily__views">
            <div
              className="admin-state-views"
              role="tablist"
              aria-label="Estado del conteo"
              onKeyDown={(event) => {
                if (
                  ![
                    "ArrowRight",
                    "ArrowDown",
                    "ArrowLeft",
                    "ArrowUp",
                    "Home",
                    "End",
                  ].includes(event.key)
                )
                  return;
                event.preventDefault();
                const currentIndex = dailyStateViews.findIndex(
                  (view) => view.state === selectedState,
                );
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : -1;
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? dailyStateViews.length - 1
                      : (currentIndex + direction + dailyStateViews.length) %
                        dailyStateViews.length;
                const next = dailyStateViews[nextIndex];
                setSelectedState(next.state);
                event.currentTarget
                  .querySelector<HTMLButtonElement>(
                    `[data-daily-state="${next.state}"]`,
                  )
                  ?.focus();
              }}
            >
              {dailyStateViews.map((view) => (
                <button
                  key={view.state}
                  type="button"
                  role="tab"
                  data-daily-state={view.state}
                  aria-selected={selectedState === view.state}
                  aria-controls="admin-dashboard-daily-state-panel"
                  tabIndex={selectedState === view.state ? 0 : -1}
                  onClick={() => setSelectedState(view.state)}
                >
                  <span>{view.label}</span>
                  <strong>{stateCounts[view.state]}</strong>
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length ? (
            <div
              id="admin-dashboard-daily-state-panel"
              role="tabpanel"
              className="admin-auxiliary-table"
              aria-label={dailyStateViews.find((view) => view.state === selectedState)?.label}
            >
              <table>
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Teórico</th>
                    <th>Físico</th>
                    <th>Diferencia</th>
                    <th>Valorizado</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.rows.map((row) => (
                    <tr key={row.case_id}>
                      <td>{row.grupo}</td>
                      <td><Value value={row.theoretical} /></td>
                      <td><Value value={row.physical} /></td>
                      <td><Value value={row.difference} /></td>
                      <td><Value value={row.value} money /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p
              id="admin-dashboard-daily-state-panel"
              className="admin-dashboard-daily__empty"
              role="status"
            >
              No hay conteos para este estado y tipo de stock.
            </p>
          )}
        </>
      )}
    </AdminDialog>
  );
}

function Grid({ site }: { site: string }) {
  const [period, setPeriod] = useState<Biweekly>("current_biweekly");
  const [date, setDate] = useState<string | null>(null);
  const query = useAdminQuery("shift_grid", { site_id: site, period });
  const data = query.data;
  return (
    <section
      className="admin-dashboard__detail"
      aria-label="Cobertura por turnos"
    >
      <div className="admin-dashboard__section-header">
        <h3>Detalle quincenal</h3>
        {data && (
          <p className="admin-dashboard__period">
            {dashboardDate(data.period.from)} — {dashboardDate(data.period.to)}
          </p>
        )}
        <div
          className="dashboard-period-switch"
          role="group"
          aria-label="Quincena de turnos"
        >
          <button
            type="button"
            className={period === "previous_biweekly" ? "is-active" : ""}
            aria-pressed={period === "previous_biweekly"}
            onClick={() => {
              setPeriod("previous_biweekly");
              setDate(null);
            }}
          >
            Anterior
          </button>

          <button
            type="button"
            className={period === "current_biweekly" ? "is-active" : ""}
            aria-pressed={period === "current_biweekly"}
            onClick={() => {
              setPeriod("current_biweekly");
              setDate(null);
            }}
          >
            Actual
          </button>
        </div>
      </div>
      {!data ? (
        <QueryState {...query} variant="compact" />
      ) : (
        <>
          {!data.data.totals.length ? (
            <p className="admin-dashboard__empty">Sin datos de turnos</p>
          ) : (
            <div className="admin-main-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Turno</th>
                    {data.data.totals.map((total) => (
                      <th scope="col" key={total.date}>
                        {dashboardDate(total.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["early", "Madrugada"],
                      ["day", "Día"],
                      ["night", "Noche"],
                    ] as const
                  ).map(([shift, label]) => (
                    <tr key={shift}>
                      <th scope="row">{label}</th>
                      {data.data.totals.map((total) => {
                        const cell = data.data.shifts.find(
                          (s) => s.date === total.date && s.shift === shift,
                        );
                        return (
                          <td
                            key={total.date}
                            title={
                              cell
                                ? `${cell.numerator}/${cell.denominator} · ${dashboardTimestamp(cell.calculated_at)}`
                                : "Corte no disponible"
                            }
                          >
                            {cell ? `${cell.percentage}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Total</th>
                    {data.data.totals.map((total) => (
                      <td
                        key={total.date}
                        className="admin-dashboard__percentage-cell"
                        title={`${total.numerator}/${total.denominator}`}
                      >
                        <button
                          className="admin__percentage-action"
                          aria-label={`Abrir día ${total.date}`}
                          onClick={() => setDate(total.date)}
                        >
                          {total.percentage}%
                          <ZoomIn size={16} aria-hidden="true" />
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {date && data && (
        <DailyDrawer
          key={`${site}|${date}`}
          site={site}
          date={date}
          close={() => setDate(null)}
        />
      )}
    </section>
  );
}
function SiteCard({
  site,
  expanded,
  toggle,
}: {
  site: DashboardCards["sites"][number];
  expanded: boolean;
  toggle: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const complete = site.period_coverage.complete;
  const percent = complete
    ? site.daily_coverage.percent
    : site.period_coverage.percent;
  const counted = complete
    ? site.daily_coverage.counted_today
    : site.period_coverage.counted;
  const total = complete
    ? site.daily_coverage.total
    : site.period_coverage.total;
  const name = adminSiteLabel(site.site);
  return (
    <article
      className="admin-v2-card admin-dashboard__card"
      aria-label={`Sede ${name}`}
    >
      <header>
        <h2>
          <Store size={24} aria-hidden="true" />
          {name}
        </h2>
        {complete && (
          <span className="admin-dashboard__complete">
            <Check size={13} aria-hidden="true" />
            Quincena completada
          </span>
        )}
        <button
          className="icon-button"
          aria-label={`${expanded ? "Ocultar" : "Ver"} turnos de ${name}`}
          aria-expanded={expanded}
          aria-controls={`dashboard-turns-${site.site_id}`}
          onClick={toggle}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </button>
      </header>
      <div className="admin-dashboard__summary">
        <div className="admin-dashboard__coverage">
          <span className="admin-dashboard__label">
            {complete ? "Cobertura diaria" : "Cobertura quincenal"}
          </span>
          {total > 0 ? (
            <>
              <strong>
                <span>{percent} %</span> {counted} / {total}
              </strong>
              <progress
                aria-label={
                  complete ? "Cobertura diaria" : "Cobertura quincenal"
                }
                max={100}
                value={percent}
              />
            </>
          ) : (
            <p className="admin-dashboard__empty">Sin cobertura registrada</p>
          )}
        </div>
        <div className="admin-dashboard__recounts">
          <span className="admin-dashboard__label">Por recontar</span>
          <strong
            className={
              site.pending_recount > 0
                ? "admin-dashboard__warning"
                : "admin-dashboard__zero"
            }
          >
            {site.pending_recount > 0 ? (
              <TriangleAlert size={16} aria-hidden="true" />
            ) : (
              <CircleCheck size={16} aria-hidden="true" />
            )}
            {site.pending_recount} <span>pendientes</span>
          </strong>
        </div>
        <div className="admin-dashboard__snapshot">
          <span className="admin-dashboard__label">Snapshot</span>
          {site.snapshot ? (
            <time dateTime={site.snapshot.confirmado_at}>
              {dashboardTimestamp(site.snapshot.confirmado_at)}
            </time>
          ) : (
            <span>Ausente</span>
          )}
        </div>
        <button
          className="admin-button__actions"
          onClick={() => setExportOpen(true)}
        >
          <Download size={15} aria-hidden="true" />
          Descargar ajuste
        </button>
      </div>
      <div id={`dashboard-turns-${site.site_id}`}>
        {expanded && <Grid site={site.site_id} />}
      </div>

      {exportOpen && (
        <AdminExportDialog
          siteId={site.site_id}
          onClose={() => setExportOpen(false)}
        />
      )}
    </article>
  );
}
export function AdminDashboardV2() {
  const query = useAdminQuery("dashboard_cards", {});
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  return query.data ? (
    <>
      <section className="admin-dashboard" aria-label="Resumen por sede">
        {orderedAdminSites(
          query.data.sites.map((site) => ({ ...site, nombre: site.site })),
        ).map((site) => (
          <SiteCard
            key={site.site_id}
            site={site}
            expanded={expandedSite === site.site_id}
            toggle={() =>
              setExpandedSite((current) =>
                current === site.site_id ? null : site.site_id,
              )
            }
          />
        ))}
      </section>
      {!query.data.sites.length && <p>No hay sedes disponibles.</p>}
    </>
  ) : (
    <QueryState {...query} />
  );
}
