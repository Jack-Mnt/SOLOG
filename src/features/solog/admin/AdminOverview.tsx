import {
  formatAdminDate,
  getCoveragePercentage,
} from './format'
import { getSologCountTypeLabel } from '../labels'
import type { SologAdminBootstrap, SologAdminSite } from '../types'

function SiteAdminCard({
  site,
}: {
  site: SologAdminSite
}) {
  const coverage = site.cobertura_hoy
  const percentage = getCoveragePercentage(
    coverage.grupos_contados,
    coverage.grupos_totales,
  )
  return (
    <article className="admin-site-card">
      <div className="admin-site-card__heading">
        <div>
          <h3>{site.nombre}</h3>
          <p>{site.activo ? 'Sede activa' : 'Sede inactiva'}</p>
        </div>
        <span className="count-state">
          {site.sesion_activa ? 'Sesión activa' : 'Sin sesión activa'}
        </span>
      </div>

      <div className="admin-site-grid">
        <section aria-label={`Cobertura de ${site.nombre}`}>
          <span>Cobertura de hoy</span>
          <strong>
            {coverage.grupos_contados} / {coverage.grupos_totales}
          </strong>
          <small>{percentage}% contado</small>
        </section>

        <section aria-label={`Sesión de ${site.nombre}`}>
          <span>Sesión</span>
          {site.sesion_activa ? (
            <>
              <strong>{getSologCountTypeLabel(site.sesion_activa.tipo)}</strong>
              <small>Inicio: {formatAdminDate(site.sesion_activa.iniciado_at)}</small>
              <small>Expira: {formatAdminDate(site.sesion_activa.expira_at)}</small>
            </>
          ) : (
            <strong>Sin sesión activa</strong>
          )}
        </section>

        <section aria-label={`Tablet de ${site.nombre}`}>
          <span>Tablet</span>
          {site.dispositivo ? (
            <>
              <strong>Autorizada</strong>
              <small>
                Autorizada: {formatAdminDate(site.dispositivo.autorizado_at)}
              </small>
              <small>
                Último acceso: {formatAdminDate(site.dispositivo.ultimo_acceso_at)}
              </small>
            </>
          ) : (
            <strong>Sin tablet autorizada</strong>
          )}
        </section>
      </div>
    </article>
  )
}

export function AdminOverview({
  bootstrap,
}: {
  bootstrap: SologAdminBootstrap
}) {
  const activeSites = bootstrap.sedes.filter((site) => site.activo).length
  const authorizedDevices = bootstrap.sedes.filter(
    (site) => site.dispositivo !== null,
  ).length
  const activeSessions = bootstrap.sedes.filter(
    (site) => site.sesion_activa !== null,
  ).length

  return (
    <>
      <div className="status-grid status-grid--four" aria-label="Resumen general">
        <div className="status-item">
          <span>Sedes activas</span>
          <strong>{activeSites}</strong>
        </div>
        <div className="status-item">
          <span>Tablets autorizadas</span>
          <strong>{authorizedDevices}</strong>
        </div>
        <div className="status-item">
          <span>Solicitudes pendientes</span>
          <strong>{bootstrap.dispositivos_pendientes.length}</strong>
        </div>
        <div className="status-item">
          <span>Sesiones activas</span>
          <strong>{activeSessions}</strong>
        </div>
      </div>

      <section className="content-section" aria-labelledby="sites-title">
        <div className="section-heading">
          <div>
            <h2 id="sites-title">Resumen por sede</h2>
            <p>Cobertura, sesión operativa y tablet autorizada.</p>
          </div>
        </div>
        {bootstrap.sedes.length === 0 ? (
          <div className="empty-state">No hay sedes disponibles.</div>
        ) : (
          <div className="admin-site-list">
            {bootstrap.sedes.map((site) => (
              <SiteAdminCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
