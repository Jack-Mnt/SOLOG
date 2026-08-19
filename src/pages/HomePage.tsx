import { useRef, useState } from 'react'
import { PageShell } from '../components/PageShell'
import { useSolog } from '../features/solog/SologContext'
import { startCount } from '../features/solog/api'
import { SOLOG_ACTIVE_COUNT_DEFINITIONS } from '../features/solog/count/config'
import { getOrCreateDeviceToken } from '../features/solog/device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../features/solog/errors'
import type {
  SologCountStartPayload,
  SologOperationalBootstrap,
  SologRegularCountType,
} from '../features/solog/types'

type SologSpecialCountType = Exclude<
  SologRegularCountType,
  'categoria'
>

const SPECIAL_COUNT_TYPES: SologSpecialCountType[] = [
  'cambios_recientes',
  'stock_cero',
  'stock_negativo',
]

export function HomePage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  const solog = useSolog()
  const [startingKey, setStartingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const startInFlight = useRef(false)

  const handleStart = async (
    startKey: string,
    payload: SologCountStartPayload,
  ) => {
    if (startInFlight.current) return

    startInFlight.current = true
    setStartingKey(startKey)
    setError(null)
    solog.setNotice(null)

    try {
      await startCount(payload)
      await solog.refresh()
    } catch (startError) {
      setError(getSologErrorMessageFromUnknown(startError))

      if (
        isSologApiErrorCode(
          startError,
          'SOLOG_DEVICE_NOT_AUTHORIZED',
          'SOLOG_ACTIVE_COUNT_EXISTS',
          'SOLOG_COUNT_EXPIRED',
        )
      ) {
        await solog.refresh()
      }
    } finally {
      startInFlight.current = false
      setStartingKey(null)
    }
  }

  const coverage = bootstrap.cobertura_hoy

  return (
    <PageShell
      description="Selecciona una modalidad para iniciar un conteo físico."
      eyebrow={bootstrap.sede.nombre}
      onLogout={onLogout}
      title="Inventario de hoy"
      wide
    >
      {solog.notice ? (
        <div className="notice notice--success" role="status">
          <strong>{solog.notice}</strong>
          <button
            className="text-button"
            onClick={() => solog.setNotice(null)}
            type="button"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {!bootstrap.stock.disponible ? (
        <div className="notice notice--warning" role="alert">
          <strong>Stock no disponible</strong>
          <p>
            No puedes iniciar un conteo hasta que exista un snapshot confirmado.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="coverage-title" className="content-section">
        <h2 id="coverage-title">Cobertura de hoy</h2>
        <div className="status-grid status-grid--four">
          <div className="status-item">
            <span>Grupos contados</span>
            <strong>{coverage.grupos_contados}</strong>
          </div>
          <div className="status-item">
            <span>Grupos totales</span>
            <strong>{coverage.grupos_totales}</strong>
          </div>
          <div className="status-item">
            <span>Pendientes</span>
            <strong>{coverage.pendientes}</strong>
          </div>
          <div className="status-item">
            <span>Avance</span>
            <strong>{coverage.porcentaje}%</strong>
          </div>
        </div>
      </section>

      <section aria-labelledby="categories-title" className="content-section">
        <div className="section-heading">
          <div>
            <h2 id="categories-title">Por categoría</h2>
            <p>El conteo se realiza por grupo, no por producto individual.</p>
          </div>
        </div>

        <div className="category-list">
          {bootstrap.categorias.map((category) => {
            const categoryStartKey = `categoria:${category.id}`
            const isStarting = startingKey === categoryStartKey

            return (
              <button
                className="category-card"
                disabled={
                  !bootstrap.stock.disponible || Boolean(startingKey)
                }
                key={category.id}
                onClick={() =>
                  void handleStart(categoryStartKey, {
                    device_token: getOrCreateDeviceToken(),
                    tipo: 'categoria',
                    categoria_id: category.id,
                  })
                }
                type="button"
              >
                <span>
                  <strong>{category.nombre}</strong>
                  <small>
                    {category.grupos_inventariables}{' '}
                    {category.grupos_inventariables === 1 ? 'grupo' : 'grupos'}
                  </small>
                </span>
                <span aria-hidden="true">
                  {isStarting ? 'Iniciando…' : 'Iniciar →'}
                </span>
              </button>
            )
          })}
        </div>

        {bootstrap.categorias.length === 0 ? (
          <p className="empty-state">No hay categorías disponibles.</p>
        ) : null}
      </section>

      <section aria-labelledby="quick-reviews-title" className="content-section">
        <div className="section-heading">
          <div>
            <h2 id="quick-reviews-title">Revisiones rápidas</h2>
            <p>El backend determina qué grupos pertenecen a cada vista.</p>
          </div>
        </div>

        <div className="category-list">
          {SPECIAL_COUNT_TYPES.map((type) => {
            const definition = SOLOG_ACTIVE_COUNT_DEFINITIONS[type]
            const groupCount = bootstrap.vistas[type]
            const isEmpty = groupCount === 0
            const isStarting = startingKey === type

            return (
              <button
                className="category-card"
                disabled={
                  !bootstrap.stock.disponible || isEmpty || Boolean(startingKey)
                }
                key={type}
                onClick={() =>
                  void handleStart(type, {
                    device_token: getOrCreateDeviceToken(),
                    tipo: type,
                  })
                }
                type="button"
              >
                <span>
                  <strong>{definition.title}</strong>
                  <small>
                    {isEmpty
                      ? 'Sin grupos por contar'
                      : `${groupCount} ${groupCount === 1 ? 'grupo' : 'grupos'}`}
                  </small>
                </span>
                <span aria-hidden="true">
                  {isEmpty
                    ? 'No disponible'
                    : isStarting
                      ? 'Iniciando…'
                      : 'Iniciar →'}
                </span>
              </button>
            )
          })}

          <button
            className="category-card"
            disabled={
              !bootstrap.stock.disponible ||
              bootstrap.vistas.contar_detalladamente === 0 ||
              Boolean(startingKey)
            }
            onClick={() =>
              void handleStart('reconteo', {
                device_token: getOrCreateDeviceToken(),
                tipo: 'reconteo',
              })
            }
            type="button"
          >
            <span>
              <strong>Contar detalladamente</strong>
              <small>
                {bootstrap.vistas.contar_detalladamente === 0
                  ? 'Sin grupos por recontar'
                  : `${bootstrap.vistas.contar_detalladamente} ${
                      bootstrap.vistas.contar_detalladamente === 1
                        ? 'grupo'
                        : 'grupos'
                    }`}
              </small>
            </span>
            <span aria-hidden="true">
              {bootstrap.vistas.contar_detalladamente === 0
                ? 'No disponible'
                : startingKey === 'reconteo'
                  ? 'Iniciando…'
                  : 'Iniciar →'}
            </span>
          </button>
        </div>
      </section>
    </PageShell>
  )
}
