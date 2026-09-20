import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { PanelLoader } from "../../../components/panel-loader";
import { navigateTo, type AdminRoute } from "../../../lib/router";
import { PaletteSwitcher } from "../../theme/palette-switcher";
import { AdminStore } from "./admin.v2.store";
import { adminSiteLabel, orderedAdminSites } from "./admin.site-ui";
import { IconButton } from "./admin.primitives";
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

type AdminViewportMode = "desktop" | "tablet" | "mobile";

function getAdminViewportMode(): AdminViewportMode {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
  if (window.matchMedia("(max-width: 1023px)").matches) return "tablet";
  return "desktop";
}

function useAdminViewportMode() {
  const [mode, setMode] = useState<AdminViewportMode>(getAdminViewportMode);

  useEffect(() => {
    const tablet = window.matchMedia("(max-width: 1023px)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const sync = () => setMode(getAdminViewportMode());

    tablet.addEventListener("change", sync);
    mobile.addEventListener("change", sync);
    return () => {
      tablet.removeEventListener("change", sync);
      mobile.removeEventListener("change", sync);
    };
  }, []);

  return mode;
}

function Shell({
  route,
  onLogout,
}: {
  route: AdminRoute;
  onLogout: () => void;
}) {
  const store = useAdminStore();
  const bootstrap = useAdminQuery("bootstrap", {});
  const viewportMode = useAdminViewportMode();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousRouteRef = useRef(route);
  const sidebarCollapsed =
    viewportMode === "tablet" || (viewportMode === "desktop" && collapsed);

  const restoreDrawerTriggerFocus = useCallback(() => {
    requestAnimationFrame(() => drawerTriggerRef.current?.focus());
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    restoreDrawerTriggerFocus();
  }, [restoreDrawerTriggerFocus]);
  const navigateFromSidebar = useCallback(
    (path: AdminRoute) => {
      if (viewportMode === "mobile") closeDrawer();
      navigateTo(path);
    },
    [closeDrawer, viewportMode],
  );

  useEffect(() => {
    const tablet = window.matchMedia("(max-width: 1023px)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const closeWhenLeavingMobile = () => {
      if (getAdminViewportMode() !== "mobile") setDrawerOpen(false);
    };

    tablet.addEventListener("change", closeWhenLeavingMobile);
    mobile.addEventListener("change", closeWhenLeavingMobile);
    return () => {
      tablet.removeEventListener("change", closeWhenLeavingMobile);
      mobile.removeEventListener("change", closeWhenLeavingMobile);
    };
  }, []);

  useEffect(() => {
    if (viewportMode !== "mobile" || !drawerOpen) return;
    const frame = requestAnimationFrame(() => {
      drawerRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.focus();
    });
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [drawerOpen, viewportMode]);

  useEffect(() => {
    if (viewportMode !== "mobile" || !drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, drawerOpen, viewportMode]);

  useEffect(() => {
    const routeChanged = previousRouteRef.current !== route;
    previousRouteRef.current = route;
    if (routeChanged && viewportMode === "mobile" && drawerOpen) closeDrawer();
  }, [closeDrawer, drawerOpen, route, viewportMode]);

  const logout = () => {
    store.dispose();
    onLogout();
  };
  if (!bootstrap.data || !store.bootstrap) {
    if (!bootstrap.error) return <PanelLoader />;

    return (
      <PanelLoader
        state="error"
        description={bootstrap.error}
        actions={
          <>
            <button className="button" onClick={bootstrap.retry}>
              <RotateCcw size={16} aria-hidden="true" />
              Reintentar
            </button>
            <button className="button button--secondary" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              Cerrar sesión
            </button>
          </>
        }
      />
    );
  }
  const sites = orderedAdminSites(bootstrap.data.allowed_sites);
  return (
    <main
      className={`admin-workspace admin-v2-workspace admin-workspace--${viewportMode}${sidebarCollapsed ? " admin-workspace--collapsed" : ""}${viewportMode === "mobile" && drawerOpen ? " admin-workspace--drawer-open" : ""}`}
      data-admin-viewport={viewportMode}
    >
      {viewportMode === "mobile" && (
        <button
          type="button"
          className="admin-sidebar-drawer__backdrop"
          aria-label="Cerrar navegación"
          aria-hidden={!drawerOpen}
          tabIndex={drawerOpen ? 0 : -1}
          onClick={closeDrawer}
        />
      )}
      <aside
        ref={drawerRef}
        id="admin-mobile-drawer"
        className="admin-sidebar"
        aria-label="Navegación administrativa"
        aria-hidden={viewportMode === "mobile" ? !drawerOpen : undefined}
      >
        <div className="admin-sidebar__brand">
          <img
            className={`admin-sidebar__logo${sidebarCollapsed ? " admin-sidebar__logo--compact" : ""}`}
            src={sidebarCollapsed ? "/favicon-48x48.png" : "/Logo_SOLOG.png"}
            alt="SOLOG"
          />
        </div>
        <div className="admin-sidebar__account">
          {!sidebarCollapsed && (
            <span className="admin-sidebar__account-copy">
              <strong>{bootstrap.data.identity.nombre}</strong>
              <small>{bootstrap.data.identity.rol}</small>
            </span>
          )}
          <IconButton
            aria-label="Cerrar sesión"
            title={`Cerrar sesión de ${bootstrap.data.identity.nombre}`}
            onClick={logout}
          >
            <LogOut size={18} />
          </IconButton>
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
                    title={sidebarCollapsed ? label : undefined}
                    aria-current={route === path ? "page" : undefined}
                    onClick={() => navigateFromSidebar(path)}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <PaletteSwitcher collapsed={sidebarCollapsed} variant="sidebar" />
          {viewportMode === "desktop" && (
            <button
              className="admin-sidebar__collapse"
              aria-label="Alternar navegación"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              <span>Contraer menú</span>
            </button>
          )}
        </div>
      </aside>
      <section className="admin-workspace__main">
        <header className="admin-header">
          {viewportMode === "mobile" && (
            <button
              ref={drawerTriggerRef}
              type="button"
              className="admin-drawer-trigger"
              aria-label={
                drawerOpen
                  ? "Cerrar menú administrativo"
                  : "Abrir menú administrativo"
              }
              aria-controls="admin-mobile-drawer"
              aria-expanded={drawerOpen}
              onClick={() => (drawerOpen ? closeDrawer() : setDrawerOpen(true))}
            >
              <img src="/favicon-48x48.png" alt="" aria-hidden="true" />
            </button>
          )}
          <h1>{navigation.find(([path]) => path === route)?.[1]}</h1>
          {["/admin/control", "/admin/incidencias"].includes(route) ? (
            <div className="admin-site-context" aria-label="Sede administrativa">
              <div className="admin-site-context__desktop" role="group" aria-label="Sede administrativa">
                {sites.map((site) => (
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
              <select
                className="admin-site-context__select"
                aria-label="Sede administrativa"
                value={store.siteId}
                onChange={(event) => store.selectSite(event.target.value)}
              >
                {sites.map((site) => <option key={site.id} value={site.id}>{adminSiteLabel(site.nombre)}</option>)}
              </select>
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