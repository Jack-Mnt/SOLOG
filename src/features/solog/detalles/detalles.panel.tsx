import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  History,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  RefreshCw,
  SearchCheck,
  Send,
  ShieldAlert,
  Tablet,
} from 'lucide-react'
import { useState } from 'react'
import type { DetailsExportPeriod } from './detalles.v2'
import { useSologDetailsExport } from './detalles.export.hook'
import { SologDetailsHistoryDialog } from './detalles.historial.dialog'
import { useSologDetailsSummary } from './detalles.hook'

const LIMA_TIME_ZONE = 'America/Lima'

const DEVICE_STATE_LABELS: Record<string, string> = {
  token_requerido: 'Token requerido',
  sin_solicitud: 'Sin solicitud',
  pendiente: 'Solicitud pendiente',
  autorizado: 'Autorizado',
  revocado: 'Revocado',
}

const shortDateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  timeZone: LIMA_TIME_ZONE,
})

const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: LIMA_TIME_ZONE,
})

function formatDeviceState(state: string) {
  return DEVICE_STATE_LABELS[state] ?? state.replaceAll('_', ' ')
}

function formatPeriodRange(from: string, to: string) {
  const fromDate = new Date(`${from}T12:00:00Z`)
  const toDate = new Date(`${to}T12:00:00Z`)
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) {
    return 'Período vigente'
  }

  return `${shortDateFormatter.format(fromDate)} – ${shortDateFormatter.format(toDate)}`
}

function formatStockUpdate(confirmedAt: string | null, serverNow: string) {
  if (!confirmedAt) return 'Sin actualización confirmada'

  const confirmedAtMs = Date.parse(confirmedAt)
  const serverNowMs = Date.parse(serverNow)
  if (!Number.isFinite(confirmedAtMs) || !Number.isFinite(serverNowMs)) {
    return dateTimeFormatter.format(new Date(confirmedAt))
  }

  const elapsedMinutes = Math.floor(Math.max(0, serverNowMs - confirmedAtMs) / 60_000)
  const relative = elapsedMinutes < 60
    ? `hace ${elapsedMinutes} min`
    : `hace ${Math.floor(elapsedMinutes / 60)} h ${elapsedMinutes % 60} min`

  return `${dateTimeFormatter.format(new Date(confirmedAt))} · ${relative}`
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural
}

export function SologDetailsPanel({
  userId,
  onLogout,
}: {
  userId: string
  onLogout: () => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exportPeriod, setExportPeriod] = useState<DetailsExportPeriod>('current_biweekly')
  const {
    store,
    error,
    loadSummary,
    notice,
    requestAccess,
    requesting,
    status,
    summary,
  } = useSologDetailsSummary(userId)
  const detailsExport = useSologDetailsExport(store)
  const siteName = summary?.site.nombre ?? '—'
  const coverage = summary?.summary.periodo
  const coveragePercentage = coverage
    ? Math.max(0, Math.min(100, coverage.porcentaje))
    : 0
  const device = summary?.access

  const authorizationMessage = device?.current_device_state === 'autorizado' && device.current_device_matches_site
    ? 'Este dispositivo ya está autorizado.'
    : device?.authorized_device_id
      ? 'La sede ya cuenta con otro dispositivo autorizado.'
      : device?.current_device_state === 'pendiente'
        ? 'La solicitud está pendiente de revisión.'
        : 'Este dispositivo todavía no está autorizado.'

  return (
    <div className="cajero-shell details-shell">
      <header className="cajero-header">
        <div className="cajero-header__topline">
          <span className="cajero-header__brand details-header__brand">
            <img alt="SOLOG" src="/Logo_SOLOG.png" />
          </span>
          <strong className="cajero-header__site">PR {siteName}</strong>
          <button
            aria-label="Cerrar sesión"
            className="cajero-header__logout"
            onClick={onLogout}
            title="Cerrar sesión"
            type="button"
          >
            <LogOut aria-hidden="true" size={21} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      <main className="cajero-main">
        <section className="cajero-module cajero-home details-panel" aria-labelledby="details-title">
          <div className="details-panel__heading">
            <div>
              <span className="cajero-module__eyebrow">PANEL INFORMATIVO</span>
              <h1 id="details-title">Detalles de la sede</h1>
              <p>Consulta el estado operativo sin iniciar sesiones ni registrar conteos.</p>
            </div>
            <span className="details-readonly-badge">
              <LockKeyhole aria-hidden="true" size={17} /> Solo lectura
            </span>
          </div>

          {status === 'loading' && !summary ? (
            <div className="cajero-empty-state details-loading" role="status">
              <LoaderCircle aria-hidden="true" className="spin" size={28} />
              <div>
                <strong>Consultando detalles de la sede…</strong>
                <p>La vista permanecerá en modo de solo lectura.</p>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="cajero-alert cajero-alert--error" role="alert">
              <AlertTriangle aria-hidden="true" size={22} />
              <p>{error}</p>
              {summary ? null : (
                <button className="button button--secondary" onClick={() => void loadSummary()} type="button">
                  <RefreshCw aria-hidden="true" size={18} /> Reintentar
                </button>
              )}
            </div>
          ) : null}

          {notice ? (
            <div className="cajero-alert details-notice" role="status">
              <CheckCircle2 aria-hidden="true" size={22} />
              <p>{notice}</p>
            </div>
          ) : null}

          {summary ? (
            <>
              <section className="details-device-card" aria-labelledby="details-device-title">
                <span className="details-device-card__icon" aria-hidden="true">
                  {device?.current_device_state === 'autorizado' && device.current_device_matches_site ? <Tablet size={30} /> : <ShieldAlert size={30} />}
                </span>
                <div className="details-device-card__copy">
                  <span className="details-device-card__site">PR {summary.site.nombre}</span>
                  <h2 id="details-device-title">{formatDeviceState(summary.access.current_device_state)}</h2>
                  <p>{authorizationMessage} El acceso disponible en esta pantalla es únicamente informativo.</p>
                  {!summary.access.current_device_matches_site ? (
                    <strong className="details-device-card__warning">El dispositivo no corresponde a la sede asignada.</strong>
                  ) : null}
                </div>
                <div className="details-device-card__actions">
                  {summary.access.can_request && summary.access.current_device_state !== 'pendiente' ? (
                    <button
                      className="button"
                      disabled={requesting}
                      onClick={() => void requestAccess()}
                      type="button"
                    >
                      {requesting ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <Send aria-hidden="true" size={18} />}
                      {requesting ? 'Solicitando…' : 'Solicitar acceso'}
                    </button>
                  ) : null}
                  {summary.access.current_device_state === 'pendiente' ? (
                    <span className="details-request-status">Solicitud registrada</span>
                  ) : null}
                </div>
              </section>

              <section className="cajero-coverage-card" aria-labelledby="details-coverage-title">
                <div className="cajero-coverage-card__copy">
                  <span>Cobertura del período</span>
                  <h2 id="details-coverage-title">{coverage?.grupos_contados} / {coverage?.grupos_totales}</h2>
                  <p>
                    Período: {coverage ? formatPeriodRange(coverage.desde, coverage.hasta) : '—'} ·{' '}
                    {coverage?.pendientes ?? 0} {pluralize(coverage?.pendientes ?? 0, 'grupo pendiente', 'grupos pendientes')}
                  </p>
                </div>
                <div className="cajero-progress-ring" role="img" aria-label={`${coveragePercentage}% completado`}>
                  <svg aria-hidden="true" viewBox="0 0 120 120">
                    <circle className="cajero-progress-ring__track" cx="60" cy="60" r="52" pathLength="100" />
                    <circle className="cajero-progress-ring__value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - coveragePercentage} />
                  </svg>
                  <strong>{coveragePercentage}%</strong>
                </div>
              </section>

              <div className="details-metrics" aria-label="Resumen operativo de la sede">
                <article className="cajero-home-metric">
                  <CalendarCheck2 aria-hidden="true" size={23} />
                  <span>Pendientes del período</span>
                  <div className="cajero-home-metric__value">
                    <strong>{coverage?.pendientes ?? 0}</strong>
                    <small>{pluralize(coverage?.pendientes ?? 0, 'grupo', 'grupos')}</small>
                  </div>
                </article>
                <article className="cajero-home-metric">
                  <Clock3 aria-hidden="true" size={23} />
                  <span>Conteo diario pendiente</span>
                  <div className="cajero-home-metric__value">
                    <strong>{summary.summary.conteo_diario_pendientes}</strong>
                    <small>{pluralize(summary.summary.conteo_diario_pendientes, 'grupo', 'grupos')}</small>
                  </div>
                </article>
                <article className="cajero-home-metric">
                  <SearchCheck aria-hidden="true" size={23} />
                  <span>Casos por revisar</span>
                  <div className="cajero-home-metric__value">
                    <strong>{summary.summary.revisar_pendientes}</strong>
                    <small>{pluralize(summary.summary.revisar_pendientes, 'caso', 'casos')}</small>
                  </div>
                </article>
              </div>

              <section className={`cajero-stock-card${summary.summary.ultimo_snapshot ? '' : ' cajero-stock-card--stale'}`} aria-labelledby="details-stock-title">
                <div className="cajero-stock-card__status">
                  <span className="cajero-stock-card__icon" aria-hidden="true">
                    {summary.summary.ultimo_snapshot ? <Database size={23} /> : <AlertTriangle size={23} />}
                  </span>
                  <div>
                    <h2 id="details-stock-title">{summary.summary.ultimo_snapshot ? 'Última actualización de stock' : 'Stock no disponible'}</h2>
                    <p>{formatStockUpdate(summary.summary.ultimo_snapshot?.confirmado_at ?? null, summary.generated_at)}</p>
                  </div>
                </div>
              </section>

              <section className="details-actions" aria-label="Consultas disponibles">
                <div>
                  <FileSpreadsheet aria-hidden="true" size={22} />
                  <div>
                    <h2>Información de la sede</h2>
                    <p>Consulta el historial o descarga las diferencias finales del período.</p>
                  </div>
                </div>
                <div className="details-actions__buttons">
                  <label>Período de exportación
                    <select aria-label="Período de exportación" disabled={detailsExport.exporting} value={exportPeriod} onChange={(event) => setExportPeriod(event.target.value as DetailsExportPeriod)}>
                      <option value="current_biweekly">Quincena actual</option>
                      <option value="previous_biweekly">Quincena anterior</option>
                    </select>
                  </label>
                  <button
                    className="button button--secondary"
                    onClick={() => setHistoryOpen(true)}
                    type="button"
                  >
                    <History aria-hidden="true" size={18} /> Ver historial
                  </button>
                  <button
                    className="button"
                    disabled={detailsExport.exporting}
                    onClick={() => void detailsExport.exportExcel(exportPeriod)}
                    type="button"
                  >
                    {detailsExport.exporting ? (
                      <LoaderCircle aria-hidden="true" className="spin" size={18} />
                    ) : (
                      <FileSpreadsheet aria-hidden="true" size={18} />
                    )}
                    {detailsExport.exporting ? 'Generando Excel…' : 'Descargar Excel'}
                  </button>
                </div>
              </section>
              {detailsExport.error ? (
                <div className="cajero-alert cajero-alert--error" role="alert">
                  <AlertTriangle aria-hidden="true" size={22} />
                  <p>{detailsExport.error}</p>
                </div>
              ) : null}
              {detailsExport.notice ? (
                <div className="cajero-alert details-notice" role="status">
                  <CheckCircle2 aria-hidden="true" size={22} />
                  <p>{detailsExport.notice}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </main>
      {historyOpen && summary ? (
        <SologDetailsHistoryDialog store={store} onClose={() => setHistoryOpen(false)} />
      ) : null}
    </div>
  )
}
