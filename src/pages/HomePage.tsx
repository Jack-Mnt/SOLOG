import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { PageShell } from '../components/PageShell'
import { finishCount, startCount } from '../features/solog/api'
import { useInventoryExpiry, formatRemainingTime } from '../features/solog/count/expiry'
import {
  clearPendingQueue,
  flushPendingQueue,
  useCountQueue,
} from '../features/solog/count/queue'
import { createCountRoute } from '../features/solog/count/views'
import { getOrCreateDeviceToken } from '../features/solog/device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../features/solog/errors'
import { useSolog } from '../features/solog/SologContext'
import type { SologOperationalBootstrap } from '../features/solog/types'
import { navigateTo } from '../lib/router'

const peruDateTime = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Lima',
})

function CoverageCard({
  title,
  counted,
  total,
  pending,
  percentage,
  primary = false,
  icon: Icon,
}: {
  title: string
  counted: number
  total: number
  pending: number
  percentage: number
  primary?: boolean
  icon: LucideIcon
}) {
  return (
    <section className={`content-section${primary ? ' coverage-primary' : ''}`}>
      <div className="section-title-row">
        <span className="section-icon"><Icon aria-hidden="true" size={20} /></span>
        <h2>{title}</h2>
      </div>
      <div className="status-grid status-grid--four">
        <div className="status-item"><span>Contados</span><strong>{counted}</strong></div>
        <div className="status-item"><span>Aplicables</span><strong>{total}</strong></div>
        <div className="status-item"><span>Pendientes</span><strong>{pending}</strong></div>
        <div className="status-item"><span>Avance</span><strong>{percentage}%</strong></div>
      </div>
      <div className="coverage-track" aria-hidden="true">
        <span style={{ '--coverage-value': `${Math.min(100, Math.max(0, percentage))}%` } as CSSProperties} />
      </div>
    </section>
  )
}

export function HomePage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  const solog = useSolog()
  const queue = useCountQueue()
  const [busy, setBusy] = useState<'start' | 'sync' | 'finish' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestInFlight = useRef(false)
  const expiryFlushAttempted = useRef(false)
  const session = bootstrap.sesion_activa
  const stock = bootstrap.stock
  const mainCount = bootstrap.conteo_principal
  const staleQueue = Boolean(queue && (!session || queue.conteo_id !== session.id))
  const pendingCount = queue && session && queue.conteo_id === session.id ? queue.items.length : 0
  const expiry = useInventoryExpiry(
    stock.disponible
      ? { available: true, snapshotId: stock.snapshot_id, expiraAt: stock.expira_at }
      : { available: false },
    solog.serverOffsetMs,
  )

  const runExclusive = useCallback(async (
    action: 'start' | 'sync' | 'finish',
    operation: () => Promise<void>,
  ) => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setBusy(action)
    setError(null)
    try {
      await operation()
    } catch (operationError) {
      setError(getSologErrorMessageFromUnknown(operationError))
      if (
        isSologApiErrorCode(
          operationError,
          'SOLOG_DEVICE_NOT_AUTHORIZED',
          'SOLOG_ACTIVE_COUNT_EXISTS',
          'SOLOG_COUNT_EXPIRED',
          'SOLOG_SNAPSHOT_EXPIRED',
        )
      ) {
        await solog.refresh(true)
      }
    } finally {
      requestInFlight.current = false
      setBusy(null)
    }
  }, [solog])

  const handleStart = () =>
    runExclusive('start', async () => {
      const result = await startCount({ device_token: getOrCreateDeviceToken() })
      if (result.server_now) solog.updateServerNow(result.server_now)
      await solog.refresh(true)
      solog.setNotice('Sesión general iniciada. Ya puedes elegir una vista de conteo.')
    })

  const handleSync = useCallback(
    () => runExclusive('sync', async () => {
      if (!session) return
      const results = await flushPendingQueue(session.id, solog.updateServerNow)
      await solog.refresh(true)
      solog.setNotice(
        results.length > 0 ? `${results.length} capturas enviadas.` : 'No hay capturas pendientes.',
      )
    }),
    [runExclusive, session, solog],
  )

  const handleFinish = () =>
    runExclusive('finish', async () => {
      if (!session || staleQueue) return
      await flushPendingQueue(session.id, solog.updateServerNow)
      const result = await finishCount({
        device_token: getOrCreateDeviceToken(),
        conteo_id: session.id,
      })
      if (result.server_now) solog.updateServerNow(result.server_now)
      solog.setNotice('Sesión finalizada. El avance quincenal se conserva.')
      await solog.refresh()
    })

  useEffect(() => {
    if (
      !expiry.expired ||
      expiryFlushAttempted.current ||
      !session ||
      pendingCount === 0
    ) {
      return
    }
    expiryFlushAttempted.current = true
    const finalTransmission = window.setTimeout(() => {
      void handleSync()
    }, 0)
    return () => window.clearTimeout(finalTransmission)
  }, [expiry.expired, handleSync, pendingCount, session])

  const canNavigate = Boolean(session) && expiry.available && !expiry.expired && !staleQueue
  const smartUnlocked = bootstrap.cobertura_quincenal.completa
  const periodLabel =
    bootstrap.cobertura_quincenal.periodo === 'primera'
      ? 'Primera quincena'
      : 'Segunda quincena'

  return (
    <PageShell
      description="Una sesión general permite recorrer categorías y vistas sin reiniciar el conteo."
      eyebrow={bootstrap.sede.nombre}
      onLogout={onLogout}
      title="SOLOG"
      wide
    >
      {solog.notice ? (
        <div className="notice notice--success" role="status">
          <strong>{solog.notice}</strong>
          <button className="text-button" onClick={() => solog.setNotice(null)}>Cerrar</button>
        </div>
      ) : null}
      {expiry.warning ? <div className="notice notice--warning" role="alert"><strong>{expiry.warning}</strong></div> : null}
      {error ? <div className="notice notice--error" role="alert"><strong>No se pudo completar la operación</strong><p>{error}</p></div> : null}
      {staleQueue ? (
        <div className="notice notice--warning" role="alert">
          <strong>Hay capturas locales de una sesión anterior</strong>
          <p>No se mezclarán con la sesión actual. Límpialas solo si confirmas que ya no son recuperables.</p>
          <button className="button button--secondary" onClick={clearPendingQueue}><Trash2 size={18} /> Limpiar datos obsoletos</button>
        </div>
      ) : null}

      <section className="content-section" aria-labelledby="inventory-title">
        <div className="section-heading">
          <div>
            <div className="section-title-row"><span className="section-icon"><FileSpreadsheet size={20} /></span><h2 id="inventory-title">Estado del inventario</h2></div>
            <p>{stock.disponible ? 'La vigencia corresponde al último Excel confirmado.' : 'No existe un snapshot operativo confirmado.'}</p>
          </div>
          {stock.disponible && expiry.remainingSeconds !== null ? (
            <strong className="time-pill"><Clock3 size={18} /> {formatRemainingTime(expiry.remainingSeconds)}</strong>
          ) : null}
        </div>
        {stock.disponible ? (
          <div className="status-grid status-grid--four">
            <div className="status-item"><span>Último Excel</span><strong>{peruDateTime.format(new Date(stock.confirmado_at))}</strong></div>
            <div className="status-item"><span>Válido hasta</span><strong>{peruDateTime.format(new Date(stock.expira_at))}</strong></div>
            <div className="status-item"><span>Estado</span><strong>{expiry.expired ? 'Vencido' : 'Vigente'}</strong></div>
            <div className="status-item"><span>Sesión</span><strong>{session ? 'Activa' : 'Sin sesión'}</strong></div>
          </div>
        ) : (
          <div className="notice" role="status">
            <strong>No hay un inventario disponible.</strong>
            <p>Carga un nuevo inventario desde ConeXion para comenzar un conteo.</p>
          </div>
        )}
        {!session ? (
          <button
            className="button"
            disabled={!stock.disponible || !stock.puede_iniciar_conteo || expiry.expired || Boolean(busy) || staleQueue}
            onClick={() => void handleStart()}
          >
            <Play aria-hidden="true" size={20} />
            {busy === 'start' ? 'Iniciando…' : 'Empezar conteo'}
          </button>
        ) : (
          <div className="admin-report-filter-actions">
            <button className="button button--secondary" disabled={Boolean(busy) || staleQueue} onClick={() => void handleSync()}>
              <CloudUpload aria-hidden="true" size={19} /> {busy === 'sync' ? 'Enviando…' : `Enviar pendientes (${pendingCount})`}
            </button>
            <button className="button button--danger" disabled={Boolean(busy) || staleQueue} onClick={() => void handleFinish()}>
              <Square aria-hidden="true" size={18} /> {busy === 'finish' ? 'Finalizando…' : 'Finalizar sesión'}
            </button>
          </div>
        )}
        {stock.disponible && !stock.puede_iniciar_conteo && !session && !expiry.expired ? (
          <p className="form-hint">El inventario está en sus últimos 5 minutos y ya no permite iniciar una sesión.</p>
        ) : null}
      </section>

      <section className="content-section" aria-label="Contexto operativo">
        <div className="status-grid status-grid--four">
          <div className="status-item"><span>Usuario</span><strong>{bootstrap.usuario.nombre}</strong></div>
          <div className="status-item"><span>Sede</span><strong>{bootstrap.sede.nombre}</strong></div>
          <div className="status-item"><span>Dispositivo</span><strong>{bootstrap.dispositivo.estado}</strong></div>
          <div className="status-item"><span>Autorización</span><strong>{bootstrap.dispositivo.autorizado ? 'Autorizado' : 'Pendiente'}</strong></div>
        </div>
      </section>

      <CoverageCard
        title={`Cobertura de la quincena · ${periodLabel}`}
        counted={bootstrap.cobertura_quincenal.grupos_contados}
        total={bootstrap.cobertura_quincenal.grupos_totales}
        pending={bootstrap.cobertura_quincenal.pendientes}
        percentage={bootstrap.cobertura_quincenal.porcentaje}
        primary
        icon={CalendarRange}
      />
      {stock.disponible && !smartUnlocked ? <div className="notice"><strong>Completa el conteo total de la {periodLabel.toLowerCase()}.</strong><p>Las vistas inteligentes se habilitarán al llegar al 100 %.</p></div> : null}
      <CoverageCard
        title="Cobertura de hoy"
        counted={bootstrap.cobertura_diaria.grupos_contados}
        total={bootstrap.cobertura_diaria.grupos_totales}
        pending={bootstrap.cobertura_diaria.pendientes}
        percentage={bootstrap.cobertura_diaria.porcentaje}
        icon={CalendarDays}
      />

      {stock.disponible ? <section className="content-section" aria-labelledby="main-count-title">
        <div className="section-heading"><div><div className="section-title-row"><span className="section-icon"><Boxes size={20} /></span><h2 id="main-count-title">Conteo principal</h2></div><p>El backend ya excluye los grupos cubiertos en la quincena.</p></div></div>
        <div className="category-list">
          {mainCount.categorias.map((category) => (
            <button
              className="category-card"
              disabled={!canNavigate || category.pendientes === 0 || Boolean(busy)}
              key={category.id}
              onClick={() => navigateTo(createCountRoute({ vista: 'categoria', categoriaId: category.id, title: category.nombre }))}
            >
              <span className="category-card__icon"><Boxes aria-hidden="true" size={24} /></span>
              <span className="category-card__content"><strong>{category.nombre}</strong><small>{category.pendientes} pendientes</small></span>
              <span className="category-card__action">{category.pendientes === 0 ? <><CheckCircle2 size={18} /> Cubierta</> : <>Abrir <ArrowRight size={19} /></>}</span>
            </button>
          ))}
          <button
            className="category-card"
            disabled={!canNavigate || mainCount.stock_cero_pendientes === 0 || Boolean(busy)}
            onClick={() => navigateTo(createCountRoute({ vista: 'stock_cero', title: 'Stock 0' }))}
          >
            <span className="category-card__icon"><PackageX aria-hidden="true" size={24} /></span>
            <span className="category-card__content"><strong>Stock 0</strong><small>{mainCount.stock_cero_pendientes} pendientes</small></span><span className="category-card__action">Abrir <ArrowRight size={19} /></span>
          </button>
        </div>
      </section> : null}

      {stock.disponible ? <section className="content-section" aria-labelledby="smart-title">
        <div className="section-heading"><div><div className="section-title-row"><span className="section-icon"><Activity size={20} /></span><h2 id="smart-title">Vistas inteligentes</h2></div><p>Disponibles después de completar la cobertura quincenal.</p></div></div>
        <div className="category-list">
          {([
            ['cambios_recientes', 'Cambios recientes', History],
            ['stock_negativo', 'Stock negativo', TrendingDown],
            ['contar_detalladamente', 'Contar detalladamente', ScanSearch],
          ] as const).map(([vista, title, ViewIcon]) => {
            const pending = bootstrap.vistas?.[vista]
            return (
              <button
                className="category-card"
                disabled={!canNavigate || !smartUnlocked || pending === undefined || pending === 0 || Boolean(busy)}
                key={vista}
                onClick={() => navigateTo(createCountRoute({ vista, title }))}
              >
                <span className="category-card__icon"><ViewIcon aria-hidden="true" size={24} /></span>
                <span className="category-card__content"><strong>{title}</strong><small>{smartUnlocked ? pending === undefined ? 'No disponible' : `${pending} pendientes` : 'Completa primero la cobertura quincenal'}</small></span>
                <span className="category-card__action">{smartUnlocked && pending !== undefined ? <>Abrir <ArrowRight size={19} /></> : <><LockKeyhole size={17} /> Bloqueada</>}</span>
              </button>
            )
          })}
        </div>
      </section> : null}
    </PageShell>
  )
}
import {
  Activity,
  ArrowRight,
  Boxes,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock3,
  CloudUpload,
  FileSpreadsheet,
  History,
  LockKeyhole,
  PackageX,
  Play,
  ScanSearch,
  Square,
  Trash2,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react'
