import { useSyncExternalStore } from 'react'

export type AppRoute = '/login' | '/' | '/device-pending' | '/count' | '/admin'

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
