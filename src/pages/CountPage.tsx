import { PageShell } from '../components/PageShell'
import { useSolog } from '../features/solog/SologContext'
import { CountGroupCard } from '../features/solog/count/CountGroupCard'
import { RecountGroupCard } from '../features/solog/count/RecountGroupCard'
import {
  getActiveCountDefinition,
  type SologActiveCountDefinition,
} from '../features/solog/count/config'
import { useActiveCount } from '../features/solog/count/useActiveCount'
import type {
  SologActiveSession,
  SologOperationalBootstrap,
} from '../features/solog/types'
import { isSologRecountGroup } from '../features/solog/types'

function formatRemainingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':')
}

function UnsupportedCount({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  return (
    <PageShell
      description="Esta sesión todavía no tiene una pantalla operativa habilitada."
      eyebrow={bootstrap.sede.nombre}
      onLogout={onLogout}
      title="Sesión no disponible en esta versión"
    />
  )
}

function ActiveCount({
  bootstrap,
  session,
  definition,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  session: SologActiveSession
  definition: SologActiveCountDefinition
  onLogout: () => void
}) {
  const solog = useSolog()
  const count = useActiveCount({
    session,
    view: definition.view,
    mutation: definition.mutation,
    refreshBootstrap: solog.refresh,
    setNotice: solog.setNotice,
  })
  const category = bootstrap.categorias.find(
    (item) => item.id === session.categoria_id,
  )
  const categoryName =
    count.response?.grupos[0]?.categoria ?? category?.nombre ?? 'Categoría'
  const isCategoryCount = session.tipo === 'categoria'
  const isRecount = session.tipo === 'reconteo'
  const pageTitle = isCategoryCount ? categoryName : definition.title
  const summaryLabel = isCategoryCount ? 'Categoría' : 'Modalidad'
  const pendingGroups = count.totalGroups - count.countedGroups

  const handleFinish = async () => {
    if (count.finishing) return

    if (isRecount) {
      if (
        count.pendingRecounts > 0 &&
        !window.confirm(
          `Quedan ${count.pendingRecounts} grupos por recontar. ¿Finalizar la sesión?`,
        )
      ) {
        return
      }
    } else if (
      pendingGroups > 0 &&
      !window.confirm(
        `Has contado ${count.countedGroups} de ${count.totalGroups} grupos. ¿Finalizar este conteo como parcial?`,
      )
    ) {
      return
    }

    await count.finish()
  }

  return (
    <PageShell
      description={`${definition.description} Introduce una cantidad física por cada grupo completo.`}
      eyebrow={bootstrap.sede.nombre}
      onLogout={onLogout}
      title={pageTitle}
      wide
    >
      <div className="count-summary" aria-label="Estado de la sesión">
        <div>
          <span>{summaryLabel}</span>
          <strong>{pageTitle}</strong>
        </div>
        <div>
          <span>Sede</span>
          <strong>{bootstrap.sede.nombre}</strong>
        </div>
        <div>
          <span>{isRecount ? 'Pendientes' : 'Progreso'}</span>
          <strong>
            {isRecount
              ? count.pendingRecounts
              : `${count.countedGroups} / ${count.totalGroups}`}
          </strong>
        </div>
        <div>
          <span>Tiempo restante</span>
          <strong>{formatRemainingTime(count.remainingSeconds)}</strong>
        </div>
      </div>

      {count.expired ? (
        <div className="notice notice--warning" role="alert">
          <strong>Sesión vencida</strong>
          <p>La captura está bloqueada mientras se actualiza el estado.</p>
        </div>
      ) : null}

      {count.error ? (
        <div className="notice notice--error" role="alert">
          <strong>No se pudo completar la operación</strong>
          <p>{count.error}</p>
        </div>
      ) : null}

      {count.status === 'loading' ? (
        <p className="empty-state" role="status">
          Cargando grupos de la sesión…
        </p>
      ) : null}

      {count.status === 'error' ? (
        <button className="button" onClick={() => void count.loadGroups()}>
          Reintentar carga
        </button>
      ) : null}

      {count.status === 'ready' && count.response ? (
        <>
          <section aria-labelledby="groups-title" className="content-section">
            <div className="section-heading">
              <div>
                <h2 id="groups-title">Grupos</h2>
                <p>
                  {isRecount
                    ? `${count.recountedThisView} recontados en esta vista; ${count.pendingRecounts} pendientes.`
                    : 'El stock teórico corresponde al snapshot de la sesión.'}
                </p>
              </div>
            </div>

            <div className="count-group-list">
              {count.response.grupos.map((group) => {
                if (isRecount) {
                  if (!isSologRecountGroup(group)) return null

                  return (
                    <RecountGroupCard
                      captureDisabled={count.expired || count.finishing}
                      group={group}
                      key={group.grupo_id}
                      onRecount={count.recountGroup}
                      result={count.recountResults[group.grupo_id]}
                      saving={count.savingGroupIds.includes(group.grupo_id)}
                    />
                  )
                }

                return (
                  <CountGroupCard
                    captureDisabled={count.expired || count.finishing}
                    group={group}
                    key={group.grupo_id}
                    onSave={count.saveGroup}
                    result={count.saveResults[group.grupo_id]}
                    saving={count.savingGroupIds.includes(group.grupo_id)}
                  />
                )
              })}
            </div>

            {count.response.grupos.length === 0 ? (
              <p className="empty-state">Esta vista no contiene grupos.</p>
            ) : null}
          </section>

          <div className="finish-bar">
            <div>
              <strong>
                {isRecount
                  ? `${count.pendingRecounts} grupos pendientes de reconteo`
                  : `${count.countedGroups} de ${count.totalGroups} grupos contados`}
              </strong>
              <p>
                {isRecount
                  ? `${count.recountedThisView} recontados desde que se cargó esta vista.`
                  : 'El backend determinará si el resultado es completo o parcial.'}
              </p>
            </div>
            <button
              className="button button--danger"
              disabled={count.finishing || count.expired}
              onClick={() => void handleFinish()}
              type="button"
            >
              {count.finishing ? 'Finalizando…' : 'Finalizar conteo'}
            </button>
          </div>
        </>
      ) : null}
    </PageShell>
  )
}

export function CountPage({
  bootstrap,
  onLogout,
}: {
  bootstrap: SologOperationalBootstrap
  onLogout: () => void
}) {
  const session = bootstrap.sesion_activa
  const definition = session ? getActiveCountDefinition(session.tipo) : null

  if (!session || !definition) {
    return <UnsupportedCount bootstrap={bootstrap} onLogout={onLogout} />
  }

  return (
    <ActiveCount
      bootstrap={bootstrap}
      definition={definition}
      onLogout={onLogout}
      session={session}
    />
  )
}
