import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { adminDialogStack } from './admin.dialog.stack'

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
  const [dialogToken] = useState(() => Symbol('admin-dialog'))

  useSyncExternalStore(
    adminDialogStack.subscribe,
    adminDialogStack.snapshot,
    adminDialogStack.snapshot,
  )

  useLayoutEffect(
    () => adminDialogStack.register(dialogToken),
    [dialogToken],
  )

  const isTop = adminDialogStack.isTop(dialogToken)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        !isTop ||
        closeDisabled
      ) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDisabled, isTop, onClose])

  return (
    <div
      className="admin-dialog-backdrop"
      inert={!isTop}
      onMouseDown={(event) => {
        if (
          isTop &&
          event.target === event.currentTarget &&
          !closeDisabled
        ) {
          onClose()
        }
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
