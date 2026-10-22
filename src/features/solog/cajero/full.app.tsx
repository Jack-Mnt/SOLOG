import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { FullRuntime } from './full.runtime'
import { CASHIER_DIFFERENCE_REASONS } from './cajero.observaciones.v5'
import { CajeroCalculator } from './cajero.calculadora'
import { evaluateCajeroExpression } from './cajero.utils'
import { CajeroHistorial } from './cajero.historial'
import type { CashierHistory, CashierHistoryPeriod } from './cajero.history'
import { navigateTo, usePathname } from '../../../lib/router'
import './cajero.css'
import './full.css'

const messages: Record<string, string> = {
  STOCK_EXPIRED: 'El stock tiene más de dos horas. Espera una nueva actualización.', SNAPSHOT_REQUIRED: 'Todavía no hay stock disponible.',
  NEW_SESSIONS_PAUSED: 'El inicio de conteos está temporalmente pausado.', SESSION_ALREADY_ACTIVE: 'Ya hay una sesión de conteo activa en esta sede.',
  FULL_PENDING_DELIVERY_REQUIRES_RECONCILIATION: 'Hay operaciones sin confirmar. Reinténtalas antes de cerrar.',
  FULL_REASON_REQUIRED: 'Selecciona un motivo y escribe una observación de al menos tres caracteres.',
  SESSION_CAPTURE_CLOSED: 'El tiempo de captura terminó. Se conservan los envíos pendientes.',
  STRUCTURE_SNAPSHOT_REQUIRED: 'El catálogo o los grupos cambiaron. Espera un stock actualizado.',
  DEVICE_UNAUTHORIZED: 'Este dispositivo aún no está autorizado.', USER_UNAUTHORIZED: 'El usuario no tiene acceso al conteo.',
  FULL_GROUP_ALREADY_PENDING: 'Este grupo ya tiene un conteo pendiente de confirmación.',
}
const explain = (error: unknown) => { const code = error instanceof Error ? error.message : String(error); return messages[code] ?? code }
const time = (value: string | undefined) => value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Sin actualización'
const rank: Record<string, number> = { round_coverage: 0, review_for_coverage: 1, review_regular: 2, shift_coverage: 3, none: 4 }
export function FullCashierPanel({ runtime, onLogout, loadHistory }: { runtime: FullRuntime; onLogout: () => Promise<void>; loadHistory?: (period: CashierHistoryPeriod) => Promise<CashierHistory> }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [now, setNow] = useState(0), [error, setError] = useState<string | null>(null), [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null), [physical, setPhysical] = useState(''), [reason, setReason] = useState(''), [note, setNote] = useState('')
  const [working, setWorking] = useState(false), [page, setPage] = useState(0)
  const [calculator, setCalculator] = useState(false), pathname = usePathname()
  const autoClosed = useRef(new Set<string>())
  const session = view.session, group = view.groups.find(x => x.group_id === selected)
  const stockFresh = runtime.clock.trusted && !!view.bootstrap?.stock?.is_fresh && now >= Date.parse(view.bootstrap.stock.snapshot_captured_at) && now < Date.parse(view.bootstrap.stock.stock_expires_at)
  const canCapture = runtime.clock.canCapture(session) && !working && !view.busy
  const priority = Math.min(...view.groups.filter(g => g.action !== 'none').map(g => rank[g.priority_class] ?? 4))
  const candidates = useMemo(() => view.groups.filter(g => g.action !== 'none' && (g.group_name + ' ' + g.category_name + ' ' + g.members.map(p => p.product).join(' ')).toLocaleLowerCase().includes(search.toLocaleLowerCase())), [view.groups, search])
  const remaining = session ? Math.max(0, Math.ceil((Date.parse(session.session_expires_at) - now) / 1000)) : 0
  const evaluated = evaluateCajeroExpression(physical)
  const historyController = useMemo(() => ({ serverOffsetMs: runtime.clock.now() - Date.now(), cacheRevision: view.revision, getCachedHistory: () => null, loadHistory: (period: CashierHistoryPeriod) => loadHistory!(period) }), [runtime, view.revision, loadHistory])
  async function run(action: () => Promise<void>) { setWorking(true); setError(null); try { await action() } catch (e) { setError(explain(e)) } finally { setWorking(false) } }
  useEffect(() => {
    let live = true
    const refresh = () => { void runtime.refresh().catch(e => { if (live) setError(explain(e)) }) }
    const online = () => { autoClosed.current.clear(); void runtime.flush().catch(e => { if (live) setError(explain(e)) }) }
    refresh(); const tick = window.setInterval(() => { if (live) setNow(runtime.clock.now()) }, 250)
    const resume = () => { setNow(runtime.clock.now()); if (!document.hidden) refresh() }
    const storage = (e: StorageEvent) => { if (e.key === runtime.key) refresh() }
    window.addEventListener('online', online); window.addEventListener('focus', resume); window.addEventListener('storage', storage); document.addEventListener('visibilitychange', resume)
    return () => { live = false; window.clearInterval(tick); window.removeEventListener('online', online); window.removeEventListener('focus', resume); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', resume) }
  }, [runtime])
  useEffect(() => {
    if (!Number.isFinite(now) || working || view.busy || !runtime.clock.trusted) return
    const expired = [session, ...(view.bootstrap?.recovery_sessions ?? [])].find(s => s && now >= Date.parse(s.session_expires_at) && !autoClosed.current.has(s.session_id))
    if (!expired) return
    autoClosed.current.add(expired.session_id)
    let cancelled = false
    void runtime.finish(expired.session_id).catch(e => { if (!cancelled) setError(explain(e)) })
    return () => { cancelled = true }
  }, [runtime, session, view.bootstrap, now, working, view.busy])
  async function capture() {
    if (!group) return
    const quantity = evaluated.value
    if (evaluated.status !== 'valid' || quantity === null) return
    await run(async () => { await runtime.observe(group.group_id, quantity, reason || null, reason ? note.trim() : null); setSelected(null); setPhysical(''); setReason(''); setNote('') })
  }
  const exportPending = () => { const blob = new Blob([JSON.stringify(runtime.inspectPending(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'SOLOG_pendientes.json'; link.click(); URL.revokeObjectURL(url) }
  return <main className="full-shell">
    <header className="full-header"><div><span className="full-eyebrow">SOLOG</span><h1>Conteo de inventario</h1></div><button onClick={() => void onLogout()}>Cerrar sesión de usuario</button></header>
    {loadHistory && <nav className="full-actions"><button onClick={() => navigateTo('/cajero')}>Conteo</button><button onClick={() => navigateTo('/cajero/historial')}>Historial</button></nav>}
    {loadHistory && pathname === '/cajero/historial' ? <CajeroHistorial session={historyController}/> : <>
    <section className="full-stock"><div><strong>Último stock recibido</strong><p data-testid="stock-time">{time(view.bootstrap?.stock?.snapshot_captured_at)}</p></div><div><strong>{session ? 'Captura disponible hasta' : 'Estado'}</strong><p data-testid="session-deadline">{session ? time(session.session_expires_at) : view.bootstrap?.stock?.is_fresh ? 'Stock disponible' : 'Esperando stock actualizado'}</p></div>{session && <div aria-live="off"><strong>Tiempo restante</strong><p data-testid="countdown">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p></div>}</section>
    {(error || view.error) && <p className="full-error" role="alert">{error ?? explain(view.error)}</p>}
    {!canCapture && session && <p className="full-warning">La captura está cerrada. Los conteos pendientes permanecen guardados y pueden entregarse dentro del plazo permitido.</p>}
    {physical && !canCapture && <p className="full-warning">El valor escrito no se envió ni se convirtió automáticamente en un conteo.</p>}
    <nav className="full-actions">
      {!session && <button className="full-primary" disabled={!view.bootstrap?.capabilities.can_start_session || !stockFresh || working || view.busy} onClick={() => void run(() => runtime.start())}>Iniciar conteo</button>}
      <button disabled={working || view.busy} onClick={() => void run(() => runtime.retry())}>Reintentar pendientes ({view.pending + view.rejected})</button>
      <button disabled={working || view.busy} onClick={() => void run(() => runtime.refresh())}>Actualizar estado</button>
      {session && <button disabled={working || view.busy} onClick={() => void run(() => runtime.finish())}>Finalizar conteo</button>}
      {(view.pending > 0 || view.rejected > 0) && <button onClick={exportPending}>Exportar pendientes</button>}
    </nav>
    {!session && view.bootstrap?.capabilities.block_reason && <p>{explain(view.bootstrap.capabilities.block_reason)}</p>}
    {view.rejected > 0 && <p className="full-error">{view.rejected} operaciones requieren revisión. No se han eliminado ni marcado como confirmadas.</p>}
    {(view.bootstrap?.recovery_sessions ?? []).map(recovery => <section className="full-warning" key={recovery.session_id}>Sesión pendiente de cierre · entrega hasta {time(recovery.pending_delivery_until)} <button disabled={working || view.busy} onClick={() => void run(() => runtime.finish(recovery.session_id))}>Reconciliar y cerrar</button></section>)}
    {session && <>
      <p>Stock de referencia de esta sesión: {time(session.reference_snapshot_captured_at)} · {candidates.length} grupos pendientes.</p>
      <input className="full-search" aria-label="Buscar producto o categoría" placeholder="Buscar producto o categoría" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
      <section className="full-groups">{candidates.slice(page * 60, (page + 1) * 60).map(item => <button key={item.group_id} className={'full-group' + (selected === item.group_id ? ' is-selected' : '')} disabled={!canCapture || (rank[item.priority_class] ?? 4) !== priority} onClick={() => { setSelected(item.group_id); setPhysical(''); setReason(''); setNote('') }}><strong>{item.group_name}</strong><span>{item.category_name} · {item.action === 'recount' ? 'Reconteo' : 'Conteo'}</span></button>)}</section>
      {candidates.length > 60 && <nav className="full-actions"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1} de {Math.ceil(candidates.length / 60)}</span><button disabled={(page + 1) * 60 >= candidates.length} onClick={() => setPage(page + 1)}>Siguiente</button></nav>}
      {group && <section className="full-capture"><h2>{group.group_name}</h2><p>{group.members.map(p => p.product).join(' · ')}</p><button onClick={() => setCalculator(!calculator)}>{calculator ? 'Entrada directa' : 'Calculadora'}</button>{calculator ? <CajeroCalculator expression={physical} disabled={!canCapture} onChange={setPhysical}/> : <label>Cantidad física<input aria-label="Cantidad física" type="number" min="0" max="2147483647" step="1" value={physical} disabled={!canCapture} onChange={e => setPhysical(e.target.value)} /></label>}<label>Motivo<select aria-label="Motivo" value={reason} disabled={!canCapture} onChange={e => setReason(e.target.value)}><option value="">Sin observación</option>{CASHIER_DIFFERENCE_REASONS.map(value => <option key={value}>{value}</option>)}</select></label>{reason && <label>Observación<textarea maxLength={1024} aria-label="Observación" value={note} disabled={!canCapture} onChange={e => setNote(e.target.value)} /></label>}<button className="full-primary" disabled={!canCapture || evaluated.status !== 'valid' || !Number.isSafeInteger(evaluated.value)} onClick={() => void capture()}>Guardar conteo</button></section>}
    </>}
    </>}
    <footer>Las operaciones solo se muestran como confirmadas después de recibir y guardar la respuesta del servidor.</footer>
  </main>
}
