import type { ReactNode } from 'react'

export type PanelLoaderVariant = 'fullscreen' | 'contained' | 'compact'
export type PanelLoaderState = 'loading' | 'error'

interface PanelLoaderProps {
  variant?: PanelLoaderVariant
  state?: PanelLoaderState
  contained?: boolean
  label?: string
  title?: string
  description?: string
  actions?: ReactNode
}

export function PanelLoader({
  variant,
  state = 'loading',
  contained = false,
  label = 'Cargando el panel…',
  title = 'No se pudo cargar el panel.',
  description,
  actions,
}: PanelLoaderProps) {
  const resolvedVariant = variant ?? (contained ? 'contained' : 'fullscreen')
  const isError = state === 'error'
  const className = [
    'panel-loader',
    resolvedVariant !== 'fullscreen' ? `panel-loader--${resolvedVariant}` : '',
    isError ? 'panel-loader--error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      aria-busy={!isError}
      aria-live={isError ? 'assertive' : 'polite'}
      className={className}
      role={isError ? 'alert' : 'status'}
    >
      <div className="panel-loader__content">
        <span className="panel-loader__symbol" aria-hidden="true">
          <span className="panel-loader__halo" />
          <img alt="" src="/isotipo.svg" />
        </span>

        {isError ? (
          <>
            <strong className="panel-loader__title">{title}</strong>
            {description ? (
              <p className="panel-loader__description">{description}</p>
            ) : null}
            {actions ? (
              <div className="panel-loader__actions">{actions}</div>
            ) : null}
          </>
        ) : (
          <>
            <span className="panel-loader__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="panel-loader__label">{label}</span>
          </>
        )}
      </div>
    </div>
  )
}
