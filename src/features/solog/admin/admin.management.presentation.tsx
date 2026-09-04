import { useManagement } from './admin.management.context'
import type { Domain, Payload } from './admin.management.v2'

export function PageControls({ offset, length, onChange }: { offset: number; length: number; onChange: (offset: number) => void }) {
  return <div className="admin-v2-toolbar"><button type="button" className="button button--secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - 50))}>Anterior</button><span>Desde {offset + 1} · {length} filas</span><button type="button" className="button button--secondary" disabled={length < 50} onClick={() => onChange(offset + 50)}>Siguiente</button></div>
}
export function ReadNotice({ error, retry }: { error?: string; retry: () => void }) { return <p role={error ? 'alert' : 'status'}>{error ?? 'Cargando…'}{error && <button type="button" className="button" onClick={retry}>Reintentar lectura</button>}</p> }
export function MutationNotice({ domain, onSuccess }: { domain: Domain; onSuccess?: (payload: Payload) => void }) {
  const store = useManagement(), intent = store.intent(domain), result = store.results.get(domain)
  return <>{intent && <div className="notice" role="status"><p>{intent.error ?? 'Operación en curso…'} · {String(intent.payload.operation_id)}</p>{!intent.pending && <button className="button" onClick={() => void store.retryMutation(domain).then(() => onSuccess?.(intent.payload)).catch(() => {})}>Reintentar misma operación</button>}</div>}{!intent && result && <p role="status">Operación confirmada{result.replay ? ' (replay)' : ''}. {result.status ?? String(result.result?.codigo ?? result.result?.status ?? '')}</p>}</>
}
