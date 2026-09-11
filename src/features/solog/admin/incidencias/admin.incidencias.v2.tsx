import { useMemo, useState } from "react";
import { useAdminStore } from "../admin.v2.context";
import { useManagement, useManagementQuery } from "../admin.management.context";
import { AdminDialog } from "../admin.dialog";
import { ReadNotice, MutationNotice } from "../admin.management.presentation";
import { adminTimestamp } from "../admin.v2.format";
import type {
  Family,
  IncidentState,
  IncidentType,
} from "../admin.management.v2";

const typeLabels: Record<IncidentType, string> = {
  producto_ausente: "Producto ausente",
  codigo_interno_invalido: "Código interno inválido",
  codigo_interno_duplicado: "Código interno duplicado",
  stock_invalido: "Stock inválido",
};
const stateLabels: Record<IncidentState, string> = {
  pendiente: "Pendiente",
  suprimida: "Suprimida",
  resuelta: "Resuelta",
};

function StateBadge({ state }: { state: IncidentState }) {
  return (
    <span className={`admin-incidents__state admin-incidents__state--${state}`}>
      {stateLabels[state]}
    </span>
  );
}

function FamilyDetail({
  family,
  site,
  onClose,
}: {
  family: Family;
  site: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const query = useManagementQuery("detail", {
    family_key: family.family_key,
    ...(site ? { site_id: site } : {}),
    page,
    page_size: 100,
  });
  return (
    <AdminDialog
      title={`Repeticiones · ${typeLabels[family.tipo]}`}
      description="Detalle solicitado bajo demanda para el ámbito seleccionado."
      onClose={onClose}
      wide
    >
      {query.data ? (
        <>
          <div
            className="admin-v2-table admin-incidents__detail-table"
            role="region"
            aria-label="Detalle de repeticiones"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Vigencia</th>
                  <th>Primera detección</th>
                  <th>Última detección</th>
                  <th>Resuelta</th>
                  <th>Apariciones</th>
                  <th>Datos</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.sede}</td>
                    <td>
                      <StateBadge state={item.estado} />
                    </td>
                    <td>{item.active ? "Vigente" : "Histórica"}</td>
                    <td>{adminTimestamp(item.first_seen_at)}</td>
                    <td>{adminTimestamp(item.last_seen_at)}</td>
                    <td>
                      {item.resuelta_at
                        ? adminTimestamp(item.resuelta_at)
                        : "—"}
                    </td>
                    <td>{item.occurrence_count}</td>
                    <td>
                      <details>
                        <summary>Ver datos</summary>
                        <pre className="admin-v2-json">
                          {JSON.stringify(item.datos, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-v2-toolbar">
            <button
              type="button"
              className="button button--secondary"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              type="button"
              className="button button--secondary"
              disabled={query.data.items.length < 100}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      ) : (
        <ReadNotice {...query} />
      )}
    </AdminDialog>
  );
}

function canProposeDelete(family: Family) {
  return (
    family.tipo === "producto_ausente" &&
    family.active &&
    family.c_interno !== null &&
    Number.isSafeInteger(family.c_interno) &&
    family.c_interno > 0 &&
    !family.deletion_proposed
  );
}

export function AdminIncidentsV2() {
  const admin = useAdminStore();
  const store = useManagement();
  const [site, setSite] = useState("");
  const [type, setType] = useState<"all" | IncidentType>("all");
  const [state, setState] = useState<"all" | IncidentState>("all");
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useManagementQuery("summary", site ? { site_id: site } : {});
  const families = useMemo(
    () =>
      (query.data?.families ?? []).filter(
        (item) =>
          (type === "all" || item.tipo === type) &&
          (state === "all" || item.family_state === state),
      ),
    [query.data, state, type],
  );
  const act = (
    target: Family,
    action: "ignore_30d" | "reactivate" | "propose_delete",
  ) => {
    if (!query.data) return;
    setError("");
    setNotice("");
    void store
      .mutation(
        action,
        {
          family_key: target.family_key,
          scope: site ? "site" : "global",
          ...(site ? { site_id: site } : {}),
        },
        query.data.revisions.incidents,
        site || undefined,
      )
      .then(() => {
        if (action === "propose_delete")
          setNotice(
            "La propuesta de eliminación quedó pendiente para revisión en Catálogo.",
          );
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo actualizar la incidencia.",
        ),
      );
  };
  const pending = !!store.intent("incidents");
  return (
    <section className="admin-incidents">
      <div className="admin-v2-toolbar admin-incidents__toolbar">
        <div className="admin-incidents__filters">
          <label>
            Ámbito de incidencias
            <select
              value={site}
              onChange={(event) => {
                setSite(event.target.value);
                setFamily(null);
                setError("");
                setNotice("");
              }}
            >
              <option value="">Global · todas las sedes</option>
              {admin.bootstrap?.allowed_sites.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as "all" | IncidentType)
              }
            >
              <option value="all">Todos</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select
              value={state}
              onChange={(event) =>
                setState(event.target.value as "all" | IncidentState)
              }
            >
              <option value="all">Todos</option>
              {Object.entries(stateLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={query.retry}
        >
          Actualizar incidencias
        </button>
      </div>
      <p className="admin-incidents__help">
        Las acciones se aplican al ámbito seleccionado. Proponer eliminación no
        elimina, no suprime, no aprueba ni publica.
      </p>
      <MutationNotice domain="incidents" />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {query.data ? (
        <>
          <p className="admin-incidents__period">
            Período operativo: {query.data.period.from} — {query.data.period.to}{" "}
            · America/Lima
          </p>
          <div
            className="admin-v2-table admin-incidents__table"
            role="region"
            aria-label="Familias de incidencias"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Incidencia</th>
                  <th>Estado</th>
                  <th>Casos</th>
                  <th>Supresión</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {families.map((item) => (
                  <tr key={item.family_key}>
                    <th scope="row">
                      <span>{typeLabels[item.tipo]}</span>
                      <small>
                        {item.c_interno ??
                          item.c_interno_original ??
                          "Sin código"}
                      </small>
                    </th>
                    <td>
                      <StateBadge state={item.family_state} />
                    </td>
                    <td>
                      {item.active_cases} activos · {item.resolved_cases}{" "}
                      resueltos
                    </td>
                    <td>
                      {item.active_suppression_until ? (
                        <>
                          Vigente hasta{" "}
                          {adminTimestamp(item.active_suppression_until)}
                        </>
                      ) : (
                        "Sin supresión"
                      )}
                    </td>
                    <td>
                      <div className="admin-v2-actions">
                        <button
                          type="button"
                          className="button button--secondary"
                          aria-label={`Ver repeticiones ${item.family_key}`}
                          onClick={() => setFamily(item)}
                        >
                          Ver detalle
                        </button>
                        {item.active && !item.reactivate_available && (
                          <button
                            type="button"
                            className="button button--secondary"
                            disabled={pending}
                            onClick={() => act(item, "ignore_30d")}
                          >
                            Ignorar 30 días
                          </button>
                        )}
                        {item.reactivate_available && (
                          <button
                            type="button"
                            className="button button--secondary"
                            disabled={pending}
                            onClick={() => act(item, "reactivate")}
                          >
                            Reactivar incidencia
                          </button>
                        )}
                        {canProposeDelete(item) && (
                          <button
                            type="button"
                            className="button button--secondary"
                            disabled={pending}
                            onClick={() => act(item, "propose_delete")}
                          >
                            Proponer eliminación
                          </button>
                        )}
                        {item.deletion_proposed && (
                          <span className="admin-incidents__catalog-status">
                            Eliminación propuesta en Catálogo
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!families.length && (
                  <tr>
                    <td colSpan={5}>
                      No hay incidencias que coincidan con los filtros locales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <ReadNotice {...query} />
      )}
      {family && (
        <FamilyDetail
          key={`${site}:${family.family_key}`}
          family={family}
          site={site}
          onClose={() => setFamily(null)}
        />
      )}
    </section>
  );
}
