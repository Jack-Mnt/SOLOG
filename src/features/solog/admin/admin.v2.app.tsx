import { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard,
  ScanSearch,
  TriangleAlert,
  BookOpenCheck,
  PackageSearch,
  Layers,
  Tablet,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { PanelLoader } from "../../../components/panel-loader";
import { navigateTo, type AdminRoute } from "../../../lib/router";
import { PaletteSwitcher } from "../../theme/palette-switcher";
import { AdminStore } from "./admin.v2.store";
import { adminSiteLabel, orderedAdminSites } from "./admin.site-ui";
import {
  AdminV2Context,
  useAdminQuery,
  useAdminStore,
} from "./admin.v2.context";
import "./admin.css";

const Dashboard = lazy(() =>
  import("./dashboard/admin.dashboard.v2").then((m) => ({
    default: m.AdminDashboardV2,
  })),
);
const Control = lazy(() =>
  import("./control/admin.control.v2").then((m) => ({
    default: m.AdminControlV2,
  })),
);
const Catalog = lazy(() =>
  import("./catalogo/admin.catalogo.page.v3").then((m) => ({
    default: m.AdminCatalogV3,
  })),
);
const Products = lazy(() =>
  import("./productos/admin.productos.v1").then((m) => ({
    default: m.AdminProductsV1,
  })),
);
const Groups = lazy(() =>
  import("./grupos/admin.grupos.v2").then((m) => ({
    default: m.AdminGroupsV2,
  })),
);
const Incidents = lazy(() =>
  import("./incidencias/admin.incidencias.v2").then((m) => ({
    default: m.AdminIncidentsV2,
  })),
);
const Devices = lazy(() =>
  import("./dispositivos/admin.dispositivos.v2").then((m) => ({
    default: m.AdminDevicesV2,
  })),
);
type NavigationItem = readonly [AdminRoute, string, LucideIcon];
const navigationGroups: ReadonlyArray<{ label: string; items: readonly NavigationItem[] }> = [
  { label: "OPERACIÓN", items: [
    ["/admin", "Dashboard", LayoutDashboard],
    ["/admin/control", "Control", ScanSearch],
    ["/admin/incidencias", "Incidencias", TriangleAlert],
  ] },
  { label: "INVENTARIO", items: [
    ["/admin/catalogo", "Catálogo", BookOpenCheck],
    ["/admin/productos", "Productos", PackageSearch],
    ["/admin/grupos", "Grupos", Layers],
  ] },
  { label: "SISTEMA", items: [
    ["/admin/dispositivos", "Dispositivos", Tablet],
  ] },
];
const navigation = navigationGroups.flatMap((group) => group.items);

function Shell({
  route,
  onLogout,
}: {
  route: AdminRoute;
  onLogout: () => void;
}) {
  const store = useAdminStore();
  const bootstrap = useAdminQuery("bootstrap", {});
  const [collapsed, setCollapsed] = useState(false);
  const logout = () => {
    store.dispose();
    onLogout();
  };
  if (!bootstrap.data || !store.bootstrap)
    return (
      <section className="notice" role="status">
        <h1>Administración</h1>
        <p>{bootstrap.error ?? "Validando acceso administrativo…"}</p>
        {bootstrap.error && (
          <button className="button" onClick={bootstrap.retry}>
            Reintentar
          </button>
        )}
        <button className="button button--secondary" onClick={logout}>
          Cerrar sesión
        </button>
      </section>
    );
  return (
    <main
      className={`admin-workspace admin-v2-workspace${collapsed ? " admin-workspace--collapsed" : ""}`}
    >
      <aside className="admin-sidebar" aria-label="Navegación administrativa">
        <div className="admin-sidebar__brand">
          <img
            className={`admin-sidebar__logo${collapsed ? " admin-sidebar__logo--compact" : ""}`}
            src={collapsed ? "/favicon-48x48.png" : "/Logo_SOLOG.png"}
            alt="SOLOG"
          />
        </div>
        <div className="admin-sidebar__account">
          {!collapsed && (
            <span className="admin-sidebar__account-copy">
              <strong>{bootstrap.data.identity.nombre}</strong>
              <small>{bootstrap.data.identity.rol}</small>
            </span>
          )}
          <button
            className="icon-button"
            aria-label="Cerrar sesión"
            title={`Cerrar sesión de ${bootstrap.data.identity.nombre}`}
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
        <nav className="admin-main-tabs" aria-label="Módulos administrativos">
          {navigationGroups.map((group) => (
            <div className="admin-main-tabs__group" key={group.label}>
              <span className="admin-main-tabs__label">{group.label}</span>
              {group.items.map(([path, label, Icon]) => (
                  <button
                    key={path}
                    className={
                      "admin-tab" + (route === path ? " admin-tab--active" : "")
                    }
                    aria-label={label}
                    title={collapsed ? label : undefined}
                    aria-current={route === path ? "page" : undefined}
                    onClick={() => navigateTo(path)}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <PaletteSwitcher collapsed={collapsed} variant="sidebar" />
          <button
            className="admin-sidebar__collapse"
            aria-label="Alternar navegación"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span>Contraer menú</span>
          </button>
        </div>
      </aside>
      <section className="admin-workspace__main">
        <header className="admin-header">
          <h1>{navigation.find(([path]) => path === route)?.[1]}</h1>
          {route === "/admin/control" ? (
            <div
              className="admin-site-context"
              role="group"
              aria-label="Sede administrativa"
            >
              {orderedAdminSites(bootstrap.data.allowed_sites).map((site) => (
                <button
                  type="button"
                  key={site.id}
                  aria-pressed={store.siteId === site.id}
                  onClick={() => store.selectSite(site.id)}
                >
                  {adminSiteLabel(site.nombre)}
                </button>
              ))}
            </div>
          ) : (
            <img className="admin-header__context-logo" src="/logo-pr-light.png" alt="Puerto Rico" />
          )}
        </header>
        <div className="admin-workspace__content">
          <Suspense fallback={<PanelLoader contained />}>
            {route === "/admin" ? (
              <Dashboard />
            ) : route === "/admin/control" ? (
              <Control />
            ) : route === "/admin/catalogo" ? (
              <Catalog />
            ) : route === "/admin/productos" ? (
              <Products />
            ) : route === "/admin/grupos" ? (
              <Groups />
            ) : route === "/admin/incidencias" ? (
              <Incidents />
            ) : (
              <Devices />
            )}
          </Suspense>
        </div>
      </section>
    </main>
  );
}
export function AdminV2App(props: {
  userId: string;
  route: AdminRoute;
  onLogout: () => void;
}) {
  const [store, setStore] = useState(() => new AdminStore(props.userId));
  useEffect(() => {
    // StrictMode repeats setup/cleanup; never revive a disposed scope.
    let active = true;
    if (!store.current())
      queueMicrotask(() => {
        if (active) setStore(new AdminStore(props.userId));
      });
    return () => {
      active = false;
      store.dispose();
    };
  }, [props.userId, store]);
  return (
    <AdminV2Context.Provider value={store}>
      <Shell {...props} />
    </AdminV2Context.Provider>
  );
}
