import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  History,
  LogIn,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { navigateTo } from "../../../lib/router";

type PublicPanelRoute = "/admin" | "/cajero";

interface PublicHomePageProps {
  panelRoute?: PublicPanelRoute;
}

interface HomeLinkProps {
  children: ReactNode;
  className: string;
  href: "/login" | PublicPanelRoute;
}

const capabilities: Array<{
  accent: "blue" | "violet" | "green";
  description: string;
  icon: LucideIcon;
  title: string;
}> = [
  {
    accent: "blue",
    description:
      "Registra existencias físicas por sede de forma rápida y confiable.",
    icon: ClipboardCheck,
    title: "Conteo",
  },
  {
    accent: "violet",
    description:
      "Detecta diferencias, investiga incidencias y da seguimiento a los conteos.",
    icon: ScanSearch,
    title: "Control",
  },
  {
    accent: "green",
    description:
      "Conserva el historial necesario para analizar cambios y tomar mejores decisiones.",
    icon: History,
    title: "Trazabilidad",
  },
];

function HomeLink({ children, className, href }: HomeLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateTo(href);
  };

  return (
    <a className={className} href={href} onClick={handleClick}>
      {children}
    </a>
  );
}

export function PublicHomePage({ panelRoute }: PublicHomePageProps) {
  const destination = panelRoute ?? "/login";
  const headerLabel = panelRoute ? "Ir a mi panel" : "Ingresar";
  const heroLabel = panelRoute ? "Ir a mi panel" : "Ingresar a SOLOG";

  return (
    <div className="solog-home">
      <header className="solog-home-header">
        <div className="solog-home-container solog-home-header__inner">
          <a
            aria-label="SOLOG, página de inicio"
            className="solog-home-brand"
            href="/"
          >
            <img alt="SOLOG" src="/Logo_SOLOG.png" />
          </a>
          <HomeLink
            className="solog-home-button solog-home-button--compact"
            href={destination}
          >
            <LogIn aria-hidden="true" size={18} />
            <span>{headerLabel}</span>
          </HomeLink>
        </div>
      </header>

      <main>
        <section className="solog-home-hero" aria-labelledby="solog-home-title">
          <div className="solog-home-container solog-home-hero__grid">
            <div className="solog-home-hero__content">
              <p className="solog-home-eyebrow">
                Plataforma interna de inventario
              </p>
              <h1 id="solog-home-title">
                Control inteligente
                <br />
                de <span>inventario</span>
              </h1>
              <p className="solog-home-hero__promise">
                Más cerca de la realidad.
              </p>
              <p className="solog-home-hero__description">
                SOLOG conecta el conteo físico con la información operativa para
                detectar diferencias, investigar incidencias y mantener el
                inventario bajo control.
              </p>
              <div className="solog-home-hero__actions">
                <HomeLink className="solog-home-button" href={destination}>
                  <span>{heroLabel}</span>
                  <ArrowRight aria-hidden="true" size={19} />
                </HomeLink>
                <small>Acceso restringido al personal autorizado.</small>
              </div>
            </div>

            <div className="solog-home-symbol" aria-hidden="true">
              <span className="solog-home-symbol__halo" />
              <span className="solog-home-symbol__ring solog-home-symbol__ring--outer" />
              <span className="solog-home-symbol__ring solog-home-symbol__ring--inner" />
              <span className="solog-home-symbol__particle solog-home-symbol__particle--blue" />
              <span className="solog-home-symbol__particle solog-home-symbol__particle--violet" />
              <span className="solog-home-symbol__particle solog-home-symbol__particle--green" />
              <img alt="" src="/isotipo.svg" />
            </div>
          </div>
        </section>

        <section
          className="solog-home-capabilities"
          aria-labelledby="capabilities-title"
        >
          <div className="solog-home-container">
            <div className="solog-home-section-heading">
              <p className="solog-home-eyebrow">Una operación conectada</p>
              <h2 id="capabilities-title">Del conteo a la decisión</h2>
            </div>
            <div className="solog-home-capabilities__grid">
              {capabilities.map(
                ({ accent, description, icon: Icon, title }) => (
                  <article
                    className={`solog-home-capability solog-home-capability--${accent}`}
                    key={title}
                  >
                    <span className="solog-home-capability__icon">
                      <Icon aria-hidden="true" size={23} />
                    </span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          className="solog-home-operation"
          aria-labelledby="operation-title"
        >
          <div className="solog-home-container">
            <div className="solog-home-operation__panel">
              <span className="solog-home-operation__icon">
                <Building2 aria-hidden="true" size={25} />
              </span>
              <div>
                <h2 id="operation-title">
                  Diseñado para la operación de Puerto Rico
                </h2>
                <p>
                  Una herramienta central para conectar sedes, inventario físico
                  y seguimiento administrativo.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="solog-home-final" aria-labelledby="final-cta-title">
          <div className="solog-home-container solog-home-final__inner">
            <div>
              <p className="solog-home-eyebrow">SOLOG</p>
              <h2 id="final-cta-title">Accede a tu espacio de trabajo</h2>
            </div>
            <HomeLink className="solog-home-button" href={destination}>
              <span>{headerLabel}</span>
              <ArrowRight aria-hidden="true" size={19} />
            </HomeLink>
          </div>
        </section>
      </main>

      <footer className="solog-home-footer">
        <div className="solog-home-container solog-home-footer__inner">
          <div className="solog-home-footer__brand">
            <img alt="" aria-hidden="true" src="/isotipo.svg" />
            <strong>SOLOG · Más cerca de la realidad</strong>
          </div>
          <small>Built by Jack Mnt</small>
          <small>© 2026 Puerto Rico.</small>
        </div>
      </footer>
    </div>
  );
}
