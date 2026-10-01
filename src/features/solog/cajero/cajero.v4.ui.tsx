import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowLeft, CalendarClock, ClipboardList, History, Home, LogOut, Palette, Play, SearchCheck, Send, X } from 'lucide-react'
import { navigateTo, replaceRoute } from '../../../lib/router'
import { PaletteSwitcher } from '../../theme/palette-switcher'
import { SologApiError, type SologErrorCode } from '../errors'
import { CajeroCalculator } from './cajero.calculadora'
import { CajeroHistorial } from './cajero.historial'
import { formatCajeroClock, formatCajeroElapsed, getCajeroStockPresentation, useCajeroServerClock } from './cajero.stock'
import { calculateCajeroValuationPreview, evaluateCajeroExpression, formatCajeroCurrency, formatCajeroDifference, getCajeroCategoryIcon } from './cajero.utils'
import type { CashierV4Group, CashierV4NextAction } from './cajero.v4'
import { useCashierV4 } from './cajero.v4.context'
import { canCashierV4CaptureForSession } from './cajero.v4.capability'
import { getCashierV4ErrorPolicy } from './cajero.v4.errors'
import { getCashierV4RouteAccess, selectCashierV4BottomNavigation, type CashierV4Route } from './cajero.v4.navigation'
import { CashierV4Runtime } from './cajero.v4.runtime'
import { cashierV4Destination, cashierV4StockType, selectCashierV4Coverage, selectCashierV4CoverageGroups,
  selectCashierV4CoveragePendingByCategory, selectCashierV4CoveragePendingByStockType, selectCashierV4DailyGroups,
  selectCashierV4DailyPendingByCategory, selectCashierV4OperationalSummary, selectCashierV4ReviewEntries,
  selectCashierV4WaitingForSnapshot, type CashierV4StockType } from './cajero.v4.selectors'

const stockLabels = { positive: 'Stock positivo', zero: 'Stock 0', negative: 'Stock negativo' }
const icons = [Home, ClipboardList, CalendarClock, SearchCheck, History]
const clock = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? formatCajeroClock(Date.parse(value)) : '—'

function PendingSend({ runtime }: { runtime: CashierV4Runtime }) {
  return <article className="cajero-home-metric cajero-home-metric--pending">
    <Send aria-hidden="true" size={23} /><span>Pendientes de envío</span>
    <div className="cajero-home-metric__send-row"><div className="cajero-home-metric__value"><strong>{runtime.pendingCount}</strong><small>pendientes</small></div>
      <button className="button button--secondary" disabled={runtime.getSnapshot().busy || runtime.pendingCount === 0}
        onClick={() => void runtime.sendPending().catch(() => {})} type="button">Enviar pendientes</button></div>
  </article>
}

function CajeroV4Header({ runtime, onLogout }: { runtime: CashierV4Runtime; onLogout: () => Promise<void> }) {
  const { state } = useCashierV4(), b = state.bootstrap!
  const now = Math.max(useCajeroServerClock(runtime.store.serverOffsetMs), runtime.serverNow())
  const [stockOpen, setStockOpen] = useState(false)
  const stockRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stockOpen) return
    const outside = (e: PointerEvent) => { if (!stockRef.current?.contains(e.target as Node)) setStockOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setStockOpen(false) }
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape) }
  }, [stockOpen])
  const stock = state.stock
  // Shared visual formatter only; operational permission continues to come from V4 capability.
  const presentation = getCajeroStockPresentation({ snapshot_at: stock?.capturado_at ?? null,
    snapshot_expira_at: stock?.snapshot_expira_at ?? null, disponible: Boolean(stock?.snapshot_id),
    vigente: Boolean(stock?.snapshot_id && now < Date.parse(stock.snapshot_expira_at ?? '')) }, state.panel_state?.session ?? null, now)
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
      <button aria-label="Cerrar sesión" className="cajero-header__logout" disabled={runtime.getSnapshot().busy} onClick={() => void runtime.logoutSafe(onLogout).catch(() => {})} type="button"><LogOut aria-hidden="true" size={21} /><span>Salir</span></button>
    </div></div></header>
}

export function CajeroV4Inicio({ runtime }: { runtime: CashierV4Runtime }) {
  const { state } = useCashierV4(), panel = state.panel_state
  const coverage = selectCashierV4Coverage(state), summary = selectCashierV4OperationalSummary(state)
  const busy = runtime.getSnapshot().busy
  const preparedStart = runtime.getSnapshot().preparedStart
  const destination = summary ? cashierV4Destination(summary.next_action) : '/cajero'
  const start = async () => { try { navigateTo(await runtime.start()) } catch { /* Error exposed by runtime. */ } }
  return <section className="cajero-module cajero-home" aria-labelledby="cajero-inicio-title">
    <div className="cajero-home__heading"><h1 id="cajero-inicio-title">Inicio</h1></div>
    <section className="cajero-stock-card cajero-stock-card--updated">
      <div className="cajero-stock-card__status"><div><h2>{state.stock?.snapshot_id ? 'Inventario disponible' : 'No hay un inventario disponible'}</h2>
        {state.bootstrap?.start_capability.reason && !panel ? <p>{getCashierV4ErrorPolicy(new SologApiError(state.bootstrap.start_capability.reason as SologErrorCode)).message}</p> : null}</div></div>
      <div className="cajero-stock-card__actions">
        {panel && !preparedStart ? <><button className="button" disabled={!runtime.canCapture(panel.next_action) || destination === '/cajero'} type="button"
          onClick={() => navigateTo(destination)}><Play size={19} aria-hidden="true" /> Continuar conteo</button>
          <button className="button button--secondary" disabled={busy} onClick={() => void runtime.finish().catch(() => {})} type="button">Finalizar conteo</button></>
          : <button className="button" disabled={busy || runtime.requiresRefresh || preparedStart?.prepared_start.status === 'conflict' ||
            (!preparedStart && (!state.bootstrap?.start_capability.allowed || runtime.pendingCount > 0 || Boolean(runtime.getSnapshot().error)))}
            onClick={() => void start()} type="button"><Play size={19} aria-hidden="true" />{busy ? 'Iniciando…' : preparedStart ? 'Reintentar inicio' : 'Iniciar conteo'}</button>}
      </div>
    </section>
    {coverage ? <article className="cajero-coverage-card" aria-label={coverage.label}>
      <div className="cajero-coverage-card__copy"><span>{coverage.label}</span><h2>{coverage.coverage_counted} / {coverage.coverage_total}</h2><small>{coverage.coverage_pending} pendientes</small></div>
      <div className="cajero-progress-ring" role="img" aria-label={`${coverage.coverage_percent}% completado`}><svg aria-hidden="true" viewBox="0 0 120 120">
        <circle className="cajero-progress-ring__track" cx="60" cy="60" r="52" pathLength="100" />
        <circle className="cajero-progress-ring__value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - coverage.coverage_percent} /></svg><strong>{coverage.coverage_percent}%</strong></div>
    </article> : null}
    {selectCashierV4WaitingForSnapshot(state) ? <div className="cajero-empty-state" role="status"><p>Hay grupos esperando una actualización de stock para poder continuar.</p></div> : null}
    <div className="cajero-home-metrics">
      {panel ? <><article className="cajero-home-metric"><CalendarClock size={23} aria-hidden="true" /><span>Conteo diario</span><strong>{panel.kpis.daily_pending} pendientes</strong></article>
        <article className="cajero-home-metric"><SearchCheck size={23} aria-hidden="true" /><span>Revisar</span><strong>{panel.kpis.review_pending} pendientes</strong></article></> : null}
      <PendingSend runtime={runtime} />
    </div>
    <section className="cajero-home-appearance"><div><Palette size={20} aria-hidden="true" /><h2>Apariencia</h2></div><PaletteSwitcher variant="home" /></section>
  </section>
}

function Capture({ runtime, groups, action, title, initialGroupId, onClose }: {
  runtime: CashierV4Runtime; groups: CashierV4Group[]; action: Exclude<CashierV4NextAction, 'none'>; title: string; initialGroupId?: string; onClose: () => void
}) {
  const titleId = useId(), dialogRef = useRef<HTMLElement>(null), closeRef = useRef(onClose)
  const [selected, setSelected] = useState(initialGroupId ?? null)
  const [expressions, setExpressions] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const group = groups.find(group => group.grupo_id === selected)
  const scope = runtime.coordinator.activeScope(), record = runtime.getSnapshot().records.find(item =>
    item.scope.conteo_id === scope?.conteo_id && item.scope.groups_revision === scope.groups_revision) ?? null
  const reviewEntry = runtime.store.getSnapshot().panel_state?.review_queue.find(item => item.grupo_id === selected)
  const draft = action === 'review' ? record?.recount.find(item => item.detalle_id === reviewEntry?.detalle_id) : record?.normal.find(item => item.grupo_id === selected)
  const expression = selected ? expressions[selected] ?? draft?.metadata?.expression ?? (draft ? String(draft.stock_fisico) : '') : ''
  const evaluation = evaluateCajeroExpression(expression), physical = evaluation.status === 'valid' ? evaluation.value : null
  const difference = group && physical !== null ? physical - group.stock_teorico : null
  const valuation = group && difference !== null ? calculateCajeroValuationPreview(difference, group.precio, group.unidades_por_paquete, group.precio_paquete) : null
  const canCapture = runtime.canCapture(action)
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
  const save = () => {
    if (!group || physical === null) return
    try {
      runtime.capture(action, group.grupo_id, physical, expression); setError(null)
      const next = groups[groups.findIndex(item => item.grupo_id === group.grupo_id) + 1]
      if (action === 'review') onClose(); else setSelected(next?.grupo_id ?? null)
    } catch (e) { setError(getCashierV4ErrorPolicy(e).message) }
  }
  return <div className="cajero-capture-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="cajero-capture-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
      <header className="cajero-capture-modal__header"><button className="cajero-capture-modal__icon-button" aria-label="Regresar a la lista" onClick={() => setSelected(null)} type="button"><ArrowLeft size={22} /></button>
        <h2 id={titleId}>{title}</h2><button className="cajero-capture-modal__icon-button" aria-label="Cerrar" onClick={onClose} type="button"><X size={22} /></button></header>
      <div className={`cajero-capture-modal__body${group ? ' cajero-capture-modal__body--detail' : ''}`}>
        {group ? <div className="cajero-capture-detail"><div className="cajero-capture-detail__information"><section className="cajero-capture-detail__card">
          <h3>{group.nombre}</h3>{group.productos.length > 1 ? <details><summary>Productos incluidos</summary><ul>{group.productos.map(p => <li key={p.c_interno}>{p.producto} - #{p.c_interno}</li>)}</ul></details> : null}
          {reviewEntry && action === 'review' ? <p>Última diferencia: {formatCajeroDifference(reviewEntry.ultima_diferencia)}</p> : null}
          <dl><div><dt>Stock TumiSoft</dt><dd>{group.stock_teorico}</dd></div><div><dt>Conteo</dt><dd>{physical ?? '—'}</dd></div>
            <div><dt>Diferencia</dt><dd>{formatCajeroDifference(difference)}</dd></div><div><dt>Valorizado</dt><dd>{valuation === null ? '—' : formatCajeroCurrency(valuation)}</dd></div></dl>
        </section></div>{error ? <div role="alert" className="cajero-alert cajero-alert--error">{error}</div> : null}
          <CajeroCalculator expression={expression} disabled={!canCapture} onChange={value => setExpressions(current => ({ ...current, [group.grupo_id]: value }))} />
          <nav className="cajero-capture-detail__navigation"><button className="button button--secondary" onClick={() => setSelected(null)} type="button">Regresar</button>
            <button className="button" disabled={!canCapture || physical === null} onClick={save} type="button">Continuar</button></nav>
        </div> : <div className="cajero-capture-summary"><div className="cajero-capture-summary__head"><span>Nombre</span><span>Stock TumiSoft</span><span>Preparado localmente</span></div>
          <div className="cajero-capture-summary__rows">{groups.map(item => <button key={item.grupo_id} onClick={() => setSelected(item.grupo_id)} type="button">
            <strong>{item.nombre}</strong><span>{item.stock_teorico}</span><span>{record?.normal.some(d => d.grupo_id === item.grupo_id) ? 'Por enviar' : '—'}</span><span>›</span></button>)}</div></div>}
      </div>
    </section>
  </div>
}

function CajeroV4Work({ runtime, action }: { runtime: CashierV4Runtime; action: Exclude<CashierV4NextAction, 'none'> }) {
  const { state } = useCashierV4(), panel = state.panel_state
  const [stockType, setStockType] = useState<CashierV4StockType>('positive')
  const [category, setCategory] = useState<string | null>(null), [reviewGroup, setReviewGroup] = useState<string | null>(null)
  const [differenceFilter, setDifferenceFilter] = useState<'all' | 'positive' | 'negative'>('all')
  const review = selectCashierV4ReviewEntries(panel)
  const groups = action === 'review' ? review.map(entry => entry.group) : action === 'coverage' ? selectCashierV4CoverageGroups(panel) : selectCashierV4DailyGroups(panel)
  const categories = action === 'coverage' ? selectCashierV4CoveragePendingByCategory(panel) : selectCashierV4DailyPendingByCategory(panel)
  const visible = action === 'coverage' ? groups.filter(group => cashierV4StockType(group.stock_teorico) === stockType) : groups
  const counts = selectCashierV4CoveragePendingByStockType(panel)
  const title = action === 'review' ? 'Revisar' : action === 'coverage' ? 'Conteo' : 'Conteo diario'
  const modalGroups = action === 'review' ? groups : visible.filter(group => group.categoria_id === category)
  const selectedCategory = categories.find(item => item.categoria_id === category)
  const allowed = runtime.canCapture(action)
  const activeScope = runtime.coordinator.activeScope(), record = runtime.getSnapshot().records.find(item =>
    item.scope.conteo_id === activeScope?.conteo_id && item.scope.groups_revision === activeScope.groups_revision) ?? null
  return <section className={`cajero-module cajero-operational${action === 'review' ? ' cajero-review' : ''}`}>
    <div className="cajero-module__heading cajero-operational__heading"><div><h1>{title}</h1><p>Registra la realidad</p>
      {action === 'daily' ? <p>{panel?.kpis.daily_pending ?? 0} pendientes</p> : null}</div><PendingSend runtime={runtime} /></div>
    {action === 'coverage' ? <section className="cajero-selection-level cajero-selection-level--stock"><h2>Tipo de stock</h2><div className="cajero-selection-grid">
      {(Object.keys(stockLabels) as CashierV4StockType[]).map(type => <button aria-pressed={stockType === type} className={stockType === type ? 'is-active' : undefined} key={type} onClick={() => { setStockType(type); setCategory(null) }} type="button">
        <ClipboardList aria-hidden="true" size={23} /><span><strong>{stockLabels[type]}</strong><small>{counts[type]} pendientes</small></span></button>)}</div></section> : null}
    {action === 'review' ? <><div className="cajero-review-filter" role="group" aria-label="Filtrar por última diferencia">
      {(['positive', 'negative'] as const).map(sign => <button aria-label={`Mostrar últimas diferencias ${sign === 'positive' ? 'positivas' : 'negativas'}`} aria-pressed={differenceFilter === 'all' || differenceFilter === sign}
        key={sign} onClick={() => setDifferenceFilter(current => current === sign ? 'all' : sign)} type="button">{sign === 'positive' ? '+' : '−'}</button>)}</div>
      <div className="cajero-review-list"><div className="cajero-review-list__head"><span>Nombre</span><span>Última diferencia</span><span>Diferencia actual</span></div>
        <div className="cajero-review-list__rows">{review.filter(entry => differenceFilter === 'all' || (differenceFilter === 'positive' ? entry.queueItem.ultima_diferencia > 0 : entry.queueItem.ultima_diferencia < 0)).map(({ group, queueItem }) => {
          const draft = record?.recount.find(item => item.detalle_id === queueItem.detalle_id)
          return <button key={queueItem.detalle_id} disabled={!allowed} aria-label={`Revisar ${group.nombre}`} onClick={() => setReviewGroup(group.grupo_id)} type="button">
            <strong>{group.nombre}</strong><span>{formatCajeroDifference(queueItem.ultima_diferencia)}</span><span>{formatCajeroDifference(draft ? draft.stock_fisico - group.stock_teorico : null)}</span><span>›</span></button>
        })}</div></div></> : <section className="cajero-selection-level"><h2>Categorías</h2><div className="cajero-selection-grid">
      {categories.map(item => { const pending = visible.filter(group => group.categoria_id === item.categoria_id).length
        if (!pending) return null
        const Icon = getCajeroCategoryIcon(item.categoria)
        return <button key={item.categoria_id} disabled={!allowed} onClick={() => setCategory(item.categoria_id)} type="button"><Icon size={24} aria-hidden="true" /><span><strong>{item.categoria}</strong><small>{pending} pendientes</small></span></button>
      })}</div></section>}
    {(category || reviewGroup) && modalGroups.length > 0 ? <Capture key={`${panel?.session.id}:${category ?? reviewGroup}`} runtime={runtime} action={action} groups={modalGroups} title={selectedCategory?.categoria ?? 'Revisar'} initialGroupId={reviewGroup ?? undefined}
      onClose={() => { setCategory(null); setReviewGroup(null) }} /> : null}
  </section>
}

export function CajeroV4({ runtime, route, onLogout }: { runtime: CashierV4Runtime; route: CashierV4Route; onLogout: () => Promise<void> }) {
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
  return <div className="cajero-shell"><CajeroV4Header runtime={runtime} onLogout={onLogout} /><main className="cajero-main">
    {runtime.recoveryPending.length ? <div className="cajero-alert cajero-alert--warning" role="status"><AlertTriangle size={22} aria-hidden="true" /><p>Hay pendientes de una sesión anterior. Envíalos antes de registrar nuevas capturas. Se conservan en su sesión original.</p></div> : null}
    {captureClosed || (runtime.requiresRefresh && !policy) ? <div className="cajero-alert cajero-alert--warning" role="status"><p>Esta sesión requiere consultar el estado actualizado del panel; los pendientes locales se conservan.</p>
      <button className="button button--secondary" disabled={local.busy || state.loading} onClick={() => void runtime.refresh().catch(() => {})} type="button">Actualizar</button></div> : null}
    {policy ? <div className="cajero-alert cajero-alert--error" role="alert"><p>{policy.message}</p>
      {policy.requiresRefresh || runtime.requiresRefresh ? <button className="button button--secondary" disabled={local.busy || state.loading} onClick={() => void runtime.refresh().catch(() => {})} type="button">Actualizar</button> : null}
      <button className="cajero-alert__dismiss" aria-label="Cerrar mensaje" onClick={runtime.clearError} type="button"><X size={18} /></button></div> : null}
    {!allowed || route === '/cajero' ? <CajeroV4Inicio runtime={runtime} /> : route === '/cajero/historial' ? <CajeroHistorial session={{ serverOffsetMs: runtime.store.serverOffsetMs, cacheRevision: local.revision,
      getCachedHistory: runtime.getCachedHistory, loadHistory: runtime.loadHistory }} /> : <CajeroV4Work key={route} runtime={runtime} action={route === '/cajero/revisar' ? 'review' : route === '/cajero/conteo' ? 'coverage' : 'daily'} />}
  </main><nav className="cajero-nav" aria-label="Panel Cajero"><div className="cajero-nav__inner">{selectCashierV4BottomNavigation(state, now).map((item, i) => {
    const Icon = icons[i]
    return <button className={route === item.route ? 'cajero-nav__item is-active' : 'cajero-nav__item'} aria-current={route === item.route ? 'page' : undefined}
      disabled={!item.available} key={item.route} onClick={() => navigateTo(item.route)} type="button"><Icon size={22} aria-hidden="true" /><span>{item.label}</span></button>
  })}</div></nav></div>
}
