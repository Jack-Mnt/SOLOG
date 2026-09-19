import { useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useManagement } from './admin.management.context'
import { PanelLoader, type PanelLoaderVariant } from '../../../components/panel-loader'
import { AdminNotice } from './admin.primitives'
import type { Domain, MutationResult, Payload } from './admin.management.v2'

export function PageControls({ offset, length, onChange }: { offset: number; length: number; onChange: (offset: number) => void }) {
  return <div className="admin-v2-toolbar"><button type="button" className="button button--secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - 50))}><ChevronLeft size={16} aria-hidden="true" />Anterior</button><span>Desde {offset + 1} · {length} filas</span><button type="button" className="button button--secondary" disabled={length < 50} onClick={() => onChange(offset + 50)}>Siguiente<ChevronRight size={16} aria-hidden="true" /></button></div>
}

export function ReadNotice({
  error,
  retry,
  variant = 'contained',
}: {
  error?: string
  retry: () => void
  variant?: Exclude<PanelLoaderVariant, 'fullscreen'>
}) {
  if (!error) return <PanelLoader variant={variant} />

  return <div className="notice notice--error" role="alert">
    <p>{error}</p>
    <button type="button" className="button" onClick={retry}>
      <RotateCcw size={16} aria-hidden="true" />
      Reintentar lectura
    </button>
  </div>
}

function confirmedMutationMessage(result: MutationResult | undefined) {
  if (!result) return 'Operación confirmada.'
  const detail = result.status ?? String(result.result?.codigo ?? result.result?.status ?? '')
  return detail ? `Operación confirmada. ${detail}` : 'Operación confirmada.'
}

export function MutationNotice({ domain, onSuccess, showResult = true }: { domain: Domain; onSuccess?: (payload: Payload) => void; showResult?: boolean }) {
  const store = useManagement()
  const intent = store.intent(domain)
  const result = store.results.get(domain)
  const [dismissedOccurrence, setDismissedOccurrence] = useState<string | null>(null)

  if (intent) {
    const operationId = String(intent.payload.operation_id)
    const phase = intent.error ? 'error' : 'pending'
    const occurrence = `intent:${operationId}:${intent.attempt}:${phase}`
    if (dismissedOccurrence === occurrence) return null

    return <AdminNotice
      tone={intent.error ? 'error' : 'info'}
      action={!intent.pending ? <button
        type="button"
        className="button button--secondary"
        onClick={() => void store.retryMutation(domain).then(() => onSuccess?.(intent.payload)).catch(() => {})}
      ><RotateCcw size={16} aria-hidden="true" />Reintentar misma operación</button> : undefined}
    >
      {intent.error ?? 'Operación en curso…'}
    </AdminNotice>
  }

  if (!showResult || !result) return null
  const occurrence = `result:${domain}:${store.resultOccurrence(domain) ?? 0}`
  if (dismissedOccurrence === occurrence) return null

  return <AdminNotice
    tone="success"
    onDismiss={() => setDismissedOccurrence(occurrence)}
  >
    {confirmedMutationMessage(result)}
  </AdminNotice>
}
