import { useState } from "react";
import {
  Inbox,
  MapPinOff,
  ShieldCheck,
  ShieldOff,
  Tablet,
  X,
} from "lucide-react";
import { useAdminStore } from "../admin.v2.context";
import { useManagement, useManagementQuery } from "../admin.management.context";
import { AdminDialog } from "../admin.dialog";
import { ReadNotice, MutationNotice } from "../admin.management.presentation";
import { AdminNotice } from "../admin.primitives";
import {
  adminSiteLabel,
  orderedAdminSites,
  deviceAccessLabel,
} from "../admin.site-ui";
import type { Device } from "../admin.management.v2";

type Action = "authorize" | "revoke" | "reject";
const titles: Record<Action, string> = {
  authorize: "Autorizar dispositivo",
  revoke: "Revocar dispositivo",
  reject: "Rechazar solicitud",
};
export function AdminDevicesV2() {
  const admin = useAdminStore(),
    store = useManagement(),
    [confirmation, setConfirmation] = useState<{
      device: Device;
      action: Action;
    } | null>(null),
    [error, setError] = useState("");
  const query = useManagementQuery("list", {});
  const confirm = () => {
    if (!confirmation) return;
    const { action } = confirmation;
    const device = query.data?.devices.find(
      (d) => d.id === confirmation.device.id,
    );
    if (!device) {
      setError("Actualiza la lista: el dispositivo ya no está disponible.");
      return;
    }
    setError("");
    void store
      .mutation(
        action,
        { device_id: device.id },
        device.revision,
        device.site_id,
      )
      .then(() => setConfirmation(null))
      .catch((e) => setError(store.intent("devices") ? "" : e.message));
  };
  const sites = orderedAdminSites(admin.bootstrap?.allowed_sites ?? []);
  const devices = query.data?.devices ?? [];
  const pending = sites.flatMap((site) =>
    devices.filter(
      (device) => device.site_id === site.id && device.estado === "pendiente",
    ),
  );
  const openAction = (device: Device, action: Action) => {
    setError("");
    setConfirmation({ device, action });
  };
  return (
    <>
      <div className="admin-devices">
        {!confirmation && <MutationNotice domain="devices" />}
        {query.data ? (
          <>
            <section
              className="admin-devices__section"
              aria-labelledby="admin-tablets-title"
            >
              <h2 id="admin-tablets-title">Tablets por sede</h2>
              <div className="admin-devices__list">
                {sites.map((site) => {
                  const device = devices.find(
                    (item) =>
                      item.site_id === site.id && item.estado === "autorizado",
                  );
                  return (
                    <article
                      className={
                        "admin-device-card" +
                        (device ? " admin-device-card--authorized" : "")
                      }
                      key={site.id}
                      aria-label={"Tablet de " + adminSiteLabel(site.nombre)}
                    >
                      <span className="admin-device-card__icon">
                        <Tablet size={24} aria-hidden="true" />
                      </span>
                      <header>
                        <h3>{adminSiteLabel(site.nombre)}</h3>
                        <span
                          className={
                            "admin-device-badge " +
                            (device
                              ? "admin-device-badge--authorized"
                              : "admin-device-badge--empty")
                          }
                        ></span>
                        {device ? (
                          <button
                            className="button button--secondary admin-device-revoke"
                            disabled={!!store.intent("devices")}
                            onClick={() => openAction(device, "revoke")}
                          >
                            <ShieldOff size={16} aria-hidden="true" />
                            Revocar
                          </button>
                        ) : (
                          <MapPinOff
                            size={20}
                            aria-hidden="true"
                            color="#cccccc"
                          />
                        )}
                      </header>
                      {device ? (
                        <>
                          <div className="admin-device-card__person">
                            <p>
                              Último acceso ·{" "}
                              {deviceAccessLabel(device.ultimo_acceso_at)}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="admin-device-card__empty">
                          No hay tablet autorizada.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
            <section
              className="admin-devices__section"
              aria-labelledby="admin-requests-title"
            >
              <h2 id="admin-requests-title">Solicitudes pendientes</h2>
              <div className="admin-devices__list">
                {pending.map((device) => {
                  return (
                    <article
                      className="admin-device-card"
                      key={device.id}
                      aria-label={"Solicitud de " + adminSiteLabel(device.site)}
                    >
                      <span className="admin-device-card__icon">
                        <Tablet size={24} aria-hidden="true" />
                      </span>
                      <header>
                        <h3>{adminSiteLabel(device.site)}</h3>
                      </header>
                      <div className="admin-device-card__person">
                        <p>
                          Solicitado · {deviceAccessLabel(device.solicitado_at)}
                        </p>
                      </div>
                      <footer>
                        <div className="admin-v2-actions">
                          <button
                            className="button"
                            disabled={!!store.intent("devices")}
                            onClick={() => openAction(device, "authorize")}
                          >
                            <ShieldCheck size={16} aria-hidden="true" />
                            Autorizar
                          </button>
                          <button
                            className="button button--secondary admin-device-revoke"
                            disabled={!!store.intent("devices")}
                            onClick={() => openAction(device, "reject")}
                          >
                            <X size={16} aria-hidden="true" />
                            Rechazar
                          </button>
                        </div>
                      </footer>
                    </article>
                  );
                })}
                {!pending.length && (
                  <p className="admin-devices__empty">
                    <Inbox size={19} aria-hidden="true" />
                    No hay solicitudes pendientes.
                  </p>
                )}
              </div>
            </section>
          </>
        ) : (
          <ReadNotice {...query} />
        )}
      </div>
      {confirmation && (
        <AdminDialog
          title={titles[confirmation.action]}
          onClose={() => setConfirmation(null)}
          closeDisabled={!!store.intent("devices")?.pending}
          kind="confirmation"
          footer={
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={!!store.intent("devices")?.pending}
                onClick={() => setConfirmation(null)}
              >
                <X size={16} aria-hidden="true" />
                Cancelar
              </button>
              <button
                type="button"
                className={
                  confirmation.action === "authorize"
                    ? "button"
                    : "button button--danger"
                }
                disabled={!!store.intent("devices")}
                onClick={confirm}
              >
                {confirmation.action === "authorize" ? (
                  <ShieldCheck size={16} aria-hidden="true" />
                ) : confirmation.action === "revoke" ? (
                  <ShieldOff size={16} aria-hidden="true" />
                ) : (
                  <X size={16} aria-hidden="true" />
                )}
                {titles[confirmation.action]}
              </button>
            </>
          }
        >
            <AdminNotice tone="info">
              {confirmation.action === "revoke"
                ? "El dispositivo perderá autorización. La sede quedará disponible para una nueva solicitud de acceso."
                : confirmation.action === "reject"
                  ? "Se rechazará esta solicitud pendiente."
                  : "La sede quedará vinculada a este dispositivo autorizado."}
            </AdminNotice>
            <dl className="admin-dialog-context">
              <div>
                <dt>Sede</dt>
                <dd>{adminSiteLabel(confirmation.device.site)}</dd>
              </div>
            </dl>
            {error && <p role="alert">{error}</p>}
            <MutationNotice
              domain="devices"
              showResult={false}
              onSuccess={() => setConfirmation(null)}
            />
        </AdminDialog>
      )}
    </>
  );
}
