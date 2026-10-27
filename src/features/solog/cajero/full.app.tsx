import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowLeft, CalendarClock, ClipboardList, Database, History, Home, List, LogOut, MessageSquarePlus, Play, RefreshCw, SearchCheck, Send, Square, X } from 'lucide-react'
import type { CashierRoute } from '../../../lib/router'
import { navigateTo, usePathname } from '../../../lib/router'
import { CajeroCalculator } from './cajero.calculadora'
import { CajeroObservacionDialog } from './cajero.observacion.dialog'
import { CajeroProductosDialog } from './cajero.productos.dialog'
import { CajeroHistorial } from './cajero.historial'
import { getCajeroCategoryIcon, evaluateCajeroExpression, calculateCajeroValuationPreview, formatCajeroCurrency, formatCajeroDifference, getCajeroDifferenceClass } from './cajero.utils'
import { PaletteSwitcher } from '../../theme/palette-switcher'
import { PanelLoader } from '../../../components/panel-loader'
import type { CashierHistory, CashierHistoryPeriod } from './cajero.history'
import type { CashierDifferenceReason } from './cajero.observaciones.v5'
import { FullRuntime, type FullDraft, type FullIncident } from './full.runtime'
import { cashierStartGate } from './full.start-gate'
import type { FullGroup } from './full.contract'
import { actionFor, actionable, stockType, type FullWorkAction, type FullStockType } from './full.presentation'
import './cajero.css'
import './full.css'

const messages: Record<string, string> = {
  STOCK_EXPIRED: 'El stock tiene más de dos horas. Espera una nueva actualización.',
  SNAPSHOT_REQUIRED: 'Todavía no hay stock disponible.',
  NEW_SESSIONS_PAUSED: 'El inicio de conteos está temporalmente pausado.',
  SESSION_ALREADY_ACTIVE: 'Ya hay una sesión de conteo activa en esta sede.',
  FULL_REASON_REQUIRED: 'Selecciona un motivo y escribe una observación de al menos tres caracteres.',
  SESSION_CAPTURE_CLOSED: 'El tiempo de captura terminó. Se conservan los envíos pendientes.',
  STRUCTURE_SNAPSHOT_REQUIRED: 'El catálogo o los grupos cambiaron. Espera un stock actualizado.',
  DEVICE_UNAUTHORIZED: 'Este dispositivo aún no está autorizado.',
  USER_UNAUTHORIZED: 'El usuario no tiene acceso al conteo.',
  FULL_GROUP_ALREADY_PENDING: 'Este grupo tiene un registro pendiente de confirmación.',
  FULL_HOURLY_START_GATE: 'Inicio temporalmente bloqueado por la actualización horaria del inventario.',
  FULL_DELIVERY_UNCERTAIN: 'No se confirmó el envío; los registros permanecen guardados para reintento seguro.',
  FULL_DELIVERY_RETRYABLE: 'Servidor temporalmente no disponible. Se reintentará sin duplicar registros.',
  FULL_REJECTED_REQUIRES_REVIEW: 'Hay un rechazo definitivo. Requiere revisión antes de finalizar.',
  FULL_DRAFTS_NOT_ELIGIBLE: 'Algunos borradores todavía no son elegibles según la prioridad del servidor.',
  FULL_OLD_SESSION_REQUIRES_RECONCILIATION: 'Primero deben registrarse y cerrarse los conteos de la sesión anterior.',
  FULL_PENDING_DELIVERY_REQUIRES_RECONCILIATION: 'Existen borradores u operaciones sin confirmar; no se puede finalizar.',
  FULL_RECOUNT_DETAIL_MISSING: 'Falta el detalle de reconteo necesario para guardar.',
  FULL_CONFIRMATION_MANIFEST_MISMATCH: 'La confirmación del servidor no coincide. Los registros quedan retenidos para revisión.',
  FULL_INCIDENT_NOT_FOUND: 'La incidencia ya no está disponible. Actualiza el estado.',
  FULL_INCIDENT_DISCARD_BLOCKED: 'No se ha demostrado que este registro pueda descartarse de forma segura.',
}
const explain = (error: unknown) => {
  const code = error instanceof Error ? error.message : String(error)
  return messages[code] ?? code
}
const dateTime = (value?: string) => value
  ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
  : 'Sin actualización'
type WorkAction = FullWorkAction
type StockType = FullStockType
type Observation = { reason: CashierDifferenceReason | null; text: string | null }
const routes: { action: WorkAction; route: CashierRoute; title: string; label: string; icon: typeof Home }[] = [
  { action: 'coverage', route: '/cajero/conteo', title: 'Conteo', label: 'Conteo', icon: ClipboardList },
  { action: 'recount', route: '/cajero/revisar', title: 'Revisar', label: 'Revisar', icon: SearchCheck },
  { action: 'daily', route: '/cajero/diario', title: 'Cobertura de turno', label: 'Conteo diario', icon: CalendarClock },
]
const routeFor = (action: WorkAction) => routes.find(r => r.action === action)!.route

function CaptureDialog({ groups, initialId, onClose, disabled, onRecord, draftFor }: {
  groups: FullGroup[]
  initialId: string | null
  onClose: () => void
  disabled: boolean
  onRecord: (group: FullGroup, physical: number, observation: Observation, expression: string) => Promise<void>
  draftFor: (groupId: string) => FullDraft | null
}) {
  const titleId = useId()
  const confirmationId = useId()
  const root = useRef<HTMLElement>(null)
  const confirmRoot = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<string | null>(initialId)
  const [expressions, setExpressions] = useState<Record<string, string>>(() => Object.fromEntries(
    groups.map(g => [g.group_id, draftFor(g.group_id)?.expression ?? '']),
  ))
  const [notes, setNotes] = useState<Record<string, Observation>>(() => Object.fromEntries(
    groups.map(g => {
      const draft = draftFor(g.group_id)
      return [g.group_id, { reason: (draft?.reason ?? null) as CashierDifferenceReason | null, text: draft?.note ?? null }]
    }),
  ))
  const [observation, setObservation] = useState<{ required: boolean; after?: () => void } | null>(null)
  const [productsOpen, setProductsOpen] = useState(false)
  const [confirm, setConfirm] = useState<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const group = groups.find(g => g.group_id === selected)
  const index = group ? groups.findIndex(g => g.group_id === group.group_id) : -1
  const expression = selected ? expressions[selected] ?? '' : ''
  const currentNote = selected ? notes[selected] ?? { reason: null, text: null } : { reason: null, text: null }
  const evaluated = evaluateCajeroExpression(expression)
  const physical = evaluated.status === 'valid' ? evaluated.value : null
  const difference = group && physical !== null ? physical - group.stock_theoretical : null
  const valuation = group && difference !== null
    ? calculateCajeroValuationPreview(difference, group.price, group.units_per_package, group.package_price)
    : null
  const saved = selected ? draftFor(selected) : null
  const dirty = Boolean(group && (saved
    ? (physical !== saved.physical || currentNote.reason !== saved.reason ||
      currentNote.text !== saved.note)
    : (expression.trim() !== '' || currentNote.reason !== null || currentNote.text !== null)))
  const locked = saving || disabled

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLElement>('button')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (observation !== null || productsOpen) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (confirm) setConfirm(null)
        else requestExit(onClose)
        return
      }
      if (event.key !== 'Tab') return
      const modal = confirm ? confirmRoot.current : root.current
      if (!modal) return
      const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  useEffect(() => { if (confirm) confirmRoot.current?.querySelector<HTMLElement>('button')?.focus() }, [confirm])
  const clear = () => {
    if (!selected) return
    setExpressions(old => { const next = { ...old }; delete next[selected]; return next })
    setNotes(old => { const next = { ...old }; delete next[selected]; return next })
  }
  function requestExit(go: () => void) {
    if (saving) return
    if (!dirty) { go(); return }
    setConfirm(() => go)
  }
  const select = (id: string | null) => {
    clear()
    if (id) {
      const draft = draftFor(id)
      setExpressions(old => ({ ...old, [id]: draft?.expression ?? '' }))
      setNotes(old => ({ ...old, [id]: {
        reason: (draft?.reason ?? null) as CashierDifferenceReason | null, text: draft?.note ?? null,
      } }))
    }
    setSelected(id); setError(null)
  }
  const next = () => {
    const nextGroup = groups[index + 1]
    select(nextGroup?.group_id ?? null)
  }
  const required = (value: Observation) => {
    if (difference === null) return false
    if (group?.action === 'recount' && difference === 0) return false
    return Math.abs(difference) >= 12 && (value.reason === null || !value.text || value.text.trim().length < 3)
      || value.reason !== null && (!value.text || value.text.trim().length < 3)
      || value.reason === null && value.text !== null
  }
  async function record(value: Observation, after: () => void) {
    if (!group || physical === null || locked) return
    if (required(value)) { setObservation({ required: true, after }); return }
    setSaving(true)
    setError(null)
    try {
      const resolved = group.action === 'recount' && difference === 0
      await onRecord(group, physical, resolved ? { reason: null, text: null } : value, expression)
      clear()
      after()
    } catch (e) { setError(explain(e)) }
    finally { setSaving(false) }
  }
  const continueToNext = () => {
    if (physical === null) { requestExit(next); return }
    void record(currentNote, next)
  }
  return <div className="cajero-capture-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget && !observation && !confirm) requestExit(onClose)
  }}>
    <section ref={root} className="cajero-capture-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="cajero-capture-modal__header">
        <button type="button" className="cajero-capture-modal__icon-button" aria-label="Regresar a la lista" onClick={() => requestExit(() => select(null))}><ArrowLeft size={22}/></button>
        <h2 id={titleId}>{group?.category_name ?? 'Grupos'}</h2>
        <strong>{groups.filter(g => draftFor(g.group_id)).length}/{groups.length} contados</strong>
        <button type="button" className="cajero-capture-modal__icon-button" aria-label="Cerrar" onClick={() => requestExit(onClose)}><X size={22}/></button>
      </header>
      <div className="cajero-capture-modal__progress">
        <span aria-hidden="true"><span style={{ width: `${groups.length ? Math.round(groups.filter(g => draftFor(g.group_id)).length * 100 / groups.length) : 0}%` }}/></span>
        <strong>{groups.length ? Math.round(groups.filter(g => draftFor(g.group_id)).length * 100 / groups.length) : 0}%</strong>
      </div>
      <div className={'cajero-capture-modal__body' + (group ? ' cajero-capture-modal__body--detail' : '')}>
        {group ? <div className="cajero-capture-detail">
          <div className="cajero-capture-detail__information">
            <section className="cajero-capture-detail__card">
              <div className="cajero-capture-detail__card-heading">
                <h3>{group.group_name}</h3>
                <div className="cajero-capture-detail__actions">
                  <button type="button" className="cajero-capture-detail__action-button"
                    aria-label="Ver productos incluidos" aria-haspopup="dialog"
                    onClick={() => setProductsOpen(true)}>
                    <List size={20} aria-hidden="true"/>
                  </button>
                  <button type="button" className="cajero-capture-detail__action-button cajero-capture-detail__observation-button"
                    aria-label="Agregar observación" aria-haspopup="dialog" disabled={locked}
                    onClick={() => setObservation({ required: false })}>
                    <MessageSquarePlus size={20} aria-hidden="true"/>
                  </button>
                </div>
              </div>
              {group.action === 'recount' ? <p className="full-contract-pending">Motivo y diferencia inicial: pendiente de contrato de lectura.</p> : null}
              <dl>
                <div><dt>Stock TumiSoft</dt><dd>{group.stock_theoretical}</dd></div>
                <div><dt>Conteo</dt><dd>{physical ?? '—'}</dd></div>
                <div><dt>Diferencia</dt><dd className={getCajeroDifferenceClass(difference)}>{formatCajeroDifference(difference)}</dd></div>
                <div><dt>Valorizado</dt><dd>{valuation === null ? '—' : formatCajeroCurrency(valuation)}</dd></div>
              </dl>
            </section>
          </div>
          {error ? <div role="alert" className="cajero-alert cajero-alert--error">{error}</div> : null}
          <CajeroCalculator expression={expression} disabled={locked}
            onChange={value => setExpressions(old => ({ ...old, [group.group_id]: value }))}/>
          <nav className="cajero-capture-detail__navigation" aria-label="Navegación entre grupos">
            <button type="button" className="button button--secondary" disabled={saving || index <= 0}
              onClick={() => requestExit(() => select(groups[index - 1]?.group_id ?? null))}>Anterior</button>
            <button type="button" className="button button--secondary" disabled={saving} onClick={() => requestExit(() => select(null))}>Regresar</button>
            <button type="button" className="button" disabled={locked || (expression.trim() !== '' && physical === null)} onClick={continueToNext}>
              {expression.trim() ? 'Continuar' : 'Siguiente'}
            </button>
          </nav>
        </div> : <div className="cajero-capture-summary">
          <div className="cajero-capture-summary__head"><span>Nombre</span><span>Stock TumiSoft</span><span>Diferencia</span><span/></div>
          <div className="cajero-capture-summary__rows">{groups.map(item => {
            const draft = draftFor(item.group_id)
            const difference = draft ? draft.physical - item.stock_theoretical : null
            return <button type="button" key={item.group_id} className={draft ? 'is-counted' : undefined}
              disabled={locked} onClick={() => select(item.group_id)}>
              <strong>{item.group_name}</strong><span>{item.stock_theoretical}</span>
              <span className={getCajeroDifferenceClass(difference)}>{formatCajeroDifference(difference)}</span><span>›</span>
            </button>
          })}</div>
        </div>}
      </div>
    </section>
    {productsOpen && group ? <CajeroProductosDialog key={group.group_id}
      group={group} onClose={() => setProductsOpen(false)} /> : null}
    {observation && group ? <CajeroObservacionDialog key={group.group_id}
      initialReason={currentNote.reason} initialText={currentNote.text}
      priorReason={null} priorText={null}
      isRecount={group.action === 'recount'} isResolved={group.action === 'recount' && difference === 0}
      mandatory={observation.required}
      onCancel={() => setObservation(null)}
      onClear={() => { setNotes(old => ({ ...old, [group.group_id]: { reason: null, text: null } })); setObservation(null) }}
      onOmit={() => { clear(); setObservation(null); if (confirm) setConfirm(null); next() }}
      onApply={(reason, text) => {
        const value: Observation = { reason, text }
        setNotes(old => ({ ...old, [group.group_id]: value }))
        const after = observation.after
        setObservation(null)
        if (after) {
          // La validación de cantidad continúa después de aplicar la explicación.
          void (async () => {
            if (physical === null || locked) return
            setSaving(true)
            try { await onRecord(group, physical, group.action === 'recount' && difference === 0 ? { reason: null, text: null } : value, expression); clear(); after() }
            catch (e) { setError(explain(e)) }
            finally { setSaving(false) }
          })()
        }
      }}
    /> : null}
    {confirm ? <div className="cajero-confirmation-backdrop">
      <section ref={confirmRoot} role="dialog" aria-modal="true" aria-labelledby={confirmationId} className="cajero-confirmation">
        <h2 id={confirmationId}>¿Qué deseas hacer con este conteo?</h2>
        <p>Hay una cantidad u observación sin guardar.</p>
        <div className="cajero-confirmation__actions">
          <button type="button" className="button button--secondary" onClick={() => setConfirm(null)}>Cancelar</button>
          <button type="button" className="button button--danger" onClick={() => { clear(); const go = confirm; setConfirm(null); go() }}>Descartar</button>
          <button type="button" className="button" disabled={locked || physical === null}
            onClick={() => { const go = confirm; setConfirm(null); void record(currentNote, go) }}>Guardar</button>
        </div>
      </section>
    </div> : null}
  </div>
}

export function FullCashierPanel({ runtime, onLogout, loadHistory }: {
  runtime: FullRuntime
  onLogout: () => Promise<void>
  loadHistory?: (period: CashierHistoryPeriod) => Promise<CashierHistory>
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const pathname = usePathname()
  const [now, setNow] = useState(0)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [stock, setStock] = useState<StockType>(() => {
    const param = new URLSearchParams(window.location.search).get('stock')
    return param === 'zero' || param === 'negative' ? param : 'positive'
  })
  const [category, setCategory] = useState<string | null>(null)
  const [reviewGroup, setReviewGroup] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [incidentToDiscard, setIncidentToDiscard] = useState<FullIncident | null>(null)
  const autoClosed = useRef(new Map<string, number>())
  const lastPreparedRetry = useRef(Number.NEGATIVE_INFINITY)
  const session = view.session
  const stockState = view.bootstrap?.stock
  const canCapture = runtime.clock.canCapture(session) && !working && !view.busy
  const remaining = session ? Math.max(0, Math.ceil((Date.parse(session.session_expires_at) - now) / 1000)) : 0
  const stockFresh = runtime.clock.trusted && Boolean(stockState?.is_fresh && now >= Date.parse(stockState.snapshot_captured_at) && now < Date.parse(stockState.stock_expires_at))
  const startGate = cashierStartGate(now, runtime.clock.trusted, stockState?.snapshot_confirmed_at, stockState?.snapshot_captured_at)
  const startGateSeconds = Math.ceil(startGate.remainingMs / 1000)
  const startGateCountdown = `${Math.floor(startGateSeconds / 60)}:${String(startGateSeconds % 60).padStart(2, '0')}`
  const available = useMemo(() => actionable(view.groups), [view.groups])
  const route = routes.find(item => item.route === pathname)
  const currentAction = route?.action ?? null
  const currentGroups = currentAction ? available.filter(g => actionFor(g) === currentAction) : []
  const stockGroups = currentAction === 'coverage' ? currentGroups.filter(g => stockType(g.stock_theoretical) === stock) : currentGroups
  const categories = [...new Map(stockGroups.map(g => [g.category_id, { id: g.category_id, name: g.category_name }])).values()]
  const modalGroups = category ? stockGroups.filter(g => g.category_id === category) : reviewGroup
    ? stockGroups.filter(g => g.group_id === reviewGroup) : []
  const history = useMemo(() => ({
    serverOffsetMs,
    cacheRevision: view.revision,
    getCachedHistory: () => null,
    loadHistory: (period: CashierHistoryPeriod) => loadHistory!(period),
  }), [serverOffsetMs, view.revision, loadHistory])
  const actionRoute = available[0] ? routeFor(actionFor(available[0])) : null
  useEffect(() => {
    if (view.bootstrap && route && (!session || pathname !== actionRoute)) navigateTo('/cajero')
  }, [view.bootstrap, session, route, pathname, actionRoute])
  const icons: Record<string, typeof Home> = { '/cajero': Home, '/cajero/historial': History }
  for (const item of routes) icons[item.route] = item.icon

  async function run(fn: () => Promise<void>) {
    setWorking(true); setError(null)
    try { await fn() } catch (e) { setError(explain(e)) } finally { setWorking(false) }
  }
  useEffect(() => {
    let live = true
    const syncClockOffset = () => {
      const serverNow = runtime.clock.now()
      if (live && runtime.clock.trusted && Number.isFinite(serverNow)) {
        setServerOffsetMs(serverNow - Date.now())
      }
    }
    const resumePrepared = () => {
      if (!navigator.onLine || !runtime.getSnapshot().pending || runtime.getSnapshot().busy) return Promise.resolve()
      const stamp = performance.now()
      if (stamp - lastPreparedRetry.current < 30_000) return Promise.resolve()
      lastPreparedRetry.current = stamp
      return runtime.resumePrepared()
    }
    const refresh = () => {
      void runtime.refresh()
        .then(resumePrepared)
        .then(syncClockOffset)
        .catch(e => { if (live) setError(explain(e)) })
    }
    const online = () => {
      autoClosed.current.clear()
      refresh()
    }
    refresh()
    const tick = window.setInterval(() => { if (live) setNow(runtime.clock.now()) }, 250)
    // Reconciliación limitada a un intento por 30 s; también cuando bootstrap ya no muestra la sesión.
    const preparedRetry = window.setInterval(() => {
      if (live) void resumePrepared().catch(e => { if (live) setError(explain(e)) })
    }, 30_000)
    const resume = () => { setNow(runtime.clock.now()); syncClockOffset(); if (!document.hidden) refresh() }
    const storage = (e: StorageEvent) => { if (e.key === runtime.key) refresh() }
    window.addEventListener('online', online)
    window.addEventListener('focus', resume)
    window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', resume)
    return () => {
      live = false
      window.clearInterval(tick)
      window.clearInterval(preparedRetry)
      window.removeEventListener('online', online)
      window.removeEventListener('focus', resume)
      window.removeEventListener('storage', storage)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [runtime])
  // Refrescar V6 solo durante la ventana HH:59 → HH+1:02.
  // Nunca sustituir con este sondeo la autorización final del backend.
  useEffect(() => {
    if (session || working || view.busy ||
      (startGate.phase !== 'minute_59' && startGate.phase !== 'waiting_new_snapshot')) return
    let inflight = false
    const poll = () => {
      if (inflight) return
      inflight = true
      void runtime.refresh().catch(() => {
        // Un sondeo fallido no borra el último estado; V6 revalidará el inicio.
      }).finally(() => { inflight = false })
    }
    const interval = window.setInterval(poll, 8_000)
    return () => window.clearInterval(interval)
  }, [runtime, session, working, view.busy, startGate.phase])
  useEffect(() => {
    if (!Number.isFinite(now) || working || view.busy || !runtime.clock.trusted) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const expired = [session, ...(view.bootstrap?.recovery_sessions ?? [])].find(s =>
      s && now >= Date.parse(s.session_expires_at) &&
        now < Date.parse(s.pending_delivery_until) &&
        now >= (autoClosed.current.get(s.session_id) ?? 0))
    if (!expired) return
    // Reintentos limitados a uno cada 30 segundos. Reconciliar en reconexión.
    autoClosed.current.set(expired.session_id, now + 30_000)
    void runtime.finish(expired.session_id).catch(e => setError(explain(e)))
  }, [runtime, session, view.bootstrap, now, working, view.busy])
  const startGuarded = () => {
    // Volver a comprobar en el propio clic para no iniciar con un render anterior
    // al cambio de minuto, incluso si el botón seguía habilitado.
    const latestStock = runtime.getSnapshot().bootstrap?.stock
    const gate = cashierStartGate(runtime.clock.now(), runtime.clock.trusted, latestStock?.snapshot_confirmed_at, latestStock?.snapshot_captured_at)
    if (gate.blocked) {
      setError(gate.phase === 'minute_59'
        ? 'Actualización horaria en curso. El inicio está bloqueado durante el minuto 59.'
        : 'Esperando el nuevo stock. Si no llega, el respaldo se habilita desde el minuto 02.')
      return
    }
    void run(() => runtime.start())
  }
  const workLink = (r: CashierRoute) => {
    setCategory(null); setReviewGroup(null)
    navigateTo(r)
  }
  const record = async (g: FullGroup, value: number, note: Observation, expression: string) => {
    await runtime.observe(g.group_id, value, note.reason, note.text, expression)
  }
  const register = () => void run(() => runtime.sendPending())
  const logoutSafe = () => {
    void (async () => {
      setWorking(true); setError(null)
      try {
        if (runtime.getSnapshot().session) await runtime.finish()
        const state = runtime.getSnapshot()
        if (state.session || state.drafts || state.pending || state.rejected ||
          state.bootstrap?.recovery_sessions.length) throw new Error('FULL_OLD_SESSION_REQUIRES_RECONCILIATION')
        await onLogout()
      } catch (e) { setError(explain(e)) }
      finally { setWorking(false); setLogoutOpen(false) }
    })()
  }
  const exportPending = () => {
    const blob = new Blob([JSON.stringify(runtime.exportDiagnostics(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'SOLOG_diagnostico_cajero.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  const navRoutes: CashierRoute[] = actionRoute ? ['/cajero', actionRoute, '/cajero/historial'] : ['/cajero', '/cajero/historial']
  const activeDrafts = session ? runtime.getDrafts(session.session_id).length : 0
  const hasUnresolved = view.drafts > 0 || view.pending > 0 || view.rejected > 0 ||
    Boolean(view.bootstrap?.recovery_sessions.length)
  const incidents = hasUnresolved ? runtime.getIncidents() : []
  const discardIncident = () => {
    if (!incidentToDiscard) return
    const incident = incidentToDiscard
    setIncidentToDiscard(null)
    void run(async () => {
      if (incident.kind === 'draft' && incident.sessionId) {
        await runtime.discardDraft(incident.sessionId, incident.id)
      } else if (incident.kind === 'operation' && incident.status === 'rejected') {
        await runtime.discardRejectedOperation(incident.id)
      } else throw new Error('FULL_INCIDENT_DISCARD_BLOCKED')
    })
  }

  return <div className="cajero-shell">
    <header className="cajero-header">
      <div className="cajero-header__topline">
        <button className="cajero-header__brand" type="button" aria-label="Ir a Inicio" onClick={() => workLink('/cajero')}>
          <img src="/Logo_SOLOG.png" alt="SOLOG"/>
        </button>
        <div className="cajero-header__actions">
          <div className="cajero-stock-indicator">
            <button className={'cajero-stock-indicator__trigger' + (!stockFresh ? ' cajero-stock-indicator__trigger--expired' : '')}
              type="button" aria-label="Estado del inventario" aria-expanded={stockOpen} onClick={() => setStockOpen(v => !v)}>
              <span className="cajero-stock-indicator__dot"/>
              <Database size={19} aria-hidden="true"/>
            </button>
            {stockOpen ? <section className="cajero-stock-indicator__popover" role="dialog" aria-label="Estado del inventario">
              <strong>{stockFresh ? 'Inventario vigente' : 'Inventario desactualizado'}</strong>
              <p>Actualizado {dateTime(stockState?.snapshot_captured_at)}</p>
              <p>Vigencia hasta {dateTime(stockState?.stock_expires_at)}</p>
              {session ? <p>Sesión hasta {dateTime(session.session_expires_at)}</p> : null}
            </section> : null}
          </div>
          <button className="cajero-header__logout" type="button" disabled={working || view.busy}
            onClick={() => setLogoutOpen(true)}><LogOut size={20}/><span>Salir</span></button>
        </div>
      </div>
    </header>
    <main className="cajero-main">
      {error || view.error ? <div className="cajero-alert cajero-alert--error" role="alert">{error ?? explain(view.error)}</div> : null}
      {hasUnresolved ? <div className="cajero-alert cajero-alert--warning" role="status">
        <p>{view.drafts} borradores locales, {view.pending} operaciones pendientes y {view.rejected} rechazadas. Los registros permanecen en este dispositivo.</p>
        <button className="button button--secondary" type="button" disabled={working || view.busy || view.pending === 0}
          onClick={() => void run(() => runtime.retry())}><RefreshCw size={18}/> Reintentar operaciones</button>
        <button className="button button--secondary" type="button" onClick={exportPending}>Exportar diagnóstico</button>
        {incidents.length ? <div className="cajero-incidents" aria-label="Incidencias locales">
          {incidents.slice(0, 12).map(item => <div className="cajero-incidents__row" key={item.id}>
            <span>{item.kind === 'draft' ? 'Borrador' : item.status === 'rejected' ? 'Rechazo definitivo' : 'Envío sin conciliar'} · {item.groupId?.slice(0, 8) ?? item.action ?? '—'} · {item.sessionId?.slice(0, 8) ?? 'Inicio'}
              {item.code ? ` · ${item.code}` : ''}</span>
            {runtime.canDiscardIncident(item) ? <button type="button" className="button button--secondary" disabled={working || view.busy}
              onClick={() => setIncidentToDiscard(item)}>Descartar…</button> : null}
          </div>)}
          {incidents.length > 12 ? <p>{incidents.length - 12} incidencias adicionales en el diagnóstico exportable.</p> : null}
          <p>Exporta el diagnóstico antes de descartar. Los reintentos inciertos y los conflictos no se pueden descartar.</p>
        </div> : null}
      </div> : null}
      {!view.bootstrap && !error && !view.error ? <PanelLoader variant="contained" /> :
        pathname === '/cajero/historial' && loadHistory ? <CajeroHistorial session={history}/> : !route ? <section className="cajero-module cajero-home">
        <div className="cajero-home__heading"><h1>Inicio</h1></div>
        <section className={'cajero-stock-card' + (stockFresh ? ' cajero-stock-card--updated' : ' cajero-stock-card--stale')}>
          <div className="cajero-stock-card__status">
            <span className="cajero-stock-card__icon">{stockFresh ? <Database size={23}/> : <AlertTriangle size={23}/>}</span>
            <div className="cajero-stock-card__copy">
              <h2>{stockFresh ? 'Inventario cargado' : 'Inventario desactualizado'}</h2>
              <p>Última actualización: {dateTime(stockState?.snapshot_captured_at)}</p>
              {session ? <p>Captura hasta {dateTime(session.session_expires_at)} · {Math.floor(remaining / 60)} min restantes</p>
                : startGate.phase === 'minute_59' ? <p role="status">Actualizando inventario. Inicio bloqueado durante el minuto 59 · {startGateCountdown} restantes para habilitar el respaldo.</p>
                : startGate.phase === 'waiting_new_snapshot' ? <p role="status">Esperando el nuevo snapshot. Si no llega, el stock anterior podrá utilizarse desde el minuto 02, si continúa vigente · {startGateCountdown}.</p>
                : view.bootstrap?.capabilities.block_reason ? <p>{explain(view.bootstrap.capabilities.block_reason)}</p> : null}
            </div>
          </div>
          <div className="cajero-stock-card__actions">
            {!session ? <button type="button" className="button" disabled={hasUnresolved || startGate.blocked || !view.bootstrap?.capabilities.can_start_session || !stockFresh || working || view.busy}
              onClick={startGuarded}><Play size={19}/>{startGate.phase === 'minute_59' ? 'Actualizando inventario' : startGate.phase === 'waiting_new_snapshot' ? 'Esperando stock actualizado' : 'Iniciar conteo'}</button>
              : <button type="button" className="button button--danger" disabled={working || view.busy}
                onClick={() => void run(() => runtime.finish())}><Square size={19}/> Finalizar conteo</button>}
          </div>
        </section>
        {session ? <section className="cajero-home-metrics cajero-home-metrics--operations" aria-label="Registro de conteos">
          <article className="cajero-home-metric cajero-home-metric--pending">
            <Send size={23} aria-hidden="true"/><span>Pendientes de registro</span>
            <div className="cajero-home-metric__send-row">
              <div className="cajero-home-metric__value"><strong>{activeDrafts}</strong><small>borradores</small></div>
              <button type="button" className="button button--secondary" disabled={working || view.busy || (!activeDrafts && !view.pending)}
                onClick={register}><Send size={18} aria-hidden="true"/> Registrar conteo</button>
            </div>
          </article>
        </section> : null}
        {session && actionRoute ? <section className="cajero-home-metrics cajero-home-metrics--operations" aria-label="Trabajo habilitado">
          <button type="button" className="cajero-home-metric cajero-home-metric--action" onClick={() => workLink(actionRoute)}>
            <SearchCheck size={23}/><span>Continuar trabajo habilitado</span>
            <div className="cajero-home-metric__value"><strong>{available.length}</strong><small>grupos disponibles</small></div>
          </button>
        </section> : null}
        {session ? <div className="cajero-home-appearance"><div><Home size={20}/><h2>Sesión activa</h2></div>
          <span className="full-session-time">Referencia: {dateTime(session.reference_snapshot_captured_at)}</span></div> : null}
        <section className="cajero-home-appearance"><div><Home size={20}/><h2>Apariencia</h2></div><PaletteSwitcher variant="home"/></section>
      </section> : <section className="cajero-module cajero-operational">
        <div className="cajero-module__heading cajero-operational__heading cajero-operational__heading--with-action">
          <div><h1>{route.title}</h1><p>{currentAction === 'recount' ? 'Verifica la realidad' : 'Registra la realidad'}</p></div>
          {currentAction !== 'recount' ? <button type="button" className="button button--secondary"
            disabled={working || view.busy || (!activeDrafts && !view.pending)}
            onClick={register}><Send size={18} aria-hidden="true"/> Registrar conteo</button> : null}
          {currentAction === 'recount' ? <div className="cajero-segmented-control cajero-segmented-control--symbols" role="group" aria-label="Filtrar por diferencia inicial">
            <span className="full-contract-pending">Filtro por diferencia inicial pendiente de contrato</span>
          </div> : null}
        </div>
        {currentAction === 'coverage' ? <section className="cajero-selection-level cajero-selection-level--stock">
          <h2>Tipo de stock</h2><div className="cajero-selection-grid">
            {([['positive', 'Stock positivo'], ['zero', 'Stock 0'], ['negative', 'Stock negativo']] as const).map(([key, label]) =>
              <button type="button" key={key} className={stock === key ? 'is-active' : ''} aria-pressed={stock === key}
                onClick={() => { setStock(key); setCategory(null) }}>
                <ClipboardList size={23}/><span><strong>{label}</strong><small>{currentGroups.filter(g => stockType(g.stock_theoretical) === key).length} grupos</small></span>
              </button>)}
          </div></section> : null}
        {currentAction === 'recount' ? <section className="cajero-review-list">
          <div className="cajero-review-list__head"><span>Nombre</span><span>Reconteo</span><span>Estado</span><span/></div>
          <div className="cajero-review-list__rows">
            {currentGroups.map(g => <button type="button" key={g.group_id} disabled={!canCapture}
              onClick={() => setReviewGroup(g.group_id)}><strong>{g.group_name}</strong><span>Verificar</span><span>Disponible</span><span>›</span></button>)}
          </div>
        </section> : <section className="cajero-selection-level">
          <h2>Categorías</h2><div className="cajero-selection-grid">
            {categories.map(c => {
              const count = stockGroups.filter(g => g.category_id === c.id).length
              const Icon = getCajeroCategoryIcon(c.name)
              return <button type="button" key={c.id} disabled={!canCapture} onClick={() => setCategory(c.id)}>
                <Icon size={24}/><span><strong>{c.name}</strong><small>{count} grupos disponibles</small></span>
              </button>
            })}
          </div>
        </section>}
      </section>}
      {(category !== null || reviewGroup !== null) && modalGroups.length > 0 ? <CaptureDialog
        key={(session?.session_id ?? '') + ':' + (category ?? reviewGroup ?? '')}
        groups={modalGroups} initialId={reviewGroup} disabled={!canCapture}
        onClose={() => { setCategory(null); setReviewGroup(null) }}
        draftFor={groupId => runtime.getDraft(groupId)} onRecord={record}/> : null}
      {view.bootstrap?.recovery_sessions.map(s => <div className="cajero-alert cajero-alert--warning" key={s.session_id}>
        <p>Sesión en recuperación. Entrega disponible hasta {dateTime(s.pending_delivery_until)}.</p>
        <button type="button" className="button button--secondary" disabled={working || view.busy}
          onClick={() => void run(() => runtime.finish(s.session_id))}>Reintentar cierre seguro</button>
      </div>)}
    </main>
    <nav className="cajero-nav" aria-label="Panel Cajero"><div className="cajero-nav__inner">
      {navRoutes.map(r => {
        const Icon = icons[r]
        return <button type="button" key={r} className={'cajero-nav__item' + (pathname === r ? ' is-active' : '')}
          aria-current={pathname === r ? 'page' : undefined} onClick={() => workLink(r)}>
          <Icon size={22}/><span>{r === '/cajero' ? 'Inicio' : r === '/cajero/historial' ? 'Historial' : routes.find(x => x.route === r)?.label}</span>
        </button>
      })}
    </div></nav>
    {incidentToDiscard ? <div className="cajero-confirmation-backdrop">
      <section className="cajero-confirmation" role="dialog" aria-modal="true" aria-label="Descartar incidencia local">
        <h2>¿Descartar esta evidencia local?</h2>
        <p>Esta acción elimina el {incidentToDiscard.kind === 'draft' ? 'borrador' : 'rechazo comprobado'} del dispositivo, no modifica los conteos confirmados en Supabase.</p>
        <p>Exporta primero el diagnóstico si necesitas conservar el registro.</p>
        <div className="cajero-confirmation__actions">
          <button type="button" className="button button--secondary" onClick={() => setIncidentToDiscard(null)}>Cancelar</button>
          <button type="button" className="button button--danger" disabled={working || view.busy} onClick={discardIncident}>Confirmar descarte</button>
        </div>
      </section>
    </div> : null}
    {logoutOpen ? <div className="cajero-confirmation-backdrop">
      <section className="cajero-confirmation" role="dialog" aria-modal="true" aria-label="Cerrar sesión">
        <h2>¿Cerrar sesión?</h2><p>Las operaciones sin confirmar permanecerán guardadas en este dispositivo.</p>
        <div className="cajero-confirmation__actions">
          <button type="button" className="button button--secondary" onClick={() => setLogoutOpen(false)}>Cancelar</button>
          <button type="button" className="button button--danger" disabled={working || view.busy}
            onClick={logoutSafe}><LogOut size={18}/> Salir</button>
        </div>
      </section>
    </div> : null}
  </div>
}
