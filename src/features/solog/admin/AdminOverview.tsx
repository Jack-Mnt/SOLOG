import { formatAdminDate } from './format'
import type { SologAdminBootstrap, SologAdminSite } from '../types'

function SiteAdminCard({
  site,
}: {
  site: SologAdminSite
}) {
  const fortnight = site.cobertura_quincenal
  const daily = site.cobertura_diaria
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
        <section aria-label={`Cobertura quincenal de ${site.nombre}`}>
          <span>Cobertura quincenal</span>
          <strong>
            {fortnight.grupos_contados} / {fortnight.grupos_totales}
          </strong>
          <small>{fortnight.porcentaje}% · {fortnight.completa ? 'Completa' : `${fortnight.pendientes} pendientes`}</small>
        </section>

        <section aria-label={`Cobertura diaria de ${site.nombre}`}>
          <span>Cobertura de hoy</span>
          <strong>{daily.grupos_contados} / {daily.grupos_totales}</strong>
          <small>{daily.porcentaje}% contado</small>
        </section>

        <section aria-label={`Sesión de ${site.nombre}`}>
          <span>Sesión</span>
          {site.sesion_activa ? (
            <>
              <strong>{site.sesion_activa.grupos_registrados} grupos registrados</strong>
              <small>Inicio: {formatAdminDate(site.sesion_activa.iniciado_at)}</small>
              <small>Expira: {formatAdminDate(site.sesion_activa.expira_at)}</small>
            </>
          ) : (
            <strong>Sin sesión activa</strong>
          )}
        </section>

        <section aria-label={`Tablet de ${site.nombre}`}>
          <span>Tablet</span>
          {site.tablet ? (
            <>
              <strong>Autorizada</strong>
              <small>
                Autorizada: {formatAdminDate(site.tablet.autorizado_at)}
              </small>
              <small>
                Último acceso: {formatAdminDate(site.tablet.ultimo_acceso_at)}
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
    (site) => site.tablet !== null,
  ).length
  const activeSessions = bootstrap.sedes.filter(
    (site) => site.sesion_activa !== null,
  ).length

  return (
    <>
      <div className="status-grid status-grid--four" aria-label="Resumen general">
        <div className="status-item">
          <span><Building2 size={15} /> Sedes activas</span>
          <strong>{activeSites}</strong>
        </div>
        <div className="status-item">
          <span><TabletSmartphone size={15} /> Tablets autorizadas</span>
          <strong>{authorizedDevices}</strong>
        </div>
        <div className="status-item">
          <span><CalendarRange size={15} /> Solicitudes pendientes</span>
          <strong>{bootstrap.dispositivos_pendientes.length}</strong>
        </div>
        <div className="status-item">
          <span><Activity size={15} /> Sesiones activas</span>
          <strong>{activeSessions}</strong>
        </div>
      </div>

      <section className="content-section" aria-labelledby="sites-title">
        <div className="section-heading">
          <div>
            <div className="section-title-row"><span className="section-icon"><Building2 size={19} /></span><h2 id="sites-title">Resumen por sede</h2></div>
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
import {
  Activity,
  Building2,
  CalendarRange,
  TabletSmartphone,
} from 'lucide-react'
