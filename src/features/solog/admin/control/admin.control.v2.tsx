import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChevronDown, Download, Eye, Search, SearchX } from "lucide-react";
import { AdminDialog } from "../admin.dialog";
import { useAdminQuery, useAdminStore } from "../admin.v2.context";
import type {
  AdminPayloads,
  ControlPeriod,
  ControlChronologyPeriod,
  DifferenceState,
} from "../admin.v2";
import { QueryState, Value } from "../admin.v2.presentation";
import { validCustomRange } from "../admin.v2.format";
import { AdminExportDialog } from "./admin.control.v2.export-dialog";
import { controlView } from "./admin.control.data";

const periods: [ControlPeriod, string][] = [
  ["today", "Hoy"],
  ["last_week", "Última semana"],
  ["current_biweekly", "Período actual quincenal"],
  ["previous_biweekly", "Período anterior quincenal"],
  ["custom", "Personalizado"],
];
const stateTone: Record<DifferenceState, string> = {
  Coincide: "success",
  Recontar: "warning",
  Confirmada: "success",
  Inconsistente: "danger",
};
function controlDate(value: string, withTime = false) {
  const date = new Date(withTime ? value : `${value}T12:00:00-05:00`);
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: withTime ? "numeric" : "2-digit",
    month: "short",
  }).formatToParts(date);
  const day = `${parts.find((part) => part.type === "day")!.value} ${parts.find((part) => part.type === "month")!.value}`;
  return withTime
    ? `${day}, ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit", hour12: true }).format(date).toLowerCase()}`
    : day;
}
function ControlPeriodSelect({
  value,
  onChange,
  range,
}: {
  value: ControlPeriod;
  onChange: (value: ControlPeriod) => void;
  range?: { from: string; to: string };
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const rangeId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open) options.current[activeIndex]?.focus();
  }, [open, activeIndex]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="admin-control__period-select"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? -1 : 1;
          setActiveIndex(
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? periods.length - 1
                : open
                  ? (activeIndex + direction + periods.length) % periods.length
                  : periods.findIndex(([period]) => period === value),
          );
          setOpen(true);
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label="Período"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={rangeId}
        title={periods.find(([period]) => period === value)?.[1]}
        className="admin-control__period-trigger"
        onClick={() => {
          setActiveIndex(periods.findIndex(([period]) => period === value));
          setOpen((current) => !current);
        }}
      >
        <span id={rangeId}>
          {range
            ? `${controlDate(range.from)} — ${controlDate(range.to)}`
            : periods.find(([period]) => period === value)?.[1]}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="admin-control__period-options"
          id={listId}
          role="listbox"
          aria-label="Opciones de período"
        >
          {periods.map(([period, label], index) => (
            <button
              type="button"
              role="option"
              key={period}
              ref={(node) => {
                options.current[index] = node;
              }}
              tabIndex={-1}
              aria-selected={value === period}
              onClick={() => {
                onChange(period);
                close();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function eventDate(value: string) {
  const parts = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short" }).formatToParts(new Date(value));
  return `${parts.find(part => part.type === "day")!.value} ${parts.find(part => part.type === "month")!.value}`;
}
function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)).toLowerCase();
}
function GroupDetail({ site, group, name, close }: { site: string; group: string; name: string; close: () => void }) {
  const [period, setPeriod] = useState<ControlChronologyPeriod>("current_biweekly");
  const actualButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const button = actualButton.current;
    button?.focus();
    const dialog = button?.closest('[role="dialog"]');
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", trap as EventListener);
    return () => { dialog?.removeEventListener("keydown", trap as EventListener); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const query = useAdminQuery("control_chronology", { site_id: site, group_id: group, period });
  return (
    <AdminDialog title={`Cronología de ${name}`} description="Evolución del grupo por quincena. Fechas y horas de Lima." onClose={close} wide className="admin-control-chronology">
      <div className="admin-control-chronology__toolbar">
        <div role="group" aria-label="Quincena de cronología" className="admin-control-chronology__periods">
          <button ref={actualButton} type="button" aria-pressed={period === "current_biweekly"} onClick={() => setPeriod("current_biweekly")}>Actual</button>
          <button type="button" aria-pressed={period === "previous_biweekly"} onClick={() => setPeriod("previous_biweekly")}>Anterior</button>
        </div>
        {query.data && <span>{controlDate(query.data.period.from)} — {controlDate(query.data.period.to)}</span>}
      </div>
      {!query.data ? <QueryState {...query} /> : !query.data.chronology.length ? <p role="status">No hay registros en esta quincena.</p> : (
        <div className="admin-v2-table admin-control-chronology__table">
          <table>
            <thead><tr><th>Fecha</th><th>Hora</th><th>Estado</th><th>Teórico</th><th>Físico</th><th>Diferencia</th><th>Valorizado</th><th>Detalle</th></tr></thead>
            <tbody>{query.data.chronology.map(row => (
              <tr key={row.row_id}>
                <td><time dateTime={row.event_at}>{eventDate(row.event_at)}</time></td>
                <td>{eventTime(row.event_at)}</td>
                <td><span className={`admin-control__badge admin-control__tone--${row.state === "Recontado" ? "info" : stateTone[row.state]}`}>{row.state}</span></td>
                <td className="admin-control__number"><Value value={row.theoretical} /></td>
                <td className="admin-control__number"><Value value={row.physical} /></td>
                <td className={`admin-control__number admin-control__difference--${row.difference < 0 ? "negative" : row.difference > 0 ? "positive" : "zero"}`}>{row.difference > 0 ? "+" : ""}<Value value={row.difference} /></td>
                <td className="admin-control__number"><Value value={row.valued_difference} money /></td>
                <td className="admin-control-chronology__valuation">
                  <span>Unidad: <Value value={row.valuation.unit_price} money /></span>
                  {row.valuation.units_per_package !== null && <span>Unidades por paquete: <Value value={row.valuation.units_per_package} /></span>}
                  {row.valuation.package_price !== null && <span>Paquete: <Value value={row.valuation.package_price} money /></span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </AdminDialog>
  );
}
function ControlResults({
  payload,
  selectedState,
  onStateChange,
  search,
}: {
  payload: AdminPayloads["control_groups"];
  selectedState: DifferenceState | "";
  onStateChange: (value: DifferenceState | "") => void;
  search: string;
}) {
  const query = useAdminQuery("control_groups", payload);
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(0);
  const filterKey = JSON.stringify([selectedState, search]);
  const [previousFilter, setPreviousFilter] = useState(filterKey);
  if (filterKey !== previousFilter) { setPreviousFilter(filterKey); setPage(0); }
  const data = query.data;
  if (!data) return <QueryState {...query} />;
  const view = controlView(data.items, selectedState, search, page);
  return (
    <>
      <div
        className="admin-control__summary"
        aria-label="Resumen de resultados"
      >
        <button
          type="button"
          className="admin-control__chip"
          aria-pressed={selectedState === ""}
          onClick={() => onStateChange("")}
        >
          <b>{view.summary.total} Total</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--success"
          aria-pressed={selectedState === "Coincide"}
          onClick={() => onStateChange("Coincide")}
        >
          <b>{view.summary.coincide} Coinciden</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--warning"
          aria-pressed={selectedState === "Recontar"}
          onClick={() => onStateChange("Recontar")}
        >
          <b>{view.summary.pending_recount} Recontar</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--info"
          aria-pressed={selectedState === "Confirmada"}
          onClick={() => onStateChange("Confirmada")}
        >
          <b>{view.summary.confirmed} Confirmadas</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--danger"
          aria-pressed={selectedState === "Inconsistente"}
          onClick={() => onStateChange("Inconsistente")}
        >
          <b>{view.summary.inconsistent} Inconsistentes</b>
        </button>
        <p className="admin-control__period">
          {controlDate(data.period.from)} — {controlDate(data.period.to)}
        </p>
      </div>
      {view.total > 0 ? (
        <div className="admin-v2-table admin-control__table">
          <table>
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Categoría</th>
                <th>Origen</th>
                <th>Estado</th>
                <th className="admin-control__number">Diferencia</th>
                <th className="admin-control__number">Valorizado</th>
                <th className="admin-control__detail-cell">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.case_id}>
                  <td>{row.group_name}</td>
                  <td>{row.category}</td>
                  <td>
                    <time dateTime={row.origin_at}>
                      {controlDate(row.origin_at, true)}
                    </time>
                  </td>
                  <td>
                    <span
                      className={`admin-control__badge admin-control__tone--${stateTone[row.state]}`}
                    >
                      {row.state === "Recontar"
                        ? "Por recontar"
                        : row.state}
                    </span>
                  </td>
                  <td
                    className={`admin-control__number admin-control__difference--${row.difference < 0 ? "negative" : row.difference > 0 ? "positive" : "zero"}`}
                  >
                    {row.difference > 0 ? "+" : ""}
                    <Value value={row.difference} />
                  </td>
                  <td className="admin-control__number">
                    <Value value={row.valued_difference} money />
                  </td>
                  <td className="admin-control__detail-cell">
                    <button
                      className="icon-button"
                      aria-label={`Ver cronología de ${row.group_name}`}
                      onClick={() =>
                        setGroup({ id: row.group_id, name: row.group_name })
                      }
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-control__empty" role="status">
          <SearchX size={18} aria-hidden="true" />
          No hay resultados para los filtros seleccionados.
        </p>
      )}
      {view.total > 0 && (
        <div className="admin-control__pagination">
          <button className="button button--secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span>Página {page + 1}</span>
          <button className="button button--secondary" disabled={(page + 1) * 100 >= view.total} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>
      )}
      {group && (
        <GroupDetail
          site={payload.site_id}
          group={group.id}
          name={group.name}
          close={() => setGroup(null)}
        />
      )}
    </>
  );
}
export function AdminControlV2() {
  const store = useAdminStore();
  useSyncExternalStore(store.subscribe, store.snapshot);
  const site = store.siteId;
  const [period, setPeriod] = useState<ControlPeriod>("today");
  const [state, setState] = useState<DifferenceState | "">("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const invalid = period === "custom" && !validCustomRange(from, to);
  const currentPayload: AdminPayloads["control_groups"] | null = !site || invalid ? null : {
    site_id: site,
    period,
    ...(period === "custom" ? { date_from: from, date_to: to } : {}),
  };
  const cached = currentPayload ? store.peek("control_groups", currentPayload).data : undefined;
  return (
    <section className="admin-control">
      <h2>Control de diferencias</h2>
      <div className="admin-filter-bar admin-control__filters">
        <div className="admin-filter-field admin-control__period-field">
          <span>Período</span>
          <ControlPeriodSelect
            key={site}
            value={period}
            onChange={setPeriod}
            range={cached?.period}
          />
        </div>
        {period === "custom" && (
          <>
            <label className="admin-filter-field">
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="admin-filter-field">
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="admin-filter-field admin-filter-search-field">
          Buscar grupo
          <span className="admin-filter-search-control">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
        </label>
        <button
          type="button"
          disabled={!site}
          className="button button--secondary admin-control__export"
          onClick={() => setExportOpen(true)}
        >
          <Download size={16} aria-hidden="true" />
          Descargar ajuste
        </button>
      </div>
      {invalid && (
        <p role="alert">Selecciona un rango válido de hasta 92 días.</p>
      )}
      {currentPayload ? (
        <>
          <ControlResults
            key={JSON.stringify(currentPayload)}
            payload={currentPayload}
            selectedState={state}
            onStateChange={setState}
            search={search}
          />

        </>
      ) : (
        !site ? <p>No hay sedes disponibles.</p> : null
      )}
      {exportOpen && (
        <AdminExportDialog siteId={site} onClose={() => setExportOpen(false)} />
      )}
    </section>
  );
}
