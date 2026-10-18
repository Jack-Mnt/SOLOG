import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  CalendarDays, ChevronDown, ChevronUp, Clock3, Info, Layers,
  Store, TrendingUp,
} from 'lucide-react'
import type { MetricsQuality, SiteOverview } from './admin.dashboard.metrics.types'
import type { DashboardMetricsStore } from './admin.dashboard.metrics.store'
import { DashboardRiskPanel } from './admin.dashboard.metrics.risk'
import { DashboardRoundsPanel } from './admin.dashboard.metrics.rounds'
import { DashboardEpisodesPanel } from './admin.dashboard.metrics.episodes'
import { DashboardActivityPanel } from './admin.dashboard.metrics.activity'
import { DashboardDayDrawer } from './admin.dashboard.metrics.day'

type DashboardTab = 'risk' | 'rounds' | 'episodes' | 'activity'
const DASHBOARD_TABS: readonly {
  id: DashboardTab
  label: string
  Icon: typeof TrendingUp
}[] = [
  { id: 'risk', label: 'Riesgo', Icon: TrendingUp },
  { id: 'rounds', label: 'Rondas', Icon: Layers },
  { id: 'episodes', label: 'Episodios', Icon: Clock3 },
  { id: 'activity', label: 'Actividad', Icon: CalendarDays },
]

const intFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 })
const penFormat = new Intl.NumberFormat('es-PE', {
  style: 'currency', currency: 'PEN', minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function numberLabel(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? intFormat.format(value) : 'N/D'
}

function percentLabel(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${decimalFormat.format(value)} %` : 'N/D'
}

function currencyLabel(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? penFormat.format(value) : 'N/D'
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00-05:00`)
  return Number.isNaN(date.getTime()) ? 'N/D' : new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date)
}

function QualityNotice({ value }: { value: MetricsQuality }) {
  if (value === 'complete') return null
  return (
    <span className="solog-dash__quality" title={
      value === 'partial' ? 'Hay información parcial o imputada.' : 'No se dispone de información verificable.'
    }>
      <Info size={13} aria-hidden="true" />
      {value === 'partial' ? 'Datos parciales' : 'Sin datos'}
    </span>
  )
}

/** Indisponibilidad explícita para cifras principales; no sustituye ceros reales. */
function UnavailableMetric() {
  return <span className="solog-dash__metric-unavailable">
    <Info size={16} aria-hidden="true" />
    Sin datos
  </span>
}

function Metric({
  title, description, children, className = '',
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={title} className={`solog-dash__metric ${className}`}>
      <div className="solog-dash__metric-heading">
        <span className="solog-dash__metric-title">{title}</span>
        {description && <span className="solog-dash__metric-meta">{description}</span>}
      </div>
      {children}
    </section>
  )
}

function CoverageMetric({ site }: { site: SiteOverview }) {
  const { counted, required, percent, quality } = site.round
  const haveEvidence = counted !== null && required !== null
  return (
    <Metric title="Cobertura de ronda" description={`Ronda ${site.round.round}`}
      className="solog-dash__metric--coverage">
      <div className="solog-dash__metric-lead">
        {percent === null
          ? <UnavailableMetric />
          : <strong className="solog-dash__main-number">{percentLabel(percent)}</strong>}
        <span className="solog-dash__fraction" aria-label={
          haveEvidence ? `${counted} de ${required} grupos` : 'Cantidad de grupos no disponible'
        }>
          {haveEvidence ? `${numberLabel(counted)} / ${numberLabel(required)}` : ''}
        </span>
      </div>
      {percent !== null && required !== null && required > 0 ? (
        <progress value={Math.max(0, Math.min(100, percent))} max={100}
          aria-label={`Cobertura de ronda de ${site.site_name}`} />
      ) : (
        <div className="solog-dash__progress-empty" aria-hidden="true" />
      )}
      <div className="solog-dash__metric-footer">
        <span>{required === 0 && quality === 'complete' ? 'Sin grupos exigibles' : `Desde ${dateLabel(site.round.period_from)}`}</span>
        {(quality !== 'no_data' || percent !== null) && <QualityNotice value={quality} />
      </div>
    </Metric>
  )
}

function AccuracyMetric({ site }: { site: SiteOverview }) {
  const a = site.accuracy
  const values = [
    { title: 'Verde', amount: a.green, width: a.green_percent, tone: 'green' },
    { title: 'Amarillo', amount: a.yellow, width: a.yellow_percent, tone: 'yellow' },
    { title: 'Rojo', amount: a.red, width: a.red_percent, tone: 'red' },
  ] as const
  return (
    <Metric title="Precisión actual" className="solog-dash__metric--accuracy">
      <div className="solog-dash__metric-lead">
        {a.green_percent === null
          ? <UnavailableMetric />
          : <strong className="solog-dash__main-number">{percentLabel(a.green_percent)}</strong>}
        <span className="solog-dash__fraction">Verde · {numberLabel(a.green)} grupos</span>
      </div>
      {a.denominator > 0 ? (
        <div className="solog-dash__accuracy-bar" role="img"
          aria-label={`Precisión: verde ${percentLabel(a.green_percent)}, amarillo ${percentLabel(a.yellow_percent)}, rojo ${percentLabel(a.red_percent)}`}>
          {values.map(item => (
            <span key={item.tone} className={`solog-dash__accuracy-segment solog-dash__accuracy-segment--${item.tone}`}
              style={{ width: `${Math.max(0, Math.min(100, item.width ?? 0))}%` }} />
          ))}
        </div>
      ) : (
        <div className="solog-dash__progress-empty" aria-hidden="true" />
      )}
      <div className="solog-dash__accuracy-legend">
        {values.map(item => <span key={item.tone} className="solog-dash__legend-item">
          <i className={`solog-dash__legend-dot solog-dash__legend-dot--${item.tone}`} aria-hidden="true" />
          {numberLabel(item.amount)} {item.title.toLowerCase()}
        </span>)}
      </div>
      <div className="solog-dash__metric-footer">
        <span>{numberLabel(a.exempt_zero_zero)} exentos 0/0 · {numberLabel(a.without_evidence)} sin evidencia</span>
        {(a.quality !== 'no_data' || a.green_percent !== null) &&
          <QualityNotice value={a.quality} />}
      </div>
    </Metric>
  )
}

function RiskMetric({ site }: { site: SiteOverview }) {
  const available = site.risk.quality !== 'no_data'
  return (
    <Metric title="Riesgo" className="solog-dash__metric--risk">
      {available ? (
        <div className="solog-dash__risk-pair">
          <div>
            <strong className="solog-dash__risk-count solog-dash__risk-count--high">
              {numberLabel(site.risk.high)}
            </strong>
            <span>Alto</span>
          </div>
          <div>
            <strong className="solog-dash__risk-count solog-dash__risk-count--critical">
              {numberLabel(site.risk.very_high)}
            </strong>
            <span>Muy alto</span>
          </div>
        </div>
      ) : <UnavailableMetric />}
      <div className="solog-dash__metric-footer">
        <span>Grupos confirmados</span>
        {available && <QualityNotice value={site.risk.quality} />}
      </div>
    </Metric>
  )
}

function ValuationMetric({ site }: { site: SiteOverview }) {
  return (
    <Metric title="Sobrantes vs Faltantes" className="solog-dash__metric--money">
      <div className="solog-dash__valuation-list">
        {([
          ['Sobrantes', site.surplus, 'positive'],
          ['Faltantes', site.shortage, 'negative'],
        ] as const).map(([label, item, tone]) => (
          <div key={label} className="solog-dash__valuation-row">
            <span className="solog-dash__valuation-name">
              {label}
              <small>{numberLabel(item.groups)} grupos</small>
            </span>
            <strong className={`solog-dash__valuation-amount solog-dash__valuation-amount--${tone}`}>
              {item.value === null ? <UnavailableMetric /> : currencyLabel(item.value)}
            </strong>
            {item.quality !== 'no_data' && <QualityNotice value={item.quality} />}
          </div>
        ))}
      </div>
    </Metric>
  )
}

/** Cuatro vistas analíticas; un único Drawer opcional por sede y fecha física. */
export function DashboardSiteDetail({ site, store }: { site: SiteOverview; store: DashboardMetricsStore }) {
  const [active, setActive] = useState<DashboardTab>('risk')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = DASHBOARD_TABS.length - 1
    let next: number
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return
    event.preventDefault()
    setActive(DASHBOARD_TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="solog-dash__detail">
      <div className="solog-dash__detail-heading">
        <div>
          <p className="solog-dash__eyebrow">Análisis por sede</p>
          <h3>{site.site_name}</h3>
          <span className="solog-dash__detail-subtitle">Riesgo, rondas, episodios y actividad</span>
        </div>
        <QualityNotice value={site.accuracy.quality} />
      </div>
      <div className="solog-dash__tabs-scroll">
        <div role="tablist" aria-label={`Análisis de ${site.site_name}`} className="solog-dash__tabs">
          {DASHBOARD_TABS.map(({ id, label, Icon }, index) => (
            <button key={id} type="button" role="tab"
              ref={node => { tabRefs.current[index] = node }}
              id={`${baseId}-tab-${id}`}
              aria-selected={active === id}
              aria-controls={`${baseId}-panel-${id}`}
              tabIndex={active === id ? 0 : -1}
              onKeyDown={event => onTabKeyDown(event, index)}
              onClick={() => setActive(id)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {DASHBOARD_TABS.map(tab => (
        <section key={tab.id} id={`${baseId}-panel-${tab.id}`} role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          tabIndex={0} hidden={active !== tab.id} className="solog-dash__tab-panel">
          {active === tab.id && (
            tab.id === 'risk' ? (
              <DashboardRiskPanel siteId={site.site_id} store={store} />
            ) : tab.id === 'rounds' ? (
              <DashboardRoundsPanel siteId={site.site_id} store={store} />
            ) : tab.id === 'episodes' ? (
              <DashboardEpisodesPanel siteId={site.site_id} store={store} />
            ) : (
              <DashboardActivityPanel siteId={site.site_id} store={store}
                onSelectDate={setSelectedDate} />
            )
          )}
        </section>
      ))}
      {selectedDate !== null && (
        <DashboardDayDrawer key={`${site.site_id}:${selectedDate}`}
          siteId={site.site_id} siteName={site.site_name}
          date={selectedDate} store={store}
          onClose={() => setSelectedDate(null)} />
      )}
    </div>
  )
}

export function DashboardSiteCard({
  site, expanded, onToggle, store,
}: { site: SiteOverview; expanded: boolean; onToggle: () => void; store: DashboardMetricsStore }) {
  const contentId = `dashboard-site-detail-${site.site_id}`
  return (
    <article className={`admin-v2-card solog-dash__site-card${expanded ? ' solog-dash__site-card--expanded' : ''}`}
      aria-label={`Resumen de ${site.site_name}`}>
      <header className="solog-dash__site-header">
        <h3>
          <button type="button" className="solog-dash__site-trigger"
            onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>
            <span className="solog-dash__site-identity">
              <Store size={19} aria-hidden="true" />
              <span>{site.site_name}</span>
            </span>
            {expanded ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
          </button>
        </h3>
        <span className="solog-dash__round-pill">Ronda {site.round.round} · {dateLabel(site.round.period_from)}</span>
      </header>

      <div className="solog-dash__metric-grid">
        <CoverageMetric site={site} />
        <AccuracyMetric site={site} />
        <RiskMetric site={site} />
        <ValuationMetric site={site} />
      </div>

      <div id={contentId} hidden={!expanded}>
        {expanded && <DashboardSiteDetail site={site} store={store} />}
      </div>
    </article>
  )
}
