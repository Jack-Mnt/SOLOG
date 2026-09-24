import {
  useCallback,
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

export type AdminDialogFormat = 'dialog' | 'drawer'
export type AdminDialogSize = 'default' | 'wide'
export type AdminDialogKind = 'confirmation' | 'task' | 'management'

type AdminDialogCommonProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  className?: string
}

type AdminDialogLayoutProps =
  | {
      format?: 'dialog'
      size?: AdminDialogSize
      kind?: AdminDialogKind
      drawerMaxWidth?: never
    }
  | {
      format: 'drawer'
      size?: never
      kind?: never
      drawerMaxWidth?: number
    }

export type AdminDialogProps = AdminDialogCommonProps & AdminDialogLayoutProps

export function AdminDialog(props: AdminDialogProps) {
  const {
    title,
    description,
    children,
    footer,
    onClose,
    closeDisabled = false,
    className,
  } = props
  const format: AdminDialogFormat = props.format ?? 'dialog'
  const size = format === 'dialog' ? (props.size ?? 'default') : undefined
  const kind = format === 'dialog' ? props.kind : undefined
  const drawerMaxWidth = format === 'drawer' ? props.drawerMaxWidth : undefined
  const isDrawer = format === 'drawer'

  const titleId = useId()
  const descriptionId = useId()
  const [dialogToken] = useState(() => Symbol('admin-dialog'))
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const lifecycleRef = useRef(0)
  const closeRequestedRef = useRef(false)
  const closeFallbackRef = useRef<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(!isDrawer)

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

  const completeDrawerClose = useCallback(() => {
    if (!closeRequestedRef.current) return
    closeRequestedRef.current = false
    if (closeFallbackRef.current !== null) {
      window.clearTimeout(closeFallbackRef.current)
      closeFallbackRef.current = null
    }
    onClose()
  }, [onClose])

  const requestClose = useCallback(() => {
    if (closeDisabled || closeRequestedRef.current) return
    if (!isDrawer) {
      onClose()
      return
    }

    closeRequestedRef.current = true
    setDrawerOpen(false)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      completeDrawerClose()
      return
    }

    closeFallbackRef.current = window.setTimeout(completeDrawerClose, 250)
  }, [closeDisabled, completeDrawerClose, isDrawer, onClose])

  useEffect(() => {
    if (!isDrawer) return
    closeRequestedRef.current = false
    const frame = window.requestAnimationFrame(() => setDrawerOpen(true))
    return () => window.cancelAnimationFrame(frame)
  }, [isDrawer])

  useEffect(
    () => () => {
      if (closeFallbackRef.current !== null) {
        window.clearTimeout(closeFallbackRef.current)
      }
    },
    [],
  )

  useLayoutEffect(() => {
    if (!isTop || !dialogRef.current || (isDrawer && !drawerOpen)) return
    focusDialogEntry(dialogRef.current)
  }, [drawerOpen, isDrawer, isTop])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTop || (isDrawer && !drawerOpen)) return

      if (event.key === 'Escape') {
        if (closeDisabled) return
        event.preventDefault()
        event.stopImmediatePropagation()
        requestClose()
        return
      }

      if (event.key === 'Tab' && dialogRef.current) {
        trapDialogTab(event, dialogRef.current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDisabled, drawerOpen, isDrawer, isTop, requestClose])

  const drawerStyle = isDrawer && drawerMaxWidth
    ? ({
        '--admin-dialog-drawer-max-width': `${Math.min(Math.max(drawerMaxWidth, 320), 960)}px`,
      } as CSSProperties)
    : undefined

  const backdropLayoutClass = isDrawer
    ? 'admin-dialog-backdrop--drawer'
    : `admin-dialog-backdrop--${size}`
  const dialogLayoutClass = isDrawer
    ? 'admin-dialog--drawer'
    : `admin-dialog--${size}`
  const kindClass = kind ? ` admin-dialog--kind-${kind}` : ''
  const hasFooter =
    footer !== undefined && footer !== null && footer !== false

  return (
    <div
      className={`admin-dialog-backdrop ${backdropLayoutClass}${isDrawer && drawerOpen ? ' is-open' : ''}`}
      inert={!isTop || (isDrawer && !drawerOpen)}
      onMouseDown={(event) => {
        if (
          isTop &&
          event.target === event.currentTarget &&
          !closeDisabled
        ) {
          requestClose()
        }
      }}
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`admin-dialog ${dialogLayoutClass}${kindClass}${className ? ` ${className}` : ''}`}
        ref={dialogRef}
        role="dialog"
        style={drawerStyle}
        tabIndex={-1}
        onTransitionEnd={(event) => {
          if (
            isDrawer &&
            closeRequestedRef.current &&
            event.target === event.currentTarget &&
            event.propertyName === 'transform'
          ) {
            completeDrawerClose()
          }
        }}
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
            onClick={requestClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>
        <div className="admin-dialog__body">{children}</div>
        {hasFooter ? (
          <footer className="admin-dialog__footer">{footer}</footer>
        ) : null}
      </section>
    </div>
  )
}
