interface PanelLoaderProps {
  contained?: boolean
}

export function PanelLoader({ contained = false }: PanelLoaderProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={'panel-loader' + (contained ? ' panel-loader--contained' : '')}
      role="status"
    >
      <div className="panel-loader__content">
        <span className="panel-loader__symbol" aria-hidden="true">
          <span className="panel-loader__halo" />
          <img alt="" src="/isotipo.svg" />
        </span>
        <span className="panel-loader__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="panel-loader__label">Cargando el panel…</span>
      </div>
    </div>
  )
}
