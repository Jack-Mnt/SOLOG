import { useEffect, useId, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function AdminDialog({
  title,
  description,
  children,
  footer,
  onClose,
  closeDisabled = false,
  wide = false,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  wide?: boolean
  className?: string
}) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDisabled, onClose])

  return (
    <div
      className="admin-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`admin-dialog${wide ? ' admin-dialog--wide' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
      >
        <header className="admin-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            aria-label="Cerrar"
            className="icon-button"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>
        <div className="admin-dialog__body">{children}</div>
        {footer ? <footer className="admin-dialog__footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
