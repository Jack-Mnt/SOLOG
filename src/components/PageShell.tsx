import type { ReactNode } from 'react'

interface PageShellProps {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
  onLogout?: () => void
  wide?: boolean
}

export function PageShell({
  eyebrow,
  title,
  description,
  children,
  onLogout,
  wide = false,
}: PageShellProps) {
  return (
    <main className="shell">
      <section
        className={`status-card${wide ? ' status-card--wide' : ''}`}
        aria-labelledby="page-title"
      >
        <div className="page-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="page-title">{title}</h1>
            <p className="subtitle">{description}</p>
          </div>
          {onLogout ? (
            <button className="button button--secondary" onClick={onLogout}>
              Cerrar sesión
            </button>
          ) : null}
        </div>
        {children}
      </section>
    </main>
  )
}
