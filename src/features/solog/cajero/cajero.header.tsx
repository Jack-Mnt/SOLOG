import {
  CalendarClock,
  ClipboardList,
  History,
  Home,
  LogOut,
  SearchCheck,
} from 'lucide-react'
import { navigateTo } from '../../../lib/router'
import type { CajeroRoute } from './cajero.types'
import { isCajeroRouteAvailable } from './cajero.utils'

const NAVIGATION: Array<{
  route: CajeroRoute
  label: string
  icon: typeof Home
}> = [
  { route: '/cajero', label: 'Inicio', icon: Home },
  { route: '/cajero/conteo', label: 'Conteo', icon: ClipboardList },
  { route: '/cajero/diario', label: 'Conteo diario', icon: CalendarClock },
  { route: '/cajero/revisar', label: 'Revisar', icon: SearchCheck },
  { route: '/cajero/historial', label: 'Historial', icon: History },
]

export function CajeroHeader({
  sede,
  onLogout,
}: {
  sede: string
  onLogout: () => void
}) {
  return (
    <header className="cajero-header">
      <div className="cajero-header__topline">
        <button
          aria-label="Ir a Inicio"
          className="cajero-header__brand"
          onClick={() => navigateTo('/cajero')}
          type="button"
        >
          <img alt="SOLOG" src="/Logo_SOLOG.png" />
        </button>
        <strong className="cajero-header__site">PR {sede}</strong>
        <button
          aria-label="Cerrar sesión"
          className="cajero-header__logout"
          onClick={onLogout}
          title="Cerrar sesión"
          type="button"
        >
          <LogOut aria-hidden="true" size={21} />
          <span>Salir</span>
        </button>
      </div>
    </header>
  )
}

export function CajeroBottomNavigation({
  route,
  periodComplete,
}: {
  route: CajeroRoute
  periodComplete: boolean
}) {
  const navigation = NAVIGATION.filter((item) =>
    isCajeroRouteAvailable(item.route, periodComplete),
  )

  return (
    <nav aria-label="Panel Cajero" className="cajero-nav">
      <div className="cajero-nav__inner">
        {navigation.map((item) => {
          const Icon = item.icon
          const active = route === item.route
          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={active ? 'cajero-nav__item is-active' : 'cajero-nav__item'}
              key={item.route}
              onClick={() => navigateTo(item.route)}
              type="button"
            >
              <Icon aria-hidden="true" size={22} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
