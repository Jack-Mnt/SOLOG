import { useSyncExternalStore } from 'react'
import type { SologOperationalBootstrap } from '../features/solog/types'

export type AdminRoute =
  | '/admin'
  | '/admin/control'
  | '/admin/incidencias'
  | '/admin/catalogo'
  | '/admin/grupos'
  | '/admin/dispositivos'

export type AppRoute =
  | '/login'
  | '/'
  | '/cajero'
  | '/device-pending'
  | '/count'
  | AdminRoute

export const ADMIN_ROUTES: AdminRoute[] = [
  '/admin',
  '/admin/control',
  '/admin/incidencias',
  '/admin/catalogo',
  '/admin/grupos',
  '/admin/dispositivos',
]

export function isAdminRoute(pathname: string): pathname is AdminRoute {
  return ADMIN_ROUTES.includes(pathname as AdminRoute)
}

const NAVIGATION_EVENT = 'solog:navigation'

export function resolveTrustedRoute(
  bootstrap: SologOperationalBootstrap,
  requestedPath: string,
): AppRoute {
  if (
    bootstrap.usuario.rol === 'admin' ||
    bootstrap.usuario.rol === 'moderador'
  ) {
    if (requestedPath === '/admin/conteos') return '/admin'
    if (
      requestedPath === '/admin/diferencias' ||
      requestedPath === '/admin/historial' ||
      requestedPath === '/admin/ajuste-pos'
    ) {
      return '/admin/control'
    }
    return isAdminRoute(requestedPath) ? requestedPath : '/admin'
  }

  const deviceAuthorized =
    bootstrap.dispositivo.autorizado &&
    bootstrap.dispositivo.estado === 'autorizado'

  if (!deviceAuthorized) return '/device-pending'
  if (requestedPath === '/count' && bootstrap.sesion_activa) return '/count'
  return '/cajero'
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(NAVIGATION_EVENT, onStoreChange)

  return () => {
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(NAVIGATION_EVENT, onStoreChange)
  }
}

function getPathname() {
  return window.location.pathname
}

function getServerPathname() {
  return '/'
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname, getServerPathname)
}

export function replaceRoute(route: AppRoute): void {
  if (window.location.pathname === route && !window.location.search) return
  window.history.replaceState(null, '', route)
  window.dispatchEvent(new Event(NAVIGATION_EVENT))
}

export function navigateTo(url: string): void {
  if (`${window.location.pathname}${window.location.search}` === url) return
  window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(NAVIGATION_EVENT))
}
