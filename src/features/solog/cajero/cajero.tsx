import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useEffect } from 'react'
import { replaceRoute } from '../../../lib/router'
import type { CashierBootstrap } from './cajero.v2'
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
import { formatCajeroClock } from './cajero.stock'

const BLOCK_MESSAGES: Record<CajeroBlockReason, { title: string; detail: string }> = {
  expired: {
    title: 'La sesión de conteo venció.',
    detail: 'Terminó el plazo de recuperación. Los borradores no enviados se descartan; los registros confirmados permanecen guardados. Una operación de resultado incierto se conserva para conciliación, sin volver a enviarla.',
  },
  recovery: {
    title: 'Sesión en recuperación.',
    detail: 'El tiempo de captura terminó. No puedes registrar nuevos conteos.',
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
  bootstrap: CashierBootstrap
  route: CajeroRoute
  onLogout: () => Promise<void>
}) {
  const session = useCajeroSession(onLogout)

  useEffect(() => {
    if (!isCajeroRouteAvailable(route, session.periodComplete)) {
      replaceRoute('/cajero')
    }
  }, [route, session.periodComplete])

  const blockMessage = session.blockReason
    ? BLOCK_MESSAGES[session.blockReason]
    : null

  return (
    <div className="cajero-shell">
      <CajeroHeader
        bootstrap={bootstrap}
        onLogout={() => void session.logoutSafely()}
        serverOffsetMs={session.serverOffsetMs}
        sede={bootstrap.site.nombre}
      />
      <main className="cajero-main">
        {blockMessage ? (
          <div className="cajero-alert cajero-alert--warning" role="alert">
            <AlertTriangle aria-hidden="true" size={22} />
            <div>
              <strong>{blockMessage.title}</strong>
              <p>{blockMessage.detail}{session.effectiveMode === 'recovery' && session.recoveryUntil
                ? ` Envía tus conteos pendientes antes de ${formatCajeroClock(Date.parse(session.recoveryUntil))}.` : ''}</p>
            </div>
            {session.pendingIntent ? (
              <button
                className="button button--secondary"
                disabled={session.sending || !session.canDeliver}
                onClick={() => void session.retrySend()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={18} /> Reintentar envío
              </button>
            ) : null}
          </div>
        ) : null}
        {session.needsCapabilityRefresh || session.effectiveMode === 'expired' ? (
          <div className="cajero-alert cajero-alert--warning" role="status">
            <p>{session.needsCapabilityRefresh ? 'El conteo fue iniciado. Falta confirmar su capacidad de captura.' : 'Consulta el estado actual antes de iniciar otro conteo.'}</p>
            <button className="button button--secondary" type="button" disabled={session.sending}
              onClick={() => void session.refresh()}>Consultar estado de sesión</button>
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
        periodComplete={session.periodComplete}
        route={route}
      />
    </div>
  )
}
