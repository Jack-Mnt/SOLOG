import { useState } from 'react'
import { AlertTriangle, CalendarClock, ClipboardList, SearchCheck } from 'lucide-react'
import type { FullCoveragePresentation } from './full.coverage'

type Step = 'coverage' | 'review' | 'daily'
const steps: Record<Step, { title: string; description: string }> = {
  coverage: { title: 'Conteo', description: 'Grupos por contar en la ronda actual.' },
  review: { title: 'Revisar', description: 'Recuenta los casos que requieren una nueva verificación física.' },
  daily: { title: 'Diario', description: 'Registra los grupos habilitados para un conteo normal en este turno.' },
}

/** Explica el flujo Full; no autoriza navegación ni captura. */
export function FullOperationalFlow({ nextAction }: { nextAction: 'coverage' | 'review' | 'daily' | 'none' }) {
  const initial: Step = nextAction === 'review' || nextAction === 'daily' ? nextAction : 'coverage'
  const [selected, setSelected] = useState<Step>(initial)
  const step = (key: Step) => <button type="button" key={key}
    className={'cajero-home-flow__step' + (nextAction === key ? ' is-current' : '')}
    aria-pressed={selected === key} onClick={() => setSelected(key)}>
    <span>{steps[key].title}</span>{nextAction === key ? <small>Ahora</small> : null}
  </button>
  return <section className="cajero-home-flow" aria-labelledby="full-flow-title">
    <div className="cajero-home-flow__heading">
      <h2 id="full-flow-title">Flujo operativo</h2>
      <span>Selecciona una etapa para conocer su función.</span>
    </div>
    <div className="cajero-home-flow__steps">
      {step('coverage')}<span className="cajero-home-flow__connector" aria-hidden="true"/>
      {step('review')}<span className="cajero-home-flow__connector" aria-hidden="true"/>
      {step('daily')}
    </div>
    <div className="cajero-home-flow__description" aria-live="polite">
      <strong>{steps[selected].title}</strong><p>{steps[selected].description}</p>
    </div>
  </section>
}

export function FullCoverageCard({ coverage, onClick }: {
  coverage: FullCoveragePresentation; onClick?: () => void
}) {
  const { summary, confirmed, provisional, displayed, displayedPercent } = coverage
  const total = summary.coverage_total
  const confirmedPercent = total ? confirmed * 100 / total : 0
  const provisionalPercent = total ? Math.min(provisional * 100 / total, 100 - confirmedPercent) : 0
  const label = 'Cobertura quincenal · Ronda ' + summary.basis.coverage_round
  const ring = <div className="cajero-progress-ring" role="img"
    aria-label={`${confirmed} de ${total} grupos confirmados, ${provisional} provisionales, ${displayedPercent}% de avance visible`}>
    <svg aria-hidden="true" viewBox="0 0 120 120">
      <circle className="cajero-progress-ring__track" cx="60" cy="60" r="52" pathLength="100"/>
      <circle className="cajero-progress-ring__value" cx="60" cy="60" r="52" pathLength="100"
        strokeDasharray={`${confirmedPercent} ${100 - confirmedPercent}`}/>
      {provisionalPercent > 0 ? <circle className="full-progress-ring__provisional"
        cx="60" cy="60" r="52" pathLength="100"
        strokeDasharray={`${provisionalPercent} ${100 - provisionalPercent}`}
        strokeDashoffset={-confirmedPercent}/> : null}
    </svg>
    <strong>{displayedPercent}%</strong>
  </div>
  const content = <>
    <div className="cajero-coverage-card__copy">
      <span>{label}</span><h2>{displayed} / {total}</h2>
      <p>{summary.coverage_pending} grupos pendientes</p>
      <p className="full-coverage-breakdown">
        <span>{confirmed} confirmados</span>
        {provisional > 0 ? <span>{provisional} {provisional === 1 ? 'provisional' : 'provisionales'}</span> : null}
      </p>
    </div>{ring}
  </>
  const cls = 'cajero-coverage-card' + (onClick ? ' cajero-coverage-card--action' : '')
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-label={`Abrir conteo. ${label}. ${displayed} de ${total} grupos, ${provisional} provisionales`}>{content}</button>
    : <article className={cls} aria-label={label}>{content}</article>
}

export function FullCoverageComplete({ coverage }: { coverage: FullCoveragePresentation }) {
  const { summary } = coverage
  return <div className="cajero-period-complete" role="status">
    <ClipboardList size={22} aria-hidden="true"/>
    <div><strong>Cobertura quincenal · Ronda {summary.basis.coverage_round} completada</strong>
      <span>{summary.coverage_counted} / {summary.coverage_total} grupos confirmados</span></div>
  </div>
}

export function FullHomeMetric({ label, value, kind, wide, emphasized, onClick }: {
  label: string; value: number; kind: 'zero' | 'negative' | 'review' | 'daily'
  wide?: boolean; emphasized?: boolean; onClick?: () => void
}) {
  const Icon = kind === 'negative' ? AlertTriangle : kind === 'review' ? SearchCheck
    : kind === 'daily' ? CalendarClock : ClipboardList
  const cls = ['cajero-home-metric', onClick ? 'cajero-home-metric--action' : '',
    kind === 'zero' ? 'cajero-home-metric--warning' : '',
    kind === 'negative' ? 'cajero-home-metric--danger' : '',
    wide ? 'cajero-home-metric--wide' : '',
    emphasized ? 'cajero-home-metric--emphasized' : '',
  ].filter(Boolean).join(' ')
  const workLabel = kind === 'review' ? 'por recontar' : 'por contar'
  const body = <><Icon size={23} aria-hidden="true"/><span>{label}</span>
    <div className="cajero-home-metric__value"><strong>{value}</strong><small>{workLabel}</small></div></>
  return onClick
    ? <button className={cls} type="button" onClick={onClick} aria-label={`Abrir ${label}, ${value} ${workLabel}`}>{body}</button>
    : <article className={cls} aria-label={`${label}: ${value} ${workLabel}`}>{body}</article>
}
