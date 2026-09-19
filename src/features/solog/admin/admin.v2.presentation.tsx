import { RotateCcw } from 'lucide-react'
import { PanelLoader, type PanelLoaderVariant } from '../../../components/panel-loader'
import { adminTimestamp } from './admin.v2.format'

export function Updated({ at }: { at: string }) {
  return <small className="admin-v2-updated">Actualizado: {adminTimestamp(at)} · America/Lima</small>
}

export function QueryState({
  error,
  retry,
  variant = 'contained',
}: {
  error?: string
  retry: () => void
  variant?: Exclude<PanelLoaderVariant, 'fullscreen'>
}) {
  if (!error) return <PanelLoader variant={variant} />

  return (
    <div className="notice notice--error" role="alert">
      <p>{error}</p>
      <button className="button" onClick={retry}>
        <RotateCcw size={16} aria-hidden="true" />
        Reintentar
      </button>
    </div>
  )
}

export function Value({ value, money = false }: { value: number | null; money?: boolean }) {
  return <>{value === null ? '—' : new Intl.NumberFormat('es-PE', money ? { style: 'currency', currency: 'PEN' } : {}).format(value)}</>
}
