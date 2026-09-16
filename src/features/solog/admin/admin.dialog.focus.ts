export const ADMIN_DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function canReceiveDialogFocus(element: HTMLElement) {
  return (
    element.isConnected &&
    !element.hidden &&
    element.getAttribute('aria-hidden') !== 'true' &&
    !element.hasAttribute('disabled') &&
    !element.closest('[inert]')
  )
}

export function dialogFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(ADMIN_DIALOG_FOCUSABLE_SELECTOR),
  ).filter(canReceiveDialogFocus)
}

export function focusDialogEntry(root: HTMLElement) {
  const active = document.activeElement
  if (active instanceof HTMLElement && root.contains(active)) return

  const target = dialogFocusableElements(root)[0] ?? root
  target.focus({ preventScroll: true })
}

export function trapDialogTab(event: KeyboardEvent, root: HTMLElement) {
  if (event.key !== 'Tab') return false

  const focusable = dialogFocusableElements(root)
  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

  if (!focusable.length) {
    event.preventDefault()
    root.focus({ preventScroll: true })
    return true
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeIndex = active ? focusable.indexOf(active) : -1
  const target = event.shiftKey
    ? activeIndex <= 0
      ? last
      : null
    : activeIndex === -1 || activeIndex === focusable.length - 1
      ? first
      : null

  if (!target) return false

  event.preventDefault()
  target.focus({ preventScroll: true })
  return true
}

export function restoreDialogFocus(target: HTMLElement | null) {
  if (!target) return

  const restore = () => {
    if (!canReceiveDialogFocus(target)) return false
    target.focus({ preventScroll: true })
    return true
  }

  queueMicrotask(() => {
    if (restore()) return
    window.setTimeout(restore, 0)
  })
}


export function restoreDialogFocusAfterLifecycle(
  target: HTMLElement | null,
  lifecycleRef: { current: number },
  lifecycle: number,
) {
  queueMicrotask(() => {
    if (lifecycleRef.current !== lifecycle) return
    restoreDialogFocus(target)
  })
}
