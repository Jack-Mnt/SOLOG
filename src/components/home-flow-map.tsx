import { History, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface FlowNodeProps {
  className?: string;
  icon: ReactNode;
  subtitle: string;
  title: string;
}

function FlowNode({ className = "", icon, subtitle, title }: FlowNodeProps) {
  return (
    <article className={`solog-home-flow__node ${className}`}>
      <span className="solog-home-flow__node-icon">{icon}</span>
      <span className="solog-home-flow__node-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
    </article>
  );
}

function SologMark({ className = "" }: { className?: string }) {
  return <img alt="" className={className} src="/isotipo.svg" />;
}

function IconMark({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: "blue" | "green" | "violet";
}) {
  return (
    <span
      className={`solog-home-flow__utility-icon solog-home-flow__utility-icon--${tone}`}
    >
      <Icon aria-hidden="true" size={17} />
    </span>
  );
}

export function HomeFlowMap() {
  return (
    <figure className="solog-home-flow">
      <div className="solog-home-flow__stage" aria-hidden="true">
        <div className="solog-home-flow__canvas">
          <svg
            className="solog-home-flow__pipes"
            preserveAspectRatio="none"
            viewBox="0 0 300 400"
          >
            <path className="solog-home-flow__pipe" d="M50 50H150" />
            <path className="solog-home-flow__packet" d="M50 50H150" />

            <path className="solog-home-flow__pipe" d="M150 50V150" />
            <path className="solog-home-flow__packet" d="M150 50V150" />

            <path
              className="solog-home-flow__pipe"
              d="M150 150H86Q68 150 68 168V232Q68 250 50 250"
            />
            <path
              className="solog-home-flow__packet solog-home-flow__packet--green"
              d="M150 150H86Q68 150 68 168V232Q68 250 50 250"
            />

            <path
              className="solog-home-flow__pipe"
              d="M50 250H108Q126 250 126 232V168Q126 150 144 150H150"
            />
            <path
              className="solog-home-flow__packet solog-home-flow__packet--green"
              d="M50 250H108Q126 250 126 232V168Q126 150 144 150H150"
            />

            <path className="solog-home-flow__pipe" d="M150 150H250V250" />
            <path
              className="solog-home-flow__packet solog-home-flow__packet--violet"
              d="M150 150H250V250"
            />

            <path className="solog-home-flow__pipe" d="M250 250V350" />
            <path
              className="solog-home-flow__packet solog-home-flow__packet--violet"
              d="M250 250V350"
            />

            <path className="solog-home-flow__pipe" d="M250 350H150" />
            <path
              className="solog-home-flow__packet solog-home-flow__packet--green"
              d="M250 350H150"
            />
          </svg>

          <div className="solog-home-flow__grid">
            <div className="solog-home-flow__cell solog-home-flow__cell--tumisoft">
              <FlowNode
                icon={
                  <img
                    alt=""
                    className="solog-home-flow__tumisoft-mark"
                    src="/tumisoft128.png"
                  />
                }
                subtitle="Stock actualizado"
                title="TumiSoft"
              />
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--conexion">
              <FlowNode
                icon={
                  <img
                    alt=""
                    className="solog-home-flow__supabase-icon"
                    src="/ConeXion128.png"
                  />
                }
                subtitle="Sincronización"
                title="ConeXion"
              />
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--supabase">
              <FlowNode
                className="solog-home-flow__node--supabase"
                icon={
                  <img
                    alt=""
                    className="solog-home-flow__supabase-icon"
                    src="/supabase128.png"
                  />
                }
                subtitle="Base de datos"
                title="Supabase"
              />
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--core">
              <div className="solog-home-flow__core">
                <SologMark className="solog-home-flow__core-mark" />
                <img
                  className="solog-home-flow__wordmark"
                  src="/Wordmark128.png"
                />
              </div>
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--cashier">
              <FlowNode
                className="solog-home-flow__node--cashier"
                icon={
                  <span className="solog-home-flow__product-mark">
                    <SologMark />
                  </span>
                }
                subtitle="Conteo fisico"
                title="Cajero"
              />
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--admin">
              <FlowNode
                icon={
                  <span className="solog-home-flow__product-mark">
                    <SologMark />
                  </span>
                }
                subtitle="Análisis y gestión"
                title="Admin"
              />
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--excel">
              <FlowNode
                className="solog-home-flow__node--mini"
                icon={
                  <img
                    alt=""
                    className="solog-home-flow__supabase-icon"
                    src="/excel128.png"
                  />
                }
                subtitle="Diferencias"
                title="Excel"
              />
            </div>

            <div className="solog-home-flow__cell solog-home-flow__cell--control">
              <FlowNode
                className="solog-home-flow__node--mini"
                icon={<IconMark icon={History} tone="violet" />}
                subtitle="Cronología"
                title="Control"
              />
            </div>
          </div>
        </div>
      </div>

      <figcaption className="solog-home-flow__caption">
        TumiSoft entrega el Excel a ConeXion. ConeXion sincroniza la información
        con SOLOG; SOLOG Cajero registra conteos y devuelve información al
        núcleo, mientras SOLOG Admin deriva el análisis hacia Control y la
        exportación de diferencias a Excel. Supabase permanece como base de
        datos central fuera del flujo lineal.
      </figcaption>
    </figure>
  );
}
