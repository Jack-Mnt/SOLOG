import { useEffect, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import { getSologDifferenceStateLabel } from '../labels'
import type { DetailsStore } from './detalles.store'
import type { DetailsDetail } from './detalles.v2'
const time = (value: string | null) => value === null ? '—' : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
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
    <details><summary>SKU y contexto</summary>
      <p>Los códigos pertenecen al caso; nombres, marcas y precio_actual del contexto SKU provienen del catálogo actual.</p>
      <ul>{detail.skus.map((sku) => <li key={sku.c_interno}>{sku.c_interno} · {sku.producto ?? '—'} · {sku.marca ?? '—'} · {sku.precio_actual ?? '—'}</li>)}</ul>
      <p>Referencias: {c.snapshot_referencia_id ?? '—'} / posterior {c.snapshot_posterior_id ?? '—'} / reconteo {c.snapshot_reconteo_id ?? '—'}</p>
      <h3>Cronología del grupo</h3>
      <ul>{detail.chronology.map((event) => <li key={event.case_id}>{time(event.contado_at)} · {event.estado_diferencia} · {event.diferencia}</li>)}</ul>
    </details>
  </div>
}
