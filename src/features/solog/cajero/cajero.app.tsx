import '../../../operational.css'
import { useEffect, useRef, useState } from 'react'
import { PanelLoader } from '../../../components/panel-loader'
import { supabase } from '../../../lib/supabase'
import { getOrCreateDeviceToken } from '../device'
import { FullRuntime, type FullLock, type FullRpc } from './full.runtime'
import {
  getCashierInstanceCoordinator, type CashierInstanceHandle,
  type CashierInstanceState,
} from './cajero.instance'
import { FullCashierPanel } from './full.app'
import { fetchCashierHistory } from './cajero.history'

const call: FullRpc = async (name, args) => {
  if (!supabase) throw new Error('Falta configurar la conexión de SOLOG.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

function Owner({ userId, onLogout, handle }: {
  userId: string
  onLogout: () => Promise<void>
  handle: CashierInstanceHandle
}) {
  const [{ runtime, error }] = useState(() => {
    try {
      // No obtener token ni leer journal antes de adquirir la tenencia exclusiva.
      const deviceToken = getOrCreateDeviceToken()
      const transactionKey = `solog.full2.${userId}.${deviceToken}`
      const transactionLock: FullLock = async run => {
        if (!navigator.locks) throw new Error('FULL_BROWSER_LOCK_REQUIRED')
        return navigator.locks.request(transactionKey, run)
      }
      const guarded = handle.bindRuntime(transactionLock, call)
      return {
        runtime: new FullRuntime(userId, deviceToken, window.localStorage, guarded.rpc, { lock: guarded.lock }),
        error: null,
      }
    } catch (error) {
      return { runtime: null, error }
    }
  })
  if (!runtime) {
    return <PanelLoader
      state="error"
      title="No se pudo abrir el almacenamiento de conteos"
      description={error instanceof Error ? error.message : 'Revisa el almacenamiento local del navegador.'}
      actions={<button type="button" className="button" onClick={() => void onLogout()}>Cerrar sesión</button>}
    />
  }
  return <FullCashierPanel runtime={runtime} onLogout={onLogout} loadHistory={fetchCashierHistory}/>
}

type GateView = CashierInstanceState & {
  userId: string
  generation: number
  handle: CashierInstanceHandle | null
}

function CashierInstanceGate({ userId, onLogout }: {
  userId: string
  onLogout: () => Promise<void>
}) {
  const [coordinator] = useState(getCashierInstanceCoordinator)
  const generation = useRef(0)
  const [view, setView] = useState<GateView>({
    userId, generation: 0, status: 'checking', error: null, handle: null,
  })

  useEffect(() => {
    let connected = true
    let handle: CashierInstanceHandle | null = null
    const currentGeneration = ++generation.current
    const update = (state: CashierInstanceState) => {
      if (!connected) return
      setView({
        ...state, userId, generation: currentGeneration,
        handle: state.status === 'owner' ? handle : null,
      })
    }
    handle = coordinator.connect(userId, update)
    // connect puede emitir el estado antes de devolver el handle.
    // Revalidar en una microtarea permite asociarlo al consumidor correcto.
    queueMicrotask(() => update(coordinator.getState()))
    return () => {
      connected = false
      handle?.disconnect()
    }
  }, [coordinator, userId])

  const ready = view.userId === userId
  if (ready && view.status === 'owner' && view.handle) {
    return <Owner
      key={view.generation}
      userId={userId}
      onLogout={onLogout}
      handle={view.handle}
    />
  }
  if (ready && view.status === 'blocked') {
    return <PanelLoader
      state="error"
      title="SOLOG Cajero ya está abierto en otra ventana"
      description="Cierra la otra ventana de Cajero para continuar aquí. El control no se transfiere automáticamente."
      actions={<button type="button" className="button" onClick={() => coordinator.retry()}>
        Reintentar
      </button>}
    />
  }
  if (ready && view.status === 'error') {
    return <PanelLoader
      state="error"
      title="No se pudo habilitar SOLOG Cajero"
      description={view.error ?? 'No se pudo comprobar la instancia activa. Cajero permanece bloqueado.'}
      actions={<button type="button" className="button" onClick={() => coordinator.retry()}>
        Reintentar
      </button>}
    />
  }
  return <PanelLoader label="Comprobando instancia de SOLOG Cajero…" />
}

export function CajeroApp({ userId, onLogout }: {
  userId: string
  onLogout: () => Promise<void>
}) {
  return <CashierInstanceGate userId={userId} onLogout={onLogout} />
}
