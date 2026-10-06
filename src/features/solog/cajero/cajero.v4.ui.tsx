import type { CashierRoute } from '../../../lib/router'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowLeft, CalendarClock, ClipboardList, History, Home, LoaderCircle, LogOut, MessageSquarePlus, Palette, Play, RefreshCw, SearchCheck, Send, Trash2, X } from 'lucide-react'
import { navigateTo, replaceRoute } from '../../../lib/router'
import { PaletteSwitcher } from '../../theme/palette-switcher'
import { SologApiError, type SologErrorCode } from '../errors'
import { CajeroCalculator } from './cajero.calculadora'
import { CajeroHistorial } from './cajero.historial'
import { formatCajeroClock, formatCajeroElapsed, getCajeroStockPresentation, useCajeroServerClock } from './cajero.stock'
import { calculateCajeroValuationPreview, evaluateCajeroExpression, formatCajeroCurrency, formatCajeroDifference, getCajeroCategoryIcon, getCajeroDifferenceClass } from './cajero.utils'
import type { CashierV4Group, CashierV4NextAction } from './cajero.v4'
import { useCashierV4 } from './cajero.v4.context'
import { canCashierV4CaptureForSession } from './cajero.v4.capability'
import { getCashierV4ErrorPolicy } from './cajero.v4.errors'
import { getCashierV4RouteAccess, selectCashierV4BottomNavigation } from './cajero.v4.navigation'
import { CashierV4Runtime } from './cajero.v4.runtime'
import { cashierV4StockType, selectCashierV4Coverage, selectCashierV4CoverageGroups,
  selectCashierV4CoveragePendingByCategory, selectCashierV4CoveragePendingByStockType, selectCashierV4DailyGroups,
  selectCashierV4DailyPendingByCategory, selectCashierV4OperationalSummary, selectCashierV4ReviewEntries,
  type CashierV4StockType } from './cajero.v4.selectors'

const stockLabels = { positive: 'Stock positivo', zero: 'Stock 0', negative: 'Stock negativo' }
const icons: Record<CashierRoute, typeof Home> = {
  '/cajero': Home,
  '/cajero/conteo': ClipboardList,
  '/cajero/diario': CalendarClock,
  '/cajero/revisar': SearchCheck,
  '/cajero/historial': History,
}
const clock = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? formatCajeroClock(Date.parse(value)) : '—'

function CajeroCloseNotice({ runtime }: { runtime: CashierV4Runtime }) {
  const { state } = useCashierV4()
  const local = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const confirmRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!confirmDiscard) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = confirmRef.current
    dialog?.querySelector<HTMLElement>('button')?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setConfirmDiscard(false); return }
      if (event.key !== 'Tab' || !dialog) return
      const nodes = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')]
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keys)
    return () => { window.removeEventListener('keydown', keys); previousFocus?.focus() }
  }, [confirmDiscard])
  const closeId = local.closeConteoId
  const lifecyclePresent = Boolean(closeId && (state.panel_state?.session.id === closeId ||
    state.recovery_sessions.some(session => session.id === closeId)))
  const retry = () => void runtime.retryAutoClose().catch(() => {})
  const refresh = () => void runtime.refresh().catch(() => {})
  const discard = async () => {
    try {
      if (lifecyclePresent) await runtime.discardAndFinishRecovery()
      else runtime.cleanupConfirmedTerminal()
      setConfirmDiscard(false)
    } catch { /* Runtime expone feedback autoritativo. */ }
  }

  if (local.closeState === 'idle' || local.closeState === 'finished') return null
  if (local.closeState === 'closing') return <div className="cajero-alert cajero-alert--warning cajero-close-notice" role="status">
    <LoaderCircle className="cajero-close-notice__spinner" size={22} aria-hidden="true" />
    <div><strong>Finalizando conteo…</strong><p>SOLOG está guardando los conteos pendientes y cerrando la sesión.</p></div>
  </div>
  if (local.closeState === 'uncertain') return <div className="cajero-alert cajero-alert--warning cajero-close-notice" role="status">
    <AlertTriangle size={22} aria-hidden="true" />
    <div><strong>Estamos verificando si el último envío fue recibido.</strong><p>Los conteos permanecen guardados en este dispositivo.</p></div>
    <button className="button button--secondary" disabled={local.busy} onClick={retry} type="button"><RefreshCw size={18} aria-hidden="true" /> Reintentar</button>
  </div>
  if (local.closeState === 'conflict') return <div className="cajero-alert cajero-alert--error cajero-close-notice" role="alert">
    <AlertTriangle size={22} aria-hidden="true" />
    <div><strong>El envío necesita revisión.</strong><p>La operación conserva su identificador y sus datos. No se puede descartar automáticamente.</p></div>
  </div>

  return <><div className="cajero-alert cajero-alert--error cajero-close-notice" role="alert">
    <AlertTriangle size={22} aria-hidden="true" />
    <div><strong>Envío pendiente</strong><p>No se pudieron guardar algunos conteos. Tus conteos permanecen guardados en este dispositivo.</p></div>
    <div className="cajero-close-notice__actions">
      {runtime.requiresRefresh ? <button className="button button--secondary" disabled={local.busy || state.loading} onClick={refresh} type="button">
        <RefreshCw size={18} aria-hidden="true" /> Actualizar estado</button>
        : lifecyclePresent ? <button className="button button--secondary" disabled={local.busy} onClick={retry} type="button">
          <RefreshCw size={18} aria-hidden="true" /> Reintentar envío</button> : null}
      {runtime.canDiscardClose ? <button className="button button--danger" disabled={local.busy} onClick={() => setConfirmDiscard(true)} type="button">
        <Trash2 size={18} aria-hidden="true" /> Descartar conteos</button> : null}
    </div>
  </div>
  {confirmDiscard ? <div className="cajero-confirmation-backdrop">
    <section className="cajero-confirmation" role="dialog" aria-modal="true" aria-labelledby="cajero-descartar-title" ref={confirmRef}>
      <h2 id="cajero-descartar-title">Descartar conteos pendientes</h2>
      <p>Esta acción eliminará los conteos locales que no pudieron guardarse y cerrará la sesión cuando el estado del backend lo permita.</p>
      <div className="cajero-confirmation__actions">
        <button className="button button--secondary" disabled={local.busy} onClick={() => setConfirmDiscard(false)} type="button">Cancelar</button>
        <button className="button button--danger" disabled={local.busy} onClick={() => void discard()} type="button"><Trash2 size={18} aria-hidden="true" /> Descartar</button>
      </div>
    </section>
  </div> : null}</>
}

function PendingRegistration({ runtime }: { runtime: CashierV4Runtime }) {
  return <article className="cajero-home-metric cajero-home-metric--pending">
    <Send aria-hidden="true" size={23} /><span>Pendientes de registro</span>
    <div className="cajero-home-metric__send-row"><div className="cajero-home-metric__value"><strong>{runtime.pendingCount}</strong><small>pendientes</small></div>
      <button className="button button--secondary" disabled={runtime.getSnapshot().busy || runtime.pendingCount === 0}
        onClick={() => void runtime.sendPending().catch(() => {})} type="button"><Send size={18} aria-hidden="true" /> Registrar conteo</button></div>
  </article>
}

function RegisterCountButton({ runtime }: { runtime: CashierV4Runtime }) {
  return <div className="cajero-send-bar cajero-send-bar--compact">
    <button className="button button--secondary" disabled={runtime.getSnapshot().busy || runtime.pendingCount === 0}
      onClick={() => void runtime.sendPending().catch(() => {})} type="button"><Send size={18} aria-hidden="true" /> Registrar conteo</button>
  </div>
}

type CajeroHomeStep = Exclude<CashierV4NextAction, 'none'>

const homeStepCopy: Record<CajeroHomeStep, { label: string; description: string }> = {
  coverage: { label: 'Conteo', description: 'Completa los grupos pendientes de la cobertura quincenal.' },
  review: { label: 'Revisar', description: 'Recuenta los casos que requieren una nueva verificación física.' },
  daily: { label: 'Diario', description: 'Registra los grupos habilitados para el conteo diario.' },
}

function initialCashierStockType(): CashierV4StockType {
  if (typeof window === 'undefined' || typeof window.location?.search !== 'string') return 'positive'
  const value = new URLSearchParams(window.location.search).get('stock')
  return value === 'zero' || value === 'negative' || value === 'positive' ? value : 'positive'
}

function HomeMetricSurface({ icon: Icon, label, value, emphasized = false, tone, wide = false, onClick, ariaLabel }: {
  icon: typeof Home
  label: string
  value: number
  emphasized?: boolean
  tone?: 'warning' | 'danger'
  wide?: boolean
  onClick?: () => void
  ariaLabel?: string
}) {
  const className = [
    'cajero-home-metric',
    onClick ? 'cajero-home-metric--action' : '',
    emphasized ? 'cajero-home-metric--emphasized' : '',
    tone ? `cajero-home-metric--${tone}` : '',
    wide ? 'cajero-home-metric--wide' : '',
  ].filter(Boolean).join(' ')
  const body = <><Icon size={23} aria-hidden="true" /><span>{label}</span>
    <div className="cajero-home-metric__value"><strong>{value}</strong><small>pendientes</small></div></>
  return onClick
    ? <button aria-label={ariaLabel ?? `Abrir ${label}`} className={className} onClick={onClick} type="button">{body}</button>
    : <article className={className} aria-label={ariaLabel}>{body}</article>
}

function CoverageSurface({ label, counted, total, pending, percent, emphasized, onClick }: {
  label: string
  counted: number
  total: number
  pending: number
  percent: number
  emphasized?: boolean
  onClick?: () => void
}) {
  const className = `cajero-coverage-card${onClick ? ' cajero-coverage-card--action' : ''}${emphasized ? ' cajero-coverage-card--emphasized' : ''}`
  const body = <><div className="cajero-coverage-card__copy"><span>{label}</span><h2>{counted} / {total}</h2><small>{pending} pendientes</small></div>
    <div className="cajero-progress-ring" role="img" aria-label={`${percent}% completado`}><svg aria-hidden="true" viewBox="0 0 120 120">
      <circle className="cajero-progress-ring__track" cx="60" cy="60" r="52" pathLength="100" />
      <circle className="cajero-progress-ring__value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - percent} /></svg><strong>{percent}%</strong></div></>
  return onClick
    ? <button className={className} aria-label={label} onClick={onClick} type="button">{body}</button>
    : <article className={className} aria-label={label}>{body}</article>
}

function CoverageComplete({ label, counted, total }: { label: string; counted: number; total: number }) {
  return <div className="cajero-period-complete" role="status">
    <ClipboardList aria-hidden="true" size={22} />
    <div><strong>{label} completada</strong><span>{counted} / {total} grupos</span></div>
  </div>
}

function OperationalFlow({ current }: { current: CashierV4NextAction }) {
  const initial = current === 'review' || current === 'daily' ? current : 'coverage'
  const [selected, setSelected] = useState<CajeroHomeStep>(initial)
  const renderStep = (step: CajeroHomeStep) => {
    const item = homeStepCopy[step]
    const isCurrent = current === step
    return <button className={`cajero-home-flow__step${isCurrent ? ' is-current' : ''}`} aria-current={isCurrent ? 'step' : undefined}
      aria-pressed={selected === step} onClick={() => setSelected(step)} type="button">
      <span>{item.label}</span>{isCurrent ? <small>Ahora</small> : null}
    </button>
  }
  return <section className="cajero-home-flow" aria-labelledby="cajero-home-flow-title">
    <div className="cajero-home-flow__heading"><h2 id="cajero-home-flow-title">Flujo operativo</h2><span>Selecciona una etapa para conocer su función.</span></div>
    <div className="cajero-home-flow__steps">
      {renderStep('coverage')}<span className="cajero-home-flow__connector" aria-hidden="true" />
      {renderStep('review')}<span className="cajero-home-flow__connector" aria-hidden="true" />
      {renderStep('daily')}
    </div>
    <div className="cajero-home-flow__description" aria-live="polite">
      <strong>{homeStepCopy[selected].label}</strong><p>{homeStepCopy[selected].description}</p>
    </div>
  </section>
}

function CajeroV4Header({ runtime, onLogout }: { runtime: CashierV4Runtime; onLogout: () => Promise<void> }) {
  const { state } = useCashierV4(), b = state.bootstrap!
  const now = Math.max(useCajeroServerClock(runtime.store.serverOffsetMs), runtime.serverNow())
  const [stockOpen, setStockOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const stockRef = useRef<HTMLDivElement>(null)
  const logoutConfirmRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!stockOpen) return
    const outside = (e: PointerEvent) => { if (!stockRef.current?.contains(e.target as Node)) setStockOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setStockOpen(false) }
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [stockOpen])
  useEffect(() => {
    if (!confirmLogout) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = logoutConfirmRef.current
    dialog?.querySelector<HTMLElement>('button')?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setConfirmLogout(false); return }
      if (event.key !== 'Tab' || !dialog) return
      const nodes = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')]
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keys)
    return () => { window.removeEventListener('keydown', keys); previousFocus?.focus() }
  }, [confirmLogout])
  const stock = state.stock
  const session = state.panel_state?.session
  const visualSession = session && now < Date.parse(session.expira_at) ? session : null
  // Shared visual formatter only; operational permission continues to come from V4 capability.
  const presentation = getCajeroStockPresentation({ snapshot_at: stock?.capturado_at ?? null,
    snapshot_expira_at: stock?.snapshot_expira_at ?? null, disponible: Boolean(stock?.snapshot_id),
    vigente: Boolean(stock?.snapshot_id && now < Date.parse(stock.snapshot_expira_at ?? '')) }, visualSession, now)
  return <header className="cajero-header"><div className="cajero-header__topline">
    <button aria-label="Ir a Inicio" className="cajero-header__brand" onClick={() => navigateTo('/cajero')} type="button"><img alt="SOLOG" src="/Logo_SOLOG.png" /></button>
    <strong className="cajero-header__site">PR {b.site.nombre}</strong>
    <div className="cajero-header__actions"><div className="cajero-stock-indicator" ref={stockRef}>
      <button className={`cajero-stock-indicator__trigger cajero-stock-indicator__trigger--${presentation.state}`}
        aria-expanded={stockOpen} aria-haspopup="dialog" onClick={() => setStockOpen(!stockOpen)} type="button">{presentation.countdown ?? presentation.label}</button>
      {stockOpen ? <section className="cajero-stock-indicator__popover" role="dialog" aria-label="Estado del inventario">
        <strong>Estado del inventario</strong><p>{formatCajeroElapsed(stock?.capturado_at ? now - Date.parse(stock.capturado_at) : null)}</p>
        <p>Vigente hasta {clock(stock?.snapshot_expira_at)}</p>
        {state.panel_state ? <p>Sesión hasta {clock(state.panel_state.session.expira_at)}</p> : null}
      </section> : null}</div>
      <button aria-label="Cerrar sesión" className="cajero-header__logout" disabled={runtime.getSnapshot().busy}
        onClick={() => state.panel_state?.session.estado === 'activo' ? setConfirmLogout(true) : void runtime.logoutSafe(onLogout).catch(() => {})}
        type="button"><LogOut aria-hidden="true" size={21} /><span>Salir</span></button>
    </div></div>
    {confirmLogout ? <div className="cajero-confirmation-backdrop">
      <section className="cajero-confirmation" role="dialog" aria-modal="true" aria-labelledby="cajero-logout-title" ref={logoutConfirmRef}>
        <h2 id="cajero-logout-title">¿Salir del conteo?</h2>
        <p>Al salir, la sesión de conteo activa se finalizará. Los conteos pendientes se intentarán guardar antes de cerrar sesión.</p>
        <div className="cajero-confirmation__actions">
          <button className="button button--secondary" disabled={runtime.getSnapshot().busy} onClick={() => setConfirmLogout(false)} type="button">Cancelar</button>
          <button className="button button--danger" disabled={runtime.getSnapshot().busy}
            onClick={() => { setConfirmLogout(false); void runtime.logoutSafe(onLogout).catch(() => {}) }} type="button">
            <LogOut size={18} aria-hidden="true" /> Salir
          </button>
        </div>
      </section>
    </div> : null}</header>
}

export function CajeroV4Inicio({ runtime }: { runtime: CashierV4Runtime }) {
  const { state } = useCashierV4(), panel = state.panel_state
  const coverage = selectCashierV4Coverage(state), summary = selectCashierV4OperationalSummary(state)
  const busy = runtime.getSnapshot().busy
  const preparedStart = runtime.getSnapshot().preparedStart
  const now = Math.max(useCajeroServerClock(runtime.store.serverOffsetMs), runtime.serverNow())
  const [stockTypeCounts] = useState(() => ({ positive: 0, zero: 0, negative: 0 }))
  const counts = panel ? selectCashierV4CoveragePendingByStockType(panel) : stockTypeCounts
  const coverageComplete = Boolean(coverage && coverage.coverage_pending === 0)
  const active = Boolean(panel)
  const routeAllowed = (route: CashierRoute) => getCashierV4RouteAccess(state, route, now).allowed
  const coverageAllowed = active && routeAllowed('/cajero/conteo')
  const reviewAllowed = active && routeAllowed('/cajero/revisar')
  const dailyAllowed = active && routeAllowed('/cajero/diario')
  const start = async () => { try { navigateTo(await runtime.start()) } catch { /* Error exposed by runtime. */ } }

  return <section className="cajero-module cajero-home" aria-labelledby="cajero-inicio-title">
    <div className="cajero-home__heading"><h1 id="cajero-inicio-title">Inicio</h1></div>

    <section className="cajero-stock-card cajero-stock-card--updated">
      <div className="cajero-stock-card__status"><div><h2>{state.stock?.snapshot_id ? 'Inventario disponible' : 'No hay un inventario disponible'}</h2>
        {state.bootstrap?.start_capability.reason && !panel ? <p>{getCashierV4ErrorPolicy(new SologApiError(state.bootstrap.start_capability.reason as SologErrorCode)).message}</p> : null}</div></div>
      <div className="cajero-stock-card__actions">
        {panel && !preparedStart
          ? <button className="button button--secondary" disabled={busy} onClick={() => void runtime.finish().catch(() => {})} type="button">Finalizar conteo</button>
          : <button className="button" disabled={busy || runtime.requiresRefresh || preparedStart?.prepared_start.status === 'conflict' ||
            (!preparedStart && (!state.bootstrap?.start_capability.allowed || runtime.pendingCount > 0 || runtime.hasBlockingRecovery || Boolean(runtime.getSnapshot().error)))}
            onClick={() => void start()} type="button"><Play size={19} aria-hidden="true" />{busy ? 'Iniciando…' : preparedStart ? 'Reintentar inicio' : 'Iniciar conteo'}</button>}
      </div>
    </section>

    {coverage && !coverageComplete ? <CoverageSurface label={coverage.label} counted={coverage.coverage_counted} total={coverage.coverage_total}
      pending={coverage.coverage_pending} percent={coverage.coverage_percent} emphasized={panel?.next_action === 'coverage'}
      onClick={coverageAllowed ? () => navigateTo('/cajero/conteo') : undefined} /> : null}

    {coverage && coverageComplete ? <CoverageComplete label={coverage.label} counted={coverage.coverage_counted} total={coverage.coverage_total} /> : null}

    {!active && !coverageComplete && summary ? <OperationalFlow current={summary.next_action} /> : null}

    {!active && coverageComplete && summary ? <div className="cajero-home-metrics cajero-home-metrics--operations" aria-label="Trabajo operativo">
      <HomeMetricSurface icon={SearchCheck} label="Revisar" value={summary.kpis.review_pending} emphasized={summary.next_action === 'review'} />
      <HomeMetricSurface icon={CalendarClock} label="Conteo diario" value={summary.kpis.daily_pending} emphasized={summary.next_action === 'daily'} />
    </div> : null}

    {active && !coverageComplete && panel ? <>
      <div className="cajero-home-metrics cajero-home-metrics--stock" aria-label="Resumen de cobertura por stock">
        <HomeMetricSurface icon={ClipboardList} label="Stock 0" value={counts.zero} tone="warning"
          onClick={coverageAllowed ? () => navigateTo('/cajero/conteo?stock=zero') : undefined} />
        <HomeMetricSurface icon={AlertTriangle} label="Stock negativo" value={counts.negative} tone="danger"
          onClick={coverageAllowed ? () => navigateTo('/cajero/conteo?stock=negative') : undefined} />
      </div>
      <div className="cajero-home-metrics cajero-home-metrics--stacked">
        <HomeMetricSurface icon={SearchCheck} label="Revisar" value={panel.kpis.review_pending} wide emphasized={panel.next_action === 'review'}
          onClick={reviewAllowed ? () => navigateTo('/cajero/revisar') : undefined} />
        <PendingRegistration runtime={runtime} />
      </div>
    </> : null}

    {active && coverageComplete && panel ? <>
      <div className="cajero-home-metrics cajero-home-metrics--operations" aria-label="Trabajo operativo">
        <HomeMetricSurface icon={SearchCheck} label="Revisar" value={panel.kpis.review_pending} emphasized={panel.next_action === 'review'}
          onClick={reviewAllowed ? () => navigateTo('/cajero/revisar') : undefined} />
        <HomeMetricSurface icon={CalendarClock} label="Conteo diario" value={panel.kpis.daily_pending} emphasized={panel.next_action === 'daily'}
          onClick={dailyAllowed ? () => navigateTo('/cajero/diario') : undefined} />
      </div>
      <div className="cajero-home-metrics cajero-home-metrics--stacked"><PendingRegistration runtime={runtime} /></div>
    </> : null}

    <section className="cajero-home-appearance"><div><Palette size={20} aria-hidden="true" /><h2>Apariencia</h2></div><PaletteSwitcher variant="home" /></section>
  </section>
}

function Capture({ runtime, groups, action, title, initialGroupId, onClose, onNextCategory }: {
  runtime: CashierV4Runtime; groups: CashierV4Group[]; action: Exclude<CashierV4NextAction, 'none'>; title: string; initialGroupId?: string; onClose: () => void; onNextCategory?: () => void
}) {
  const titleId = useId(), dialogRef = useRef<HTMLElement>(null), closeRef = useRef(onClose)
  const [selected, setSelected] = useState(initialGroupId ?? null)
  const [expressions, setExpressions] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const group = groups.find(group => group.grupo_id === selected)
  const scope = runtime.coordinator.activeScope(), record = runtime.getSnapshot().records.find(item =>
    item.scope.conteo_id === scope?.conteo_id && item.scope.groups_revision === scope.groups_revision) ?? null
  const reviewQueue = runtime.store.getSnapshot().panel_state?.review_queue ?? []
  const reviewEntry = reviewQueue.find(item => item.grupo_id === selected)
  const draft = action === 'review' ? record?.recount.find(item => item.detalle_id === reviewEntry?.detalle_id) : record?.normal.find(item => item.grupo_id === selected)
  const localDraftForGroup = (item: CashierV4Group) => {
    if (action !== 'review') return record?.normal.find(draftItem => draftItem.grupo_id === item.grupo_id)
    const entry = reviewQueue.find(queueItem => queueItem.grupo_id === item.grupo_id)
    return entry ? record?.recount.find(draftItem => draftItem.detalle_id === entry.detalle_id) : undefined
  }
  const registeredCount = groups.filter(item => Boolean(localDraftForGroup(item))).length
  const percentage = groups.length > 0 ? Math.round((registeredCount / groups.length) * 100) : 0
  const expression = selected ? expressions[selected] ?? draft?.metadata?.expression ?? (draft ? String(draft.stock_fisico) : '') : ''
  const evaluation = evaluateCajeroExpression(expression), physical = evaluation.status === 'valid' ? evaluation.value : null
  const difference = group && physical !== null ? physical - group.stock_teorico : null
  const valuation = group && difference !== null ? calculateCajeroValuationPreview(difference, group.precio, group.unidades_por_paquete, group.precio_paquete) : null
  const canCapture = runtime.canCapture(action)
  const activeIndex = group ? groups.findIndex(item => item.grupo_id === group.grupo_id) : -1
  const hasInput = expression.trim().length > 0
  const canNavigateNext = activeIndex >= 0 && (activeIndex < groups.length - 1 || (action !== 'review' && Boolean(onNextCategory)))
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current() }
      if (e.key !== 'Tab') return
      const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]') ?? [])]
      const first = nodes[0], last = nodes.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keys)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keys); previousFocus?.focus() }
  }, [])
  const navigateNext = () => {
    if (activeIndex < 0) return
    const next = groups[activeIndex + 1]
    if (next) { setSelected(next.grupo_id); return }
    if (action !== 'review' && onNextCategory) { setSelected(null); onNextCategory(); return }
    setSelected(null)
  }
  const continueToNext = () => {
    if (!group) return
    if (!hasInput) { if (canNavigateNext) navigateNext(); return }
    if (!canCapture || physical === null) return
    try {
      runtime.capture(action, group.grupo_id, physical, expression); setError(null)
      navigateNext()
    } catch (e) { setError(getCashierV4ErrorPolicy(e).message) }
  }
  return <div className="cajero-capture-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="cajero-capture-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
      <header className="cajero-capture-modal__header"><button className="cajero-capture-modal__icon-button" aria-label="Regresar a la lista" onClick={() => setSelected(null)} type="button"><ArrowLeft size={22} /></button>
        <h2 id={titleId}>{title}</h2><strong>{registeredCount}/{groups.length} contados</strong><button className="cajero-capture-modal__icon-button" aria-label="Cerrar" onClick={onClose} type="button"><X size={22} /></button></header>
      <div className="cajero-capture-modal__progress" aria-label={`${percentage}% registrado`}>
        <span aria-hidden="true"><span style={{ width: `${percentage}%` }} /></span><strong>{percentage}%</strong>
      </div>
      <div className={`cajero-capture-modal__body${group ? ' cajero-capture-modal__body--detail' : ''}`}>
        {group ? <div className="cajero-capture-detail"><div className="cajero-capture-detail__information"><section className="cajero-capture-detail__card">
          <div className="cajero-capture-detail__card-heading"><h3>{group.nombre}</h3>
            <button aria-label="Agregar observación (próximamente)" className="cajero-capture-detail__observation-button" disabled type="button"><MessageSquarePlus aria-hidden="true" size={20} /></button>
          </div>{group.productos.length > 1 ? <details><summary>Productos incluidos</summary><ul>{group.productos.map(p => <li key={p.c_interno}>{p.producto} - #{p.c_interno}</li>)}</ul></details> : null}
          {reviewEntry && action === 'review' ? <p>Última diferencia: {formatCajeroDifference(reviewEntry.ultima_diferencia)}</p> : null}
          <dl><div><dt>Stock TumiSoft</dt><dd>{group.stock_teorico}</dd></div><div><dt>Conteo</dt><dd>{physical ?? '—'}</dd></div>
            <div><dt>Diferencia</dt><dd>{formatCajeroDifference(difference)}</dd></div><div><dt>Valorizado</dt><dd>{valuation === null ? '—' : formatCajeroCurrency(valuation)}</dd></div></dl>
        </section></div>{error ? <div role="alert" className="cajero-alert cajero-alert--error">{error}</div> : null}
          <CajeroCalculator expression={expression} disabled={!canCapture} onChange={value => setExpressions(current => ({ ...current, [group.grupo_id]: value }))} />
          <nav className="cajero-capture-detail__navigation" aria-label="Navegación entre grupos">
            <button className="button button--secondary" disabled={activeIndex <= 0} onClick={() => setSelected(groups[activeIndex - 1]?.grupo_id ?? null)} type="button">Anterior</button>
            <button className="button button--secondary" onClick={() => setSelected(null)} type="button">Regresar</button>
            <button className="button" disabled={hasInput ? !canCapture || physical === null : !canNavigateNext} onClick={continueToNext} type="button">{hasInput ? 'Continuar' : 'Siguiente'}</button>
          </nav>
        </div> : <div className="cajero-capture-summary"><div className="cajero-capture-summary__head"><span>Nombre</span><span>Stock TumiSoft</span><span>Diferencia</span><span /></div>
          <div className="cajero-capture-summary__rows">{groups.map(item => {
            const itemDraft = localDraftForGroup(item)
            const itemDifference = itemDraft ? itemDraft.stock_fisico - item.stock_teorico : null
            return <button className={itemDraft ? 'is-counted' : undefined} key={item.grupo_id} onClick={() => setSelected(item.grupo_id)} type="button">
              <strong>{item.nombre}</strong><span>{item.stock_teorico}</span><span className={getCajeroDifferenceClass(itemDifference)}>{formatCajeroDifference(itemDifference)}</span><span>›</span></button>
          })}</div></div>}
      </div>
    </section>
  </div>
}

function CajeroV4Work({ runtime, action }: { runtime: CashierV4Runtime; action: Exclude<CashierV4NextAction, 'none'> }) {
  const { state } = useCashierV4(), panel = state.panel_state
  const [stockType, setStockType] = useState<CashierV4StockType>(() => initialCashierStockType())
  const [category, setCategory] = useState<string | null>(null), [reviewGroup, setReviewGroup] = useState<string | null>(null)
  const [differenceSigns, setDifferenceSigns] = useState({ positive: true, negative: true })
  const review = selectCashierV4ReviewEntries(panel)
  const groups = action === 'review' ? review.map(entry => entry.group) : action === 'coverage' ? selectCashierV4CoverageGroups(panel) : selectCashierV4DailyGroups(panel)
  const categories = action === 'coverage' ? selectCashierV4CoveragePendingByCategory(panel) : selectCashierV4DailyPendingByCategory(panel)
  const visible = action === 'coverage' ? groups.filter(group => cashierV4StockType(group.stock_teorico) === stockType) : groups
  const counts = selectCashierV4CoveragePendingByStockType(panel)
  const title = action === 'review' ? 'Revisar' : action === 'coverage' ? 'Conteo' : 'Conteo diario'
  const modalGroups = action === 'review' ? groups : visible.filter(group => group.categoria_id === category)
  const selectableCategories = action === 'review' ? [] : categories.filter(item => visible.some(group => group.categoria_id === item.categoria_id))
  const selectedCategory = categories.find(item => item.categoria_id === category)
  const selectedCategoryIndex = category ? selectableCategories.findIndex(item => item.categoria_id === category) : -1
  const nextCategory = selectedCategoryIndex >= 0 ? selectableCategories[selectedCategoryIndex + 1] : undefined
  const allowed = runtime.canCapture(action)
  const activeScope = runtime.coordinator.activeScope(), record = runtime.getSnapshot().records.find(item =>
    item.scope.conteo_id === activeScope?.conteo_id && item.scope.groups_revision === activeScope.groups_revision) ?? null
  const countedGroupIds = new Set(record?.normal.map(item => item.grupo_id) ?? [])
  return <section className={`cajero-module cajero-operational${action === 'review' ? ' cajero-review' : ''}`}>
    <div className={`cajero-module__heading cajero-operational__heading${action === 'review' ? ' cajero-review__heading' : ' cajero-operational__heading--with-action'}`}><div><h1>{title}</h1><p>Registra la realidad</p>
      {action === 'daily' ? <p>{panel?.kpis.daily_pending ?? 0} pendientes</p> : null}</div>
      {action === 'review' ? <div className="cajero-segmented-control cajero-segmented-control--symbols" role="group" aria-label="Filtrar por última diferencia">
        {(['positive', 'negative'] as const).map(sign => {
          const active = differenceSigns[sign]
          const otherSign = sign === 'positive' ? 'negative' : 'positive'
          const label = sign === 'positive' ? 'sobrantes' : 'faltantes'
          return <button aria-label={`${active ? 'Ocultar' : 'Mostrar'} ${label}`} aria-pressed={active} className={active ? 'is-active' : undefined}
            key={sign} onClick={() => setDifferenceSigns(current => current[sign] && !current[otherSign] ? current : { ...current, [sign]: !current[sign] })}
            type="button">{sign === 'positive' ? '+' : '−'}</button>
        })}</div> : <RegisterCountButton runtime={runtime} />}</div>
    {action === 'coverage' ? <section className="cajero-selection-level cajero-selection-level--stock"><h2>Tipo de stock</h2><div className="cajero-selection-grid">
      {(Object.keys(stockLabels) as CashierV4StockType[]).map(type => <button aria-pressed={stockType === type} className={stockType === type ? 'is-active' : undefined} key={type} onClick={() => { setStockType(type); setCategory(null) }} type="button">
        <ClipboardList aria-hidden="true" size={23} /><span><strong>{stockLabels[type]}</strong><small>{counts[type]} pendientes</small></span></button>)}</div></section> : null}
    {action === 'review' ? <><div className="cajero-review-list"><div className="cajero-review-list__head"><span>Nombre</span><span>Última diferencia</span><span>Diferencia actual</span></div>
        <div className="cajero-review-list__rows">{review.filter(entry =>
          (entry.queueItem.ultima_diferencia > 0 && differenceSigns.positive)
          || (entry.queueItem.ultima_diferencia < 0 && differenceSigns.negative)
        ).map(({ group, queueItem }) => {
          const draft = record?.recount.find(item => item.detalle_id === queueItem.detalle_id)
          const currentDifference = draft ? draft.stock_fisico - group.stock_teorico : null
          const lastDifference = formatCajeroDifference(queueItem.ultima_diferencia)
          const currentDifferenceLabel = draft ? `diferencia actual ${formatCajeroDifference(currentDifference)}` : 'sin reconteo actual'
          return <button key={queueItem.detalle_id} disabled={!allowed}
            aria-label={`Revisar ${group.nombre}, última diferencia ${lastDifference}, ${currentDifferenceLabel}`}
            onClick={() => setReviewGroup(group.grupo_id)} type="button">
            <strong>{group.nombre}</strong>
            <span className={getCajeroDifferenceClass(queueItem.ultima_diferencia)}>{lastDifference}</span>
            <span className="cajero-review-transition">{draft ? <><span className="cajero-review-transition__arrow" aria-hidden="true">→</span>
              <span className={getCajeroDifferenceClass(currentDifference)}>{formatCajeroDifference(currentDifference)}</span></> : '—'}</span>
            <span>›</span></button>
        })}</div></div></> : <section className="cajero-selection-level"><h2>Categorías</h2><div className="cajero-selection-grid">
      {categories.map(item => {
        const categoryGroups = visible.filter(group => group.categoria_id === item.categoria_id)
        if (!categoryGroups.length) return null
        const completed = categoryGroups.filter(group => countedGroupIds.has(group.grupo_id)).length
        const Icon = getCajeroCategoryIcon(item.categoria)
        return <button key={item.categoria_id} disabled={!allowed} onClick={() => setCategory(item.categoria_id)} type="button"><Icon size={24} aria-hidden="true" /><span><strong>{item.categoria}</strong><small>{completed}/{categoryGroups.length} contados</small></span></button>
      })}</div></section>}
    {(category || reviewGroup) && modalGroups.length > 0 ? <Capture key={`${panel?.session.id}:${category ?? reviewGroup}`} runtime={runtime} action={action} groups={modalGroups} title={selectedCategory?.categoria ?? 'Revisar'} initialGroupId={reviewGroup ?? undefined}
      onClose={() => { setCategory(null); setReviewGroup(null) }} onNextCategory={nextCategory ? () => setCategory(nextCategory.categoria_id) : undefined} /> : null}
  </section>
}

export function CajeroV4({ runtime, route, onLogout }: { runtime: CashierV4Runtime; route: CashierRoute; onLogout: () => Promise<void> }) {
  const { state } = useCashierV4()
  const local = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  // After contextual refresh, the last timer tick may predate the new server offset.
  // Read current adjusted time as well; capability still controls every permission.
  const now = Math.max(useCajeroServerClock(runtime.store.serverOffsetMs), runtime.serverNow())
  const access = getCashierV4RouteAccess(state, route, now)
  const allowed = access.allowed, redirect = access.allowed ? null : access.redirect
  useEffect(() => { if (redirect) replaceRoute(redirect) }, [redirect])
  const error = local.error ?? state.error, policy = error ? getCashierV4ErrorPolicy(error) : null
  const captureClosed = state.panel_state?.next_action !== 'none' && state.panel_state &&
    !canCashierV4CaptureForSession(state, state.panel_state.session.id, now)
  const closeVisible = local.closeState !== 'idle' && local.closeState !== 'finished'
  const autoCloseDue = runtime.shouldAutoClose(now)
  useEffect(() => {
    if (!autoCloseDue || local.busy) return
    void runtime.autoCloseExpiredSession().catch(() => {})
  }, [autoCloseDue, local.busy, runtime])
  return <div className="cajero-shell"><CajeroV4Header runtime={runtime} onLogout={onLogout} /><main className="cajero-main">
    {(autoCloseDue || closeVisible) ? <CajeroCloseNotice runtime={runtime} /> : null}
    {!autoCloseDue && !closeVisible && runtime.recoveryPending.length ? <div className="cajero-alert cajero-alert--warning" role="status"><AlertTriangle size={22} aria-hidden="true" /><p>Hay conteos pendientes de envío. Se conservan en este dispositivo hasta poder completar su guardado.</p></div> : null}
    {!autoCloseDue && !closeVisible && (captureClosed || (runtime.requiresRefresh && !policy)) ? <div className="cajero-alert cajero-alert--warning" role="status"><p>Esta sesión requiere consultar el estado actualizado del panel; los pendientes locales se conservan.</p>
      <button className="button button--secondary" disabled={local.busy || state.loading} onClick={() => void runtime.refresh().catch(() => {})} type="button">Actualizar</button></div> : null}
    {!closeVisible && policy ? <div className="cajero-alert cajero-alert--error" role="alert"><p>{policy.message}</p>
      {policy.requiresRefresh || runtime.requiresRefresh ? <button className="button button--secondary" disabled={local.busy || state.loading} onClick={() => void runtime.refresh().catch(() => {})} type="button">Actualizar</button> : null}
      <button className="cajero-alert__dismiss" aria-label="Cerrar mensaje" onClick={runtime.clearError} type="button"><X size={18} /></button></div> : null}
    {!allowed || route === '/cajero' ? <CajeroV4Inicio runtime={runtime} /> : route === '/cajero/historial' ? <CajeroHistorial session={{ serverOffsetMs: runtime.store.serverOffsetMs, cacheRevision: local.revision,
      getCachedHistory: runtime.getCachedHistory, loadHistory: runtime.loadHistory }} /> : <CajeroV4Work key={route} runtime={runtime} action={route === '/cajero/revisar' ? 'review' : route === '/cajero/conteo' ? 'coverage' : 'daily'} />}
  </main><nav className="cajero-nav" aria-label="Panel Cajero"><div className="cajero-nav__inner">{selectCashierV4BottomNavigation(state, now).map(item => {
    const Icon = icons[item.route]
    return <button className={route === item.route ? 'cajero-nav__item is-active' : 'cajero-nav__item'} aria-current={route === item.route ? 'page' : undefined}
      key={item.route} onClick={() => navigateTo(item.route)} type="button"><Icon size={22} aria-hidden="true" /><span>{item.label}</span></button>
  })}</div></nav></div>
}
