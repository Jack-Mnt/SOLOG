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
  DifferenceState,
} from "../admin.v2";
import { QueryState, Updated, Value } from "../admin.v2.presentation";
import { adminTimestamp, validCustomRange } from "../admin.v2.format";
import { AdminExportDialog } from "./admin.control.v2.export-dialog";

const periods: [ControlPeriod, string][] = [
  ["today", "Hoy"],
  ["last_week", "Última semana"],
  ["current_biweekly", "Período actual quincenal"],
  ["previous_biweekly", "Período anterior quincenal"],
  ["custom", "Personalizado"],
];
const states: DifferenceState[] = [
  "Coincide",
  "Recontar",
  "Confirmada",
  "Inconsistente",
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
  const [confirmedRange, setConfirmedRange] = useState(range);
  // Presentation only: retain the applied range while the next explicit query resolves.
  // The parent keys this control by site, so another site's range is never retained.
  if (
    range &&
    (range.from !== confirmedRange?.from || range.to !== confirmedRange?.to)
  )
    setConfirmedRange(range);
  const effectiveRange = range ?? confirmedRange;
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
          {effectiveRange
            ? `${controlDate(effectiveRange.from)} — ${controlDate(effectiveRange.to)}`
            : "Rango por confirmar"}
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
  const query = useAdminQuery("control_detail", {
    site_id: site,
    group_id: group,
  });
  return (
    <AdminDialog
      title={`Cronología de ${name}`}
      description="Resultados históricos de este grupo en la sede seleccionada."
      onClose={close}
      wide
      className="admin-v2-drawer"
    >
      {!query.data ? (
        <QueryState {...query} />
      ) : (
        <>
          <Updated at={query.data.generated_at} />
          <div className="admin-v2-table">
            <table>
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Estado vigente</th>
                  <th>Teórico de conteo</th>
                  <th>Físico de conteo</th>
                  <th>Diferencia inicial</th>
                  <th>Stock posterior</th>
                  <th>Teórico de reconteo</th>
                  <th>Físico de reconteo</th>
                  <th>Recontado</th>
                  <th>Diferencia vigente</th>
                  <th>Valorizado</th>
                </tr>
              </thead>
              <tbody>
                {query.data.chronology.map((r) => (
                  <tr key={r.case_id}>
                    <td>{adminTimestamp(r.contado_at)}</td>
                    <td>{r.estado_diferencia}</td>
                    <td>
                      <Value value={r.stock_teorico} />
                    </td>
                    <td>
                      <Value value={r.stock_fisico} />
                    </td>
                    <td>
                      <Value value={r.diferencia_inicial} />
                    </td>
                    <td>
                      <Value value={r.stock_posterior} />
                    </td>
                    <td>
                      <Value value={r.stock_teorico_reconteo} />
                    </td>
                    <td>
                      <Value value={r.stock_reconteo} />
                    </td>
                    <td>{adminTimestamp(r.recontado_at)}</td>
                    <td>
                      <Value value={r.diferencia} />
                    </td>
                    <td>
                      <Value value={r.valor_diferencia} money />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.chronology.length && <p>No hay registros.</p>}
        </>
      )}
    </AdminDialog>
  );
}
function ControlResults({
  payload,
  selectedState,
  onStateChange,
}: {
  payload: AdminPayloads["control_page"];
  selectedState: DifferenceState | "";
  onStateChange: (value: DifferenceState | "") => void;
}) {
  const query = useAdminQuery("control_page", payload);
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);
  const data = query.data;
  if (!data) return <QueryState {...query} />;
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
          <b>{data.summary.total} conteos</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--success"
          aria-pressed={selectedState === "Coincide"}
          onClick={() => onStateChange("Coincide")}
        >
          <b>{data.summary.coincide} coinciden</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--warning"
          aria-pressed={selectedState === "Recontar"}
          onClick={() => onStateChange("Recontar")}
        >
          <b>{data.summary.pending_recount} por recontar</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--info"
          aria-pressed={selectedState === "Confirmada"}
          onClick={() => onStateChange("Confirmada")}
        >
          <b>{data.summary.confirmed} confirmados</b>
        </button>
        <button
          type="button"
          className="admin-control__chip admin-control__tone--danger"
          aria-pressed={selectedState === "Inconsistente"}
          onClick={() => onStateChange("Inconsistente")}
        >
          <b>{data.summary.inconsistent} incoherentes</b>
        </button>
        <p className="admin-control__period">
          {controlDate(data.period.from)} — {controlDate(data.period.to)}
        </p>
      </div>
      {data.items.length > 0 ? (
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
              {data.items.map((row) => (
                <tr key={row.case_id}>
                  <td>{row.grupo}</td>
                  <td>{row.categoria}</td>
                  <td>
                    <time dateTime={row.contado_at}>
                      {controlDate(row.contado_at, true)}
                    </time>
                  </td>
                  <td>
                    <span
                      className={`admin-control__badge admin-control__tone--${stateTone[row.estado_diferencia]}`}
                    >
                      {row.estado_diferencia === "Recontar"
                        ? "Por recontar"
                        : row.estado_diferencia}
                    </span>
                  </td>
                  <td
                    className={`admin-control__number admin-control__difference--${row.diferencia < 0 ? "negative" : row.diferencia > 0 ? "positive" : "zero"}`}
                  >
                    {row.diferencia > 0 ? "+" : ""}
                    <Value value={row.diferencia} />
                  </td>
                  <td className="admin-control__number">
                    <Value value={row.valor_diferencia} money />
                  </td>
                  <td className="admin-control__detail-cell">
                    <button
                      className="icon-button"
                      aria-label={`Ver cronología de ${row.grupo}`}
                      onClick={() =>
                        setGroup({ id: row.grupo_id, name: row.grupo })
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
  const [page, setPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [payload, setPayload] = useState<AdminPayloads["control_page"]>({
    site_id: site,
    period: "today",
    state: null,
    page: 0,
    page_size: 100,
  });
  if (payload.site_id !== site) {
    setPage(0);
    setPayload({ ...payload, site_id: site, page: 0 });
  }
  const invalid = period === "custom" && !validCustomRange(from, to);
  const apply = () => {
    setPage(0);
    setPayload({
      site_id: site,
      period,
      state: state || null,
      ...(search.trim() ? { search: search.trim() } : {}),
      page: 0,
      page_size: 100,
      ...(period === "custom" ? { date_from: from, date_to: to } : {}),
    });
  };
  const currentPayload = { ...payload, page };
  const cached = store.peek("control_page", currentPayload).data;
  return (
    <section className="admin-control">
      <form
        className="admin-filter-bar admin-control__filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) apply();
        }}
      >
        <div className="admin-filter-field admin-control__period-field">
          <span>Período</span>
          <ControlPeriodSelect
            key={site}
            value={period}
            onChange={setPeriod}
            range={currentPayload.site_id === site ? cached?.period : undefined}
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
        <label className="admin-filter-field">
          Estado
          <select
            aria-label="Estado"
            value={state}
            onChange={(e) => setState(e.target.value as DifferenceState | "")}
          >
            <option value="">Todos</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s === "Recontar" ? "Por recontar" : s}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filter-field admin-filter-search-field">
          Buscar grupo
          <span className="admin-filter-search-control">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
        </label>
        <button className="button" disabled={!site || invalid}>
          Aplicar filtros
        </button>
        <button
          type="button"
          disabled={!site}
          className="button button--secondary admin-control__export"
          onClick={() => setExportOpen(true)}
        >
          <Download size={16} aria-hidden="true" />
          Descargar ajuste
        </button>
      </form>
      {invalid && (
        <p role="alert">Selecciona un rango válido de hasta 90 días.</p>
      )}
      {site ? (
        <>
          <ControlResults
            key={JSON.stringify(currentPayload)}
            payload={currentPayload}
            selectedState={state}
            onStateChange={setState}
          />
          {!!cached?.items.length && (
            <div className="admin-control__pagination">
              <button
                className="button button--secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                className="button button--secondary"
                disabled={
                  !cached ||
                  (page + 1) * cached.page_size >= cached.summary.total
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      ) : (
        <p>No hay sedes disponibles.</p>
      )}
      {exportOpen && (
        <AdminExportDialog siteId={site} onClose={() => setExportOpen(false)} />
      )}
    </section>
  );
}
