import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import {
  focusDialogEntry,
  restoreDialogFocusAfterLifecycle,
  trapDialogTab,
} from './admin.dialog.focus'
import { adminDialogScrollLock } from './admin.dialog.scroll'
import { adminDialogStack } from './admin.dialog.stack'

export type AdminDialogVariant = 'default' | 'wide' | 'drawer'

export function AdminDialog({
  title,
  description,
  children,
  footer,
  onClose,
  closeDisabled = false,
  variant = 'default',
  drawerMaxWidth,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  variant?: AdminDialogVariant
  drawerMaxWidth?: number
  className?: string
}) {
  const titleId = useId()
  const descriptionId = useId()
  const [dialogToken] = useState(() => Symbol('admin-dialog'))
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const lifecycleRef = useRef(0)

  useSyncExternalStore(
    adminDialogStack.subscribe,
    adminDialogStack.snapshot,
    adminDialogStack.snapshot,
  )

  useLayoutEffect(() => {
    if (returnFocusRef.current === null) {
      const active = document.activeElement
      returnFocusRef.current =
        active instanceof HTMLElement ? active : null
    }

    const lifecycle = ++lifecycleRef.current
    const unregister = adminDialogStack.register(dialogToken)
    const unlockScroll = adminDialogScrollLock.lock(document.body)
    return () => {
      unregister()
      unlockScroll()
      restoreDialogFocusAfterLifecycle(
        returnFocusRef.current,
        lifecycleRef,
        lifecycle,
      )
    }
  }, [dialogToken])

  const isTop = adminDialogStack.isTop(dialogToken)

  useLayoutEffect(() => {
    if (!isTop || !dialogRef.current) return
    focusDialogEntry(dialogRef.current)
  }, [isTop])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTop) return

      if (event.key === 'Escape') {
        if (closeDisabled) return
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
        return
      }

      if (event.key === 'Tab' && dialogRef.current) {
        trapDialogTab(event, dialogRef.current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDisabled, isTop, onClose])

  const drawerStyle = variant === 'drawer' && drawerMaxWidth
    ? ({
        '--admin-dialog-drawer-max-width': `${Math.min(Math.max(drawerMaxWidth, 320), 960)}px`,
      } as CSSProperties)
    : undefined

  const resolvedFooter = footer === undefined ? (
    <button
      type="button"
      className="button button--secondary"
      disabled={closeDisabled}
      onClick={onClose}
    >
      Cerrar
    </button>
  ) : footer

  return (
    <div
      className={`admin-dialog-backdrop admin-dialog-backdrop--${variant}`}
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
        className={`admin-dialog admin-dialog--${variant}${className ? ` ${className}` : ''}`}
        ref={dialogRef}
        role="dialog"
        style={drawerStyle}
        tabIndex={-1}
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
        {resolvedFooter !== null && resolvedFooter !== false ? (
          <footer className="admin-dialog__footer">{resolvedFooter}</footer>
        ) : null}
      </section>
    </div>
  )
}
