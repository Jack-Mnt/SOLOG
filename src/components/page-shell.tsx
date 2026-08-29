import { Boxes, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { PaletteSwitcher } from '../features/theme/PaletteSwitcher'

interface PageShellProps {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
  onLogout?: () => void
  wide?: boolean
  variant?: 'auth' | 'cashier' | 'admin'
}

export function PageShell({
  eyebrow,
  title,
  description,
  children,
  onLogout,
  wide = false,
  variant = 'cashier',
}: PageShellProps) {
  return (
    <main className={`shell shell--${variant}`}>
      <section
        className={`status-card status-card--${variant}${wide ? ' status-card--wide' : ''}`}
        aria-labelledby="page-title"
      >
        <header className="app-bar">
          <div className="app-brand" aria-label="SOLOG">
            <span className="app-brand__mark" aria-hidden="true">
              <Boxes size={22} strokeWidth={2.25} />
            </span>
            <span className="app-brand__name">SOLOG</span>
          </div>
          <div className="app-bar__actions">
            <PaletteSwitcher />
            {onLogout ? (
              <button
                aria-label="Cerrar sesión"
                className="app-bar__button"
                onClick={onLogout}
                type="button"
              >
                <LogOut aria-hidden="true" size={18} />
                <span>Cerrar sesión</span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="page-workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1 id="page-title">{title}</h1>
              <p className="subtitle">{description}</p>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}
