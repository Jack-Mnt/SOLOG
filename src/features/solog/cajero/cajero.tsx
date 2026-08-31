import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useEffect } from 'react'
import { replaceRoute } from '../../../lib/router'
import type { SologOperationalBootstrap } from '../types'
import { CajeroConteo } from './cajero.conteo'
import { CajeroDiario } from './cajero.diario'
import { CajeroBottomNavigation, CajeroHeader } from './cajero.header'
import { CajeroHistorial } from './cajero.historial'
import { CajeroInicio } from './cajero.inicio'
import { CajeroRevisar } from './cajero.revisar'
import {
  useCajeroSession,
  type CajeroBlockReason,
} from './cajero.session'
import type { CajeroRoute } from './cajero.types'
import { isCajeroRouteAvailable } from './cajero.utils'

const BLOCK_MESSAGES: Record<CajeroBlockReason, { title: string; detail: string }> = {
  expired: {
    title: 'La sesión de conteo venció.',
    detail: 'No registres nuevas capturas. Puedes intentar enviar los pendientes con su sesión y fecha originales.',
  },
  inactive: {
    title: 'La sesión se bloqueó por inactividad.',
    detail: 'Los conteos locales se conservan hasta confirmar su envío.',
  },
  stock_unavailable: {
    title: 'La actualización de stock ya no está disponible.',
    detail: 'No se permiten nuevas capturas con esta referencia.',
  },
}

export function Cajero({
  bootstrap,
  route,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  route: CajeroRoute
  onLogout: () => Promise<void>
}) {
  const session = useCajeroSession(onLogout)

  useEffect(() => {
    void session.checkFreshness()
    // La ruta es el disparador explícito de entrada a vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  useEffect(() => {
    if (!isCajeroRouteAvailable(route, session.fortnightComplete)) {
      replaceRoute('/cajero')
    }
  }, [route, session.fortnightComplete])

  const blockMessage = session.blockReason
    ? BLOCK_MESSAGES[session.blockReason]
    : null

  return (
    <div className="cajero-shell">
      <CajeroHeader
        onLogout={() => void session.logoutSafely()}
        sede={bootstrap.sede.nombre}
      />
      <main className="cajero-main">
        {blockMessage ? (
          <div className="cajero-alert cajero-alert--warning" role="alert">
            <AlertTriangle aria-hidden="true" size={22} />
            <div>
              <strong>{blockMessage.title}</strong>
              <p>{blockMessage.detail}</p>
            </div>
            {session.pendingCount > 0 ? (
              <button
                className="button button--secondary"
                disabled={session.sending}
                onClick={() => void session.retrySend()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={18} /> Reintentar envío
              </button>
            ) : null}
          </div>
        ) : null}
        {session.error ? (
          <div className="cajero-alert cajero-alert--error" role="alert">
            <AlertTriangle aria-hidden="true" size={22} />
            <p>{session.error}</p>
            <button
              aria-label="Cerrar mensaje"
              className="cajero-alert__dismiss"
              onClick={session.clearError}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}
        {route === '/cajero' ? (
          <CajeroInicio bootstrap={bootstrap} session={session} />
        ) : route === '/cajero/conteo' ? (
          <CajeroConteo bootstrap={bootstrap} session={session} />
        ) : route === '/cajero/diario' ? (
          <CajeroDiario session={session} />
        ) : route === '/cajero/revisar' ? (
          <CajeroRevisar session={session} />
        ) : (
          <CajeroHistorial session={session} />
        )}
      </main>
      <CajeroBottomNavigation
        fortnightComplete={session.fortnightComplete}
        route={route}
      />
    </div>
  )
}
