import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ChevronDown,
  Download,
  Eye,
  Search,
  SearchX,
} from "lucide-react";
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
import { controlView, type ControlSort } from "./admin.control.data";
import { AdminPagination, AdminSort, IconButton } from "../admin.primitives";

const periods: [ControlPeriod, string][] = [
  ["today", "Hoy"],
  ["last_week", "Última semana"],
  ["current_biweekly", "Quincena actual"],
  ["previous_biweekly", "Quincena anterior"],
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
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
  }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === "day")!.value} ${parts.find((part) => part.type === "month")!.value}`;
}
function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(value))
    .toLowerCase();
}
function GroupDetail({
  site,
  group,
  name,
  close,
}: {
  site: string;
  group: string;
  name: string;
  close: () => void;
}) {
  const [period, setPeriod] =
    useState<ControlChronologyPeriod>("current_biweekly");
  const actualButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const button = actualButton.current;
    button?.focus();
    const dialog = button?.closest('[role="dialog"]');
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, a[href], [tabindex="0"]',
        ),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener("keydown", trap as EventListener);
    return () => {
      dialog?.removeEventListener("keydown", trap as EventListener);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  const query = useAdminQuery("control_chronology", {
    site_id: site,
    group_id: group,
    period,
  });
  return (
    <AdminDialog
      title={`Cronología de ${name}`}
      description="Evolución del grupo por quincena. Fechas y horas de Lima."
      onClose={close}
      variant="wide"
      className="admin-control-chronology"
    >
      <div className="admin-control-chronology__toolbar">
        <div
          role="group"
          aria-label="Quincena de cronología"
          className="admin-control-chronology__periods"
        >
          <button
            ref={actualButton}
            type="button"
            aria-pressed={period === "current_biweekly"}
            onClick={() => setPeriod("current_biweekly")}
          >
            Actual
          </button>
          <button
            type="button"
            aria-pressed={period === "previous_biweekly"}
            onClick={() => setPeriod("previous_biweekly")}
          >
            Anterior
          </button>
        </div>
        {query.data && (
          <span>
            {controlDate(query.data.period.from)} —{" "}
            {controlDate(query.data.period.to)}
          </span>
        )}
      </div>
      {!query.data ? (
        <QueryState {...query} />
      ) : !query.data.chronology.length ? (
        <p role="status">No hay registros en esta quincena.</p>
      ) : (
        <div className="admin-auxiliary-table admin-control-chronology__table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Estado</th>
                <th>Teórico</th>
                <th>Físico</th>
                <th>Diferencia</th>
                <th>Valorizado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {query.data.chronology.map((row) => (
                <tr key={row.row_id}>
                  <td>
                    <time dateTime={row.event_at}>
                      {eventDate(row.event_at)}
                    </time>
                  </td>
                  <td>{eventTime(row.event_at)}</td>
                  <td>
                    <span
                      className={`admin-control__badge admin-status-badge admin-status-badge--${row.state === "Recontado" ? "info" : stateTone[row.state]} admin-control__tone--${row.state === "Recontado" ? "info" : stateTone[row.state]}`}
                    >
                      {row.state}
                    </span>
                  </td>
                  <td className="admin-control__number">
                    <Value value={row.theoretical} />
                  </td>
                  <td className="admin-control__number">
                    <Value value={row.physical} />
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
                  <td className="admin-control-chronology__valuation">
                    <span>
                      Unidad: <Value value={row.valuation.unit_price} money />
                    </span>
                    {row.valuation.units_per_package !== null && (
                      <span>
                        Unidades por paquete:{" "}
                        <Value value={row.valuation.units_per_package} />
                      </span>
                    )}
                    {row.valuation.package_price !== null && (
                      <span>
                        Paquete:{" "}
                        <Value value={row.valuation.package_price} money />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
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
  const [sort, setSort] = useState<ControlSort>("default");
  const [page, setPage] = useState(0);
  const filterKey = JSON.stringify([selectedState, search, sort]);
  const [previousFilter, setPreviousFilter] = useState(filterKey);
  if (filterKey !== previousFilter) {
    setPreviousFilter(filterKey);
    setPage(0);
  }
  const data = query.data;
  if (!data) return <QueryState {...query} />;
  const view = controlView(data.items, selectedState, search, sort, page);
  return (
    <>
      <div
        className="admin-section-secondary-row"
        aria-label="Resumen de resultados"
      >
        <div className="admin-quick-filter-chips">
          {(
            [
              ["", "Total", view.summary.total, ""],
              ["Coincide", "Coinciden", view.summary.coincide, "tone--success"],
              [
                "Recontar",
                "Recontar",
                view.summary.pending_recount,
                "tone--warning",
              ],
              [
                "Confirmada",
                "Confirmadas",
                view.summary.confirmed,
                "tone--info",
              ],
              [
                "Inconsistente",
                "Inconsistentes",
                view.summary.inconsistent,
                "tone--danger",
              ],
            ] as const
          ).map(([value, label, count, tone]) => (
            <button
              key={value || "total"}
              type="button"
              className={`admin-quick-filter-chip ${tone}`.trim()}
              aria-pressed={selectedState === value}
              onClick={() => onStateChange(value)}
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
        <AdminSort<ControlSort>
          value={sort}
          defaultValue="default"
          onChange={setSort}
          options={[
            { value: "default", label: "Predeterminado" },
            { value: "recent", label: "Más reciente" },
            { value: "oldest", label: "Más antiguo" },
            { value: "difference_desc", label: "Diferencia: mayor a menor" },
            { value: "difference_asc", label: "Diferencia: menor a mayor" },
            { value: "valued_desc", label: "Valorizado: mayor a menor" },
          ]}
        />
      </div>
      {view.total > 0 ? (
        <div className="admin-table-section">
          <div className="admin-main-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Registrado</th>
                  <th scope="col">Grupo</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="admin-table-number">Diferencia</th>
                  <th scope="col" className="admin-table-number">Valorizado</th>
                  <th scope="col" className="admin-table-action-cell">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.case_id}>
                    <td>
                      <time dateTime={row.origin_at}>
                        {controlDate(row.origin_at, true)}
                      </time>
                    </td>
                    <th scope="row">{row.group_name}</th>
                    <td>{row.category}</td>
                    <td>
                      <span
                        className={`admin-control__badge admin-status-badge admin-status-badge--${stateTone[row.state]} admin-control__tone--${stateTone[row.state]}`}
                      >
                        {row.state === "Recontar" ? "Por recontar" : row.state}
                      </span>
                    </td>
                    <td
                      className={`admin-table-number admin-control__difference--${row.difference < 0 ? "negative" : row.difference > 0 ? "positive" : "zero"}`}
                    >
                      {row.difference > 0 ? "+" : ""}
                      <Value value={row.difference} />
                    </td>
                    <td className="admin-table-number">
                      <Value value={row.valued_difference} money />
                    </td>
                    <td className="admin-table-action-cell">
                      <div className="admin-table-actions">
                        <IconButton
                          aria-label={`Ver cronología de ${row.group_name}`}
                          title="Ver detalle"
                          onClick={() =>
                            setGroup({ id: row.group_id, name: row.group_name })
                          }
                        >
                          <Eye size={16} aria-hidden="true" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="admin-control__empty" role="status">
          <SearchX size={18} aria-hidden="true" />
          No hay resultados para los filtros seleccionados.
        </p>
      )}
      <AdminPagination
        total={view.total}
        currentPage={view.currentPage}
        pageCount={view.pageCount}
        onPageChange={setPage}
        ariaLabel="Paginación de Control"
      />
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
  const currentPayload: AdminPayloads["control_groups"] | null =
    !site || invalid
      ? null
      : {
          site_id: site,
          period,
          ...(period === "custom" ? { date_from: from, date_to: to } : {}),
        };
  const cached = currentPayload
    ? store.peek("control_groups", currentPayload).data
    : undefined;
  return (
    <section className="admin-control">
      <div className="admin-filter-bar admin-toolbar admin-toolbar-surface admin-control__filters">
        <div className="admin-filter-field admin-toolbar__period admin-control__period-field">
          <span>Período</span>
          <ControlPeriodSelect
            key={site}
            value={period}
            onChange={setPeriod}
            range={cached?.period}
          />
        </div>
        <label className="admin-filter-field admin-filter-search-field admin-toolbar__search">
          Buscar grupo
          <span className="admin-filter-search">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
        </label>
        {period === "custom" && (
          <div className="admin-toolbar__filters admin-control__custom-period-filters">
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
          </div>
        )}
        <div className="admin-toolbar__actions">
          <button
            type="button"
            disabled={!site}
            className="admin-button__actions"
            onClick={() => setExportOpen(true)}
          >
            <Download size={16} aria-hidden="true" />
            Descargar ajuste
          </button>
        </div>
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
      ) : !site ? (
        <p>No hay sedes disponibles.</p>
      ) : null}
      {exportOpen && (
        <AdminExportDialog siteId={site} onClose={() => setExportOpen(false)} />
      )}
    </section>
  );
}
