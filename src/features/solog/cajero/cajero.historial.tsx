import { AlertCircle, History, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getOrCreateDeviceToken } from '../device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../errors'
import { useSolog } from '../SologContext'
import { getCajeroHistory } from './cajero.api'
import type {
  CajeroHistoryPeriod,
  CajeroHistoryResponse,
} from './cajero.types'
import {
  formatCajeroCurrency,
  getObservationTypeLabel,
  sortHistoryNewestFirst,
} from './cajero.utils'

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
})

function formatHistoryTime(value: string): string {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? '—' : timeFormatter.format(parsed)
}

export function CajeroHistorial() {
  const { refresh, updateServerNow } = useSolog()
  const [period, setPeriod] = useState<CajeroHistoryPeriod>('hoy')
  const [history, setHistory] = useState<CajeroHistoryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const items = useMemo(
    () => sortHistoryNewestFirst(history?.items ?? []),
    [history?.items],
  )

  const loadHistory = useCallback(async () => {
    const currentRequest = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const response = await getCajeroHistory({
        device_token: getOrCreateDeviceToken(),
        periodo: period,
      })
      if (currentRequest !== requestVersion.current) return
      setHistory(response)
      updateServerNow(response.server_now)
    } catch (loadError) {
      if (currentRequest !== requestVersion.current) return
      setHistory(null)
      setError(getSologErrorMessageFromUnknown(loadError))
      if (isSologApiErrorCode(loadError, 'SOLOG_DEVICE_NOT_AUTHORIZED')) {
        await refresh(true)
      }
    } finally {
      if (currentRequest === requestVersion.current) setLoading(false)
    }
  }, [period, refresh, updateServerNow])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadHistory()
    })
    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [loadHistory])

  return (
    <section className="cajero-module" aria-labelledby="cajero-historial-title">
      <div className="cajero-module__heading">
        <div>
          <p className="cajero-module__eyebrow">Consulta</p>
          <h1 id="cajero-historial-title">Historial</h1>
          <p>Cada fila es una observación independiente; las diferencias no se acumulan.</p>
        </div>
      </div>

      <div className="cajero-history-tabs" aria-label="Período del historial">
        {(['hoy', 'ayer'] as const).map((option) => (
          <button
            aria-pressed={period === option}
            className={period === option ? 'is-active' : undefined}
            key={option}
            onClick={() => setPeriod(option)}
            type="button"
          >
            {option === 'hoy' ? 'Hoy' : 'Ayer'}
          </button>
        ))}
      </div>

      {error ? (
        <div className="cajero-alert cajero-alert--error" role="alert">
          <AlertCircle aria-hidden="true" size={21} /><p>{error}</p>
          <button className="button button--secondary" onClick={() => void loadHistory()} type="button">Reintentar</button>
        </div>
      ) : null}

      {loading ? (
        <div className="cajero-loading" role="status"><LoaderCircle aria-hidden="true" className="spin" size={24} /> Cargando historial…</div>
      ) : history && items.length > 0 ? (
        <div className="cajero-count-table-wrap cajero-history-table-wrap">
          <table className="cajero-count-table cajero-history-table">
            <thead><tr><th>Hora</th><th>Grupo</th><th>Tipo</th><th>TumiSoft</th><th>Conteo</th><th>Diferencia</th><th>Valorizado</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.detalle_id}>
                  <td data-label="Hora">{formatHistoryTime(item.contado_at)}</td>
                  <td data-label="Grupo"><strong>{item.grupo}</strong></td>
                  <td data-label="Tipo"><span className="cajero-observation-type">{getObservationTypeLabel(item.tipo_observacion)}</span></td>
                  <td data-label="TumiSoft">{item.stock_teorico}</td>
                  <td data-label="Conteo">{item.stock_fisico}</td>
                  <td data-label="Diferencia" className={item.diferencia === 0 ? 'is-zero' : item.diferencia < 0 ? 'is-negative' : 'is-positive'}>{item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}</td>
                  <td data-label="Valorizado">{formatCajeroCurrency(item.valor_diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <div className="cajero-empty-state" role="status">
          <History aria-hidden="true" size={28} />
          <div><strong>No hay observaciones para {period === 'hoy' ? 'hoy' : 'ayer'}.</strong><p>El historial muestra únicamente capturas confirmadas por SOLOG.</p></div>
        </div>
      ) : null}
    </section>
  )
}