import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type IconButtonVariant = 'default' | 'danger'
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
        variant === 'danger' ? 'icon-button--danger' : '',
        size === 'compact' ? 'icon-button--compact' : '',
        className,
      ].filter(Boolean).join(' ')}
    />
  ),
)

IconButton.displayName = 'IconButton'