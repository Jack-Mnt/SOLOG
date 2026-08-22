import {
  BookOpenCheck,
  Boxes,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  SlidersHorizontal,
  TabletSmartphone,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { PaletteSwitcher } from "../../theme/PaletteSwitcher";
import { navigateTo, type AdminRoute, usePathname } from "../../../lib/router";
import { useSolog } from "../SologContext";
import type { SologOperationalBootstrap } from "../types";
import { AdminLayoutContext } from "./AdminLayoutContext";
import { useAdminSolog } from "./useAdminSolog";

const SIDEBAR_STORAGE_KEY = "solog:admin-sidebar-collapsed";

const ADMIN_NAVIGATION: Array<{
  route: AdminRoute;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    route: "/admin",
    label: "Dashboard",
    description: "Visión general de la operación",
    icon: LayoutDashboard,
  },
  {
    route: "/admin/conteos",
    label: "Conteos",
    description: "Sesiones y resultados de conteo",
    icon: ListChecks,
  },
  {
    route: "/admin/control",
    label: "Control",
    description: "Seguimiento y trazabilidad del inventario",
    icon: ScanSearch,
  },
  {
    route: "/admin/ajuste-pos",
    label: "Ajuste POS",
    description: "Ajustes operativos del punto de venta",
    icon: SlidersHorizontal,
  },
  {
    route: "/admin/incidencias",
    label: "Incidencias",
    description: "Eventos operativos que requieren revisión",
    icon: TriangleAlert,
  },
  {
    route: "/admin/catalogo",
    label: "Catálogo",
    description: "Cambios y versiones del catálogo",
    icon: BookOpenCheck,
  },
  {
    route: "/admin/dispositivos",
    label: "Dispositivos",
    description: "Tablets autorizadas y solicitudes",
    icon: TabletSmartphone,
  },
];

function getInitialSidebarState(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AdminLayout({
  bootstrap,
  children,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap;
  children: ReactNode;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const solog = useSolog();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    getInitialSidebarState,
  );
  const currentModule =
    ADMIN_NAVIGATION.find((item) => item.route === pathname) ??
    ADMIN_NAVIGATION[0];
  const hasAdminRole =
    bootstrap.usuario.rol === "admin" || bootstrap.usuario.rol === "moderador";
  const admin = useAdminSolog({
    enabled: hasAdminRole,
    refreshOperationalState: solog.refresh,
  });
  const userName = admin.bootstrap?.usuario.nombre ?? bootstrap.usuario.nombre;
  const userRole = admin.bootstrap?.usuario.rol ?? bootstrap.usuario.rol;

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // La preferencia visual es opcional; la navegación sigue funcionando.
      }
      return next;
    });
  };

  return (
    <main
      className={`admin-workspace${sidebarCollapsed ? " admin-workspace--collapsed" : ""}`}
    >
      <aside className="admin-sidebar" aria-label="Navegación administrativa">
        <div className="admin-sidebar__brand" aria-label="SOLOG Administración">
          <span className="admin-sidebar__mark" aria-hidden="true">
            <Boxes size={22} strokeWidth={2.25} />
          </span>
          <span className="admin-sidebar__brand-copy">
            <strong>SOLOG</strong>
            <small>Administración</small>
          </span>
        </div>
        <div className="admin-sidebar__account">
          {sidebarCollapsed ? (
            <details className="admin-sidebar__popover admin-sidebar__account-popover">
              <summary
                aria-label={`Cuenta de ${userName}, ${userRole}`}
                title={`${userName} · ${userRole}`}
              >
                <UserRound aria-hidden="true" size={18} />
              </summary>
              <div className="admin-sidebar__popover-panel admin-sidebar__account-menu">
                <div>
                  <strong>{userName}</strong>
                  <small>{userRole}</small>
                </div>
                <button onClick={onLogout} type="button">
                  <LogOut aria-hidden="true" size={17} />
                  Cerrar sesión
                </button>
              </div>
            </details>
          ) : (
            <>
              <span className="admin-sidebar__avatar" aria-hidden="true">
                <UserRound size={20} />
              </span>
              <span className="admin-sidebar__account-copy">
                <strong>{userName}</strong>
              </span>
              <button
                aria-label="Cerrar sesión"
                className="admin-sidebar__logout"
                onClick={onLogout}
                title="Cerrar sesión"
                type="button"
              >
                <LogOut aria-hidden="true" size={17} />
              </button>
            </>
          )}
        </div>
        <nav className="admin-main-tabs" aria-label="Módulos administrativos">
          {ADMIN_NAVIGATION.map((item) => {
            const ItemIcon = item.icon;
            const active = pathname === item.route;
            return (
              <button
                aria-current={active ? "page" : undefined}
                aria-label={sidebarCollapsed ? item.label : undefined}
                className={`admin-tab${active ? " admin-tab--active" : ""}`}
                key={item.route}
                onClick={() => navigateTo(item.route)}
                title={sidebarCollapsed ? item.label : undefined}
                type="button"
              >
                <ItemIcon aria-hidden="true" size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="admin-sidebar__footer">
          <PaletteSwitcher collapsed={sidebarCollapsed} variant="sidebar" />
          <button
            aria-label={
              sidebarCollapsed
                ? "Expandir navegación administrativa"
                : "Contraer navegación administrativa"
            }
            className="admin-sidebar__collapse"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            type="button"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
            <span>Contraer menú</span>
          </button>
        </div>
      </aside>

      <section
        className="admin-workspace__main"
        aria-labelledby="admin-module-title"
      >
        <header className="admin-header">
          <div className="admin-header__identity">
            <div>
              <h1 id="admin-module-title">{currentModule.label}</h1>
              <p>{currentModule.description}</p>
            </div>
          </div>
        </header>

        <div className="admin-workspace__content">
          {admin.error ? (
            <div className="notice notice--error admin-message" role="alert">
              <strong>No se pudo completar la operación</strong>
              <p>{admin.error}</p>
            </div>
          ) : null}
          {admin.notice ? (
            <div className="notice notice--success" role="status">
              <strong>{admin.notice}</strong>
              <button
                className="text-button"
                onClick={admin.dismissNotice}
                type="button"
              >
                Cerrar
              </button>
            </div>
          ) : null}
          {admin.status === "loading" && !admin.bootstrap ? (
            <div className="notice" role="status">
              <strong>Cargando administración…</strong>
              <p>Consultando sedes, cobertura y dispositivos.</p>
            </div>
          ) : null}
          {admin.status === "error" && !admin.bootstrap ? (
            <button
              className="button"
              onClick={() => void admin.refresh()}
              type="button"
            >
              Reintentar
            </button>
          ) : null}
          {admin.bootstrap ? (
            <AdminLayoutContext.Provider
              value={{
                operationalBootstrap: bootstrap,
                admin,
                refreshOperationalState: solog.refresh,
              }}
            >
              <div className="admin-content">{children}</div>
            </AdminLayoutContext.Provider>
          ) : null}
        </div>
      </section>
    </main>
  );
}
