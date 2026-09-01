import {
  CalendarClock,
  ClipboardList,
  History,
  Home,
  LogOut,
  SearchCheck,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { navigateTo } from '../../../lib/router'
import type { SologOperationalBootstrap } from '../types'
import {
  formatCajeroClock,
  formatCajeroElapsed,
  getCajeroStockPresentation,
  useCajeroServerClock,
} from './cajero.stock'
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
  bootstrap,
  serverOffsetMs,
  sede,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  serverOffsetMs: number
  sede: string
  onLogout: () => void
}) {
  const [stockOpen, setStockOpen] = useState(false)
  const stockControlRef = useRef<HTMLDivElement>(null)
  const now = useCajeroServerClock(serverOffsetMs)
  const presentation = getCajeroStockPresentation(
    bootstrap.stock,
    bootstrap.sesion_activa,
    now,
  )

  useEffect(() => {
    if (!stockOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!stockControlRef.current?.contains(event.target as Node)) {
        setStockOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStockOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [stockOpen])

  const stockExpiresAt = formatCajeroClock(presentation.stockExpiresAtMs)
  const sessionExpiresAt = formatCajeroClock(presentation.sessionExpiresAtMs)

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
        <div className="cajero-header__actions">
          <div className="cajero-stock-indicator" ref={stockControlRef}>
            <button
              aria-expanded={stockOpen}
              aria-haspopup="dialog"
              className={`cajero-stock-indicator__trigger cajero-stock-indicator__trigger--${presentation.state}`}
              onClick={() => setStockOpen((current) => !current)}
              type="button"
            >
              {presentation.countdown ? (
                <strong>{presentation.countdown}</strong>
              ) : (
                <>
                  <span aria-hidden="true" className="cajero-stock-indicator__dot" />
                  <span>{presentation.label}</span>
                </>
              )}
            </button>
            {stockOpen ? (
              <section
                aria-label="Estado del inventario"
                className="cajero-stock-indicator__popover"
                role="dialog"
              >
                <strong>
                  {presentation.state === 'countdown'
                    ? 'La sesión está por finalizar'
                    : presentation.label}
                </strong>
                {presentation.state === 'expired' ? (
                  <p>Actualiza el inventario desde ConeXion para iniciar un nuevo conteo.</p>
                ) : presentation.state === 'countdown' ? (
                  <>
                    <p>Se cerrará automáticamente antes de que venza el stock.</p>
                    <p>Los conteos ya registrados se sincronizarán normalmente.</p>
                  </>
                ) : (
                  <dl>
                    <div><dt>Estado del inventario</dt><dd>{formatCajeroElapsed(presentation.elapsedMs)}</dd></div>
                    {stockExpiresAt ? <div><dt>Vigente hasta</dt><dd>{stockExpiresAt}</dd></div> : null}
                    {bootstrap.sesion_activa && sessionExpiresAt ? (
                      <div><dt>Sesión hasta</dt><dd>{sessionExpiresAt}</dd></div>
                    ) : null}
                  </dl>
                )}
              </section>
            ) : null}
          </div>
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
