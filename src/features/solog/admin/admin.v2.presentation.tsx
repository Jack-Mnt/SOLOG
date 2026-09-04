import { adminTimestamp } from './admin.v2.format'
export function Updated({ at }: { at: string }) { return <small className="admin-v2-updated">Actualizado: {adminTimestamp(at)} · America/Lima</small> }
export function QueryState({ error, retry }: { error?: string; retry: () => void }) {
  return <div className={error ? 'notice notice--error' : 'notice'} role={error ? 'alert' : 'status'}>{error ?? 'Cargando…'}{error && <button className="button" onClick={retry}>Reintentar</button>}</div>
}
export function Value({ value, money = false }: { value: number | null; money?: boolean }) {
  return <>{value === null ? '—' : new Intl.NumberFormat('es-PE', money ? { style: 'currency', currency: 'PEN' } : {}).format(value)}</>
}
