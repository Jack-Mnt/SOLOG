import { ArrowDownWideNarrow, CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react'
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type IconButtonVariant = 'default' | 'primary' | 'danger'
type IconButtonSize = 'default' | 'compact'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  'aria-label': string
  children: ReactNode
  variant?: IconButtonVariant
  size?: IconButtonSize
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type={type}
      className={[
        'icon-button',
        variant === 'primary' ? 'icon-button--primary' : '',
        variant === 'danger' ? 'icon-button--danger' : '',
        size === 'compact' ? 'icon-button--compact' : '',
        className,
      ].filter(Boolean).join(' ')}
    />
  ),
)

IconButton.displayName = 'IconButton'

export type AdminSortOption<T extends string> = {
  value: T
  label: string
}

type AdminSortProps<T extends string> = {
  value: T
  defaultValue: T
  options: readonly AdminSortOption<T>[]
  onChange: (value: T) => void
}

export function AdminSort<T extends string>({ value, defaultValue, options, onChange }: AdminSortProps<T>) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const activeOption = options.find((option) => option.value === value)
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const menuId = useId()
  const active = value !== defaultValue

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (open) items.current[activeIndex]?.focus()
  }, [activeIndex, open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  const select = (next: T) => {
    onChange(next)
    close()
  }

  return <div
    className="admin-sort"
    ref={root}
    onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false)
      }
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        close()
        return
      }
      if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const target = event.target
      if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'menuitemradio') return
      event.preventDefault()
      const current = items.current.indexOf(target)
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      items.current[next]?.focus()
    }}
  >
    <IconButton
      ref={trigger}
      className={active ? 'admin-sort__trigger admin-sort__trigger--active' : 'admin-sort__trigger'}
      aria-label="Ordenar resultados"
      title={activeOption && active ? `Ordenar: ${activeOption.label}` : 'Ordenar'}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => setOpen((current) => !current)}
    >
      <ArrowDownWideNarrow size={17} aria-hidden="true" />
    </IconButton>
    {open && <div className="admin-sort__menu" id={menuId} role="menu" aria-label="Opciones de orden">
      {options.map((option, index) => <button
        type="button"
        role="menuitemradio"
        key={option.value}
        ref={(node) => { items.current[index] = node }}
        tabIndex={value === option.value ? 0 : -1}
        aria-checked={value === option.value}
        onClick={() => select(option.value)}
      >
        {option.label}
      </button>)}
    </div>}
  </div>
}
export function AdminNotice({ tone, children, onDismiss, action }: { tone: 'success' | 'info' | 'warning' | 'error'; children: ReactNode; onDismiss: () => void; action?: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : tone === 'warning' ? TriangleAlert : XCircle
  return <div className={`admin-notice admin-notice--${tone}`} role={tone === 'warning' || tone === 'error' ? 'alert' : 'status'}>
    <Icon size={18} aria-hidden="true" />
    <span className="admin-notice__message">{children}</span>
    {action && <span className="admin-notice__action">{action}</span>}
    <IconButton aria-label="Cerrar mensaje" title="Cerrar mensaje" className="admin-notice__close" onClick={onDismiss}><XCircle size={16} aria-hidden="true" /></IconButton>
  </div>
}