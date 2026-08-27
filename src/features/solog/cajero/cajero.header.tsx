import {
  ClipboardList,
  History,
  Home,
  LogOut,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { PaletteSwitcher } from '../../theme/PaletteSwitcher'
import { navigateTo } from '../../../lib/router'
import type { CajeroRoute } from './cajero.types'

const NAVIGATION: Array<{
  route: CajeroRoute
  label: string
  icon: typeof Home
}> = [
  { route: '/cajero', label: 'Inicio', icon: Home },
  { route: '/cajero/conteo', label: 'Conteo', icon: ClipboardList },
  { route: '/cajero/seguimiento', label: 'Por verificar', icon: ShieldCheck },
  { route: '/cajero/historial', label: 'Historial', icon: History },
]

export function CajeroHeader({
  route,
  sede,
  pendingCount,
  sending,
  onSend,
  onLogout,
}: {
  route: CajeroRoute
  sede: string
  pendingCount: number
  sending: boolean
  onSend: () => void
  onLogout: () => void
}) {
  return (
    <header className="cajero-header">
      <div className="cajero-header__topline">
        <button
          className="cajero-header__brand"
          onClick={() => navigateTo('/cajero')}
          type="button"
        >
          <img alt="SOLOG" src="/Logo_SOLOG.png" />
        </button>
        <div className="cajero-header__site">
          <span>Sede</span>
          <strong>{sede}</strong>
        </div>
        <div className="cajero-header__actions">
          {pendingCount > 0 ? (
            <span className="cajero-header__pending" role="status">
              {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
            </span>
          ) : null}
          <button
            className="button cajero-header__send"
            disabled={pendingCount === 0 || sending}
            onClick={onSend}
            type="button"
          >
            {sending ? (
              <RefreshCw aria-hidden="true" className="spin" size={19} />
            ) : (
              <Send aria-hidden="true" size={19} />
            )}
            {sending ? 'Enviando…' : 'Enviar conteo'}
          </button>
          <PaletteSwitcher />
          <button
            aria-label="Cerrar sesión"
            className="cajero-header__icon-button"
            onClick={onLogout}
            title="Cerrar sesión"
            type="button"
          >
            <LogOut aria-hidden="true" size={20} />
          </button>
        </div>
      </div>
      <nav aria-label="Panel Cajero" className="cajero-nav">
        {NAVIGATION.map((item) => {
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
              <Icon aria-hidden="true" size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}