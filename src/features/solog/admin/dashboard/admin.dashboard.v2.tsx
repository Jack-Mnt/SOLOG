import { useState } from "react";
import {
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Download,
  Store,
  TriangleAlert,
  ZoomIn,
} from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import { useAdminQuery } from "../admin.v2.context";
import type { Biweekly, DashboardCards } from "../admin.v2";
import { QueryState, Value } from "../admin.v2.presentation";
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

function DailyDrawer({
  site,
  date,
  close,
}: {
  site: string;
  date: string;
  close: () => void;
}) {
  const query = useAdminQuery("daily_detail", {
    site_id: site,
    origin_date: date,
  });
  const data = query.data;
  return (
    <AdminDialog
      title={`Conteos originados el ${dashboardDate(date)}`}
      description="Estado vigente de los conteos de esta fecha. Zona horaria America/Lima."
      onClose={close}
      wide
      className="admin-v2-drawer"
    >
      {!data ? (
        <QueryState {...query} />
      ) : (
        <>
          <div className="admin-v2-kpis">
            <span>Por recontar: {data.summary.pending_recount}</span>
            <span>Confirmadas: {data.summary.confirmed}</span>
            <span>Inconsistentes: {data.summary.inconsistent}</span>
          </div>
          <div className="admin-v2-table">
            <table>
              <thead>
                <tr>
                  <th>Grupo / estado</th>
                  <th>Stock teórico / posterior aplicable</th>
                  <th>Stock físico / reconteo aplicable</th>
                  <th>Diferencia</th>
                  <th>Valorizado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.case_id}>
                    <td>
                      {row.grupo} · {row.estado}
                    </td>
                    <td>
                      <Value value={row.theoretical} />
                    </td>
                    <td>
                      <Value value={row.physical} />
                    </td>
                    <td>
                      <Value value={row.difference} />
                    </td>
                    <td>
                      <Value value={row.value} money />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && <p>No hay conteos originados este día.</p>}
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
        <QueryState {...query} />
      ) : (
        <>
          {!data.data.totals.length ? (
            <p className="admin-dashboard__empty">Sin datos de turnos</p>
          ) : (
            <div className="admin-v2-table">
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
                      <th>{label}</th>
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
                    <th>Total</th>
                    {data.data.totals.map((total) => (
                      <td
                        key={total.date}
                        title={`${total.numerator}/${total.denominator}`}
                      >
                        <button
                          className="icon-button"
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
          className="admin-dashboard__actions"
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
