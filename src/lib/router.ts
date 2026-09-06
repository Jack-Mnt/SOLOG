import { useSyncExternalStore } from 'react'
import type { CajeroRoute } from '../features/solog/cajero/cajero.types'

export type AdminRoute =
  | '/admin'
  | '/admin/control'
  | '/admin/incidencias'
  | '/admin/catalogo'
  | '/admin/grupos'
  | '/admin/dispositivos'

export type AppRoute = '/login' | '/' | '/detalles' | CajeroRoute | AdminRoute

export const ADMIN_ROUTES: AdminRoute[] = [
  '/admin',
  '/admin/control',
  '/admin/incidencias',
  '/admin/catalogo',
  '/admin/grupos',
  '/admin/dispositivos',
]

export const CASHIER_ROUTES: CajeroRoute[] = [
  '/cajero',
  '/cajero/conteo',
  '/cajero/diario',
  '/cajero/revisar',
  '/cajero/historial',
]

export function isAdminRoute(pathname: string): pathname is AdminRoute {
  return ADMIN_ROUTES.includes(pathname as AdminRoute)
}

export function isCashierRoute(pathname: string): pathname is CajeroRoute {
  return CASHIER_ROUTES.includes(pathname as CajeroRoute)
}

const NAVIGATION_EVENT = 'solog:navigation'

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
