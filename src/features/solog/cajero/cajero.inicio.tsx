import {
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Database,
  ListChecks,
  Play,
  Send,
} from 'lucide-react'
import { navigateTo } from '../../../lib/router'
import type { SologOperationalBootstrap } from '../types'
import type { CajeroSessionController } from './cajero.session'

const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function CajeroInicio({
  bootstrap,
  session,
}: {
  bootstrap: SologOperationalBootstrap
  session: CajeroSessionController
}) {
  const stockAvailable = bootstrap.stock.disponible
  const canStart =
    stockAvailable &&
    bootstrap.stock.puede_iniciar_conteo &&
    !bootstrap.sesion_activa &&
    session.pendingCount === 0
  const categories = bootstrap.conteo_principal.categorias

  const begin = async () => {
    if (await session.startSession()) navigateTo('/cajero/conteo')
  }

  return (
    <section className="cajero-module" aria-labelledby="cajero-inicio-title">
      <div className="cajero-module__heading">
        <div>
          <p className="cajero-module__eyebrow">Panel Cajero</p>
          <h1 id="cajero-inicio-title">Inicio</h1>
          <p>Tu trabajo operativo en {bootstrap.sede.nombre}.</p>
        </div>
        {bootstrap.sesion_activa ? (
          <span className="cajero-status cajero-status--active">
            <Clock3 aria-hidden="true" size={18} /> Sesión activa
          </span>
        ) : null}
      </div>

      {!stockAvailable ? (
        <div className="cajero-empty-state" role="status">
          <Database aria-hidden="true" size={28} />
          <div>
            <strong>No hay un inventario disponible.</strong>
            <p>Carga un nuevo inventario desde ConeXion para comenzar un conteo.</p>
          </div>
        </div>
      ) : (
        <div className="cajero-session-card">
          <div>
            <span>Actualización de stock</span>
            <strong>{dateTimeFormatter.format(new Date(bootstrap.stock.confirmado_at))}</strong>
            <small>
              {bootstrap.sesion_activa
                ? 'Tu sesión conserva esta referencia TumiSoft.'
                : bootstrap.stock.puede_iniciar_conteo
                  ? 'Disponible para iniciar una sesión.'
                  : 'Disponible solo para consultar; no admite una sesión nueva.'}
            </small>
          </div>
          {bootstrap.sesion_activa ? (
            <button className="button" onClick={() => navigateTo('/cajero/conteo')} type="button">
              <Play aria-hidden="true" size={19} /> Continuar conteo
            </button>
          ) : (
            <button
              className="button"
              disabled={!canStart || session.starting}
              onClick={() => void begin()}
              type="button"
            >
              <Play aria-hidden="true" size={19} />
              {session.starting ? 'Iniciando…' : 'Iniciar conteo'}
            </button>
          )}
        </div>
      )}

      <div className="cajero-kpis" aria-label="Progreso operativo">
        <article className="cajero-kpi">
          <CalendarCheck2 aria-hidden="true" size={21} />
          <span>Verificados hoy</span>
          <strong>
            {bootstrap.cobertura_diaria.grupos_verificados} / {bootstrap.cobertura_diaria.grupos_requeridos}
          </strong>
          <small>{bootstrap.cobertura_diaria.pendientes} pendientes hoy</small>
        </article>
        <article className="cajero-kpi">
          <CheckCircle2 aria-hidden="true" size={21} />
          <span>Cobertura quincenal</span>
          <strong>
            {bootstrap.cobertura_quincenal.grupos_contados} / {bootstrap.cobertura_quincenal.grupos_totales}
          </strong>
          <small>{bootstrap.cobertura_quincenal.porcentaje}% completado</small>
        </article>
        <article className="cajero-kpi">
          <ListChecks aria-hidden="true" size={21} />
          <span>Por verificar</span>
          <strong>{bootstrap.vistas_inteligentes.seguimiento.cantidad}</strong>
          <small>grupos requieren observación</small>
        </article>
        <article className="cajero-kpi">
          <Send aria-hidden="true" size={21} />
          <span>Pendientes de envío</span>
          <strong>{session.pendingCount}</strong>
          <small>guardados en esta pestaña</small>
        </article>
      </div>

      <section className="cajero-progress-panel" aria-labelledby="cajero-category-progress">
        <div className="cajero-section-heading">
          <div>
            <h2 id="cajero-category-progress">Progreso por categoría</h2>
            <p>La cobertura avanza con cada observación base, exista o no diferencia.</p>
          </div>
          <span>{bootstrap.conteo_principal.stock_cero_pendientes} pendientes en Stock 0</span>
        </div>
        {categories.length > 0 ? (
          <div className="cajero-category-progress">
            {categories.map((category) => {
              const completed = Math.max(0, category.grupos_totales - category.grupos_pendientes_quincena)
              const percentage = category.grupos_totales > 0
                ? Math.round((completed / category.grupos_totales) * 100)
                : 100
              return (
                <button
                  className="cajero-category-progress__item"
                  disabled={!bootstrap.sesion_activa || !session.canCapture}
                  key={category.id}
                  onClick={() => navigateTo(`/cajero/conteo?categoria=${encodeURIComponent(category.id)}`)}
                  type="button"
                >
                  <span><strong>{category.nombre}</strong><small>{completed} de {category.grupos_totales}</small></span>
                  <span className="cajero-progress-track" aria-label={`${percentage}% completado`}>
                    <span style={{ width: `${percentage}%` }} />
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="cajero-muted">No hay categorías pendientes para esta quincena.</p>
        )}
      </section>
    </section>
  )
}