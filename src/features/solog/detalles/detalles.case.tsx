import { useEffect, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import { getSologDifferenceStateLabel } from '../labels'
import type { DetailsStore } from './detalles.store'
import type { DetailsCase, DetailsDetail } from './detalles.v2'
const time = (value: string | null) => value === null ? '—' : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
type DetailsCaseObservationFields = Pick<DetailsCase,
  'motivo_diferencia' | 'observacion_diferencia' | 'observacion_reconteo'>

/** Presentación de solo lectura, separada por momento de registro. */
export function DetailsCaseObservations({ caseData }: { caseData: DetailsCaseObservationFields }) {
  const hasInitial = caseData.observacion_diferencia !== null
  // Cuando no existe nota inicial, el motivo pudo ser incorporado recién en el reconteo.
  const recountReason = !hasInitial && caseData.motivo_diferencia !== null
  const hasRecount = caseData.observacion_reconteo !== null || recountReason
  if (!hasInitial && !hasRecount) return null

  return <section aria-label="Motivo y observaciones del conteo" className="details-case-observations">
    <h3>Motivo y observaciones</h3>
    {hasInitial ? <div className="details-case-observations__entry">
      <h4>Conteo inicial</h4>
      <dl className="details-case-observations__reason">
        <div><dt>Motivo</dt><dd>{caseData.motivo_diferencia}</dd></div>
      </dl>
      <p className="details-case-observations__text">{caseData.observacion_diferencia}</p>
    </div> : null}
    {hasRecount ? <div className="details-case-observations__entry">
      <h4>Reconteo</h4>
      {recountReason ? <dl className="details-case-observations__reason">
        <div><dt>Motivo registrado durante el reconteo</dt><dd>{caseData.motivo_diferencia}</dd></div>
      </dl> : null}
      {caseData.observacion_reconteo !== null
        ? <p className="details-case-observations__text">{caseData.observacion_reconteo}</p>
        : null}
    </div> : null}
  </section>
}

export function DetailsCaseView({ store, caseId }: { store: DetailsStore; caseId: string }) {
  const [detail, setDetail] = useState<DetailsDetail | null>(() => store.getDetail(caseId))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setError(null); setDetail(store.getDetail(caseId))
      void store.loadDetail(caseId).then((r) => { if (active) setDetail(r) }).catch((e) => { if (active) setError(getSologErrorMessageFromUnknown(e)) })
    })
    return () => { active = false }
  }, [caseId, store, store.operational, attempt])
  if (error) return <div role="alert">{error} <button onClick={() => setAttempt((n) => n + 1)}>Reintentar detalle</button></div>
  if (!detail) return <p role="status">Cargando detalle…</p>
  const c = detail.case
  return <div>
    <dl className="cajero-history-list__detail">
      <div><dt>Hora</dt><dd>{time(c.contado_at)}</dd></div>
      <div><dt>Estado</dt><dd>{getSologDifferenceStateLabel(c.estado_diferencia)}</dd></div>
      <div><dt>Stock TumiSoft</dt><dd>{c.stock_teorico}</dd></div>
      <div><dt>Conteo</dt><dd>{c.stock_fisico}</dd></div>
      <div><dt>Stock posterior</dt><dd>{c.stock_posterior ?? '—'}</dd></div>
      <div><dt>Referencia de reconteo</dt><dd>{c.stock_teorico_reconteo ?? '—'}</dd></div>
      <div><dt>Reconteo</dt><dd>{c.stock_reconteo ?? '—'}</dd></div>
      <div><dt>Hora de reconteo</dt><dd>{time(c.recontado_at)}</dd></div>
    </dl>
    <DetailsCaseObservations caseData={c} />
    <details><summary>SKU y contexto</summary>
      <p>Los códigos pertenecen al caso; nombres, marcas y precio_actual del contexto SKU provienen del catálogo actual.</p>
      <ul>{detail.skus.map((sku) => <li key={sku.c_interno}>{sku.c_interno} · {sku.producto ?? '—'} · {sku.marca ?? '—'} · {sku.precio_actual ?? '—'}</li>)}</ul>
      <p>Referencias: {c.snapshot_referencia_id ?? '—'} / posterior {c.snapshot_posterior_id ?? '—'} / reconteo {c.snapshot_reconteo_id ?? '—'}</p>
      <h3>Cronología del grupo</h3>
      <ul>{detail.chronology.map((event) => <li key={event.case_id}>{time(event.contado_at)} · {event.estado_diferencia} · {event.diferencia}</li>)}</ul>
    </details>
  </div>
}
