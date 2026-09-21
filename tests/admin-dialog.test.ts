import { describe, expect, test } from 'bun:test'
import { createAdminDialogScrollLock } from '../src/features/solog/admin/admin.dialog.scroll'
import { createAdminDialogStack } from '../src/features/solog/admin/admin.dialog.stack'

describe('AdminDialog stack', () => {
  test('el último diálogo registrado es el único superior', () => {
    const stack = createAdminDialogStack()
    const parent = Symbol('parent')
    const child = Symbol('child')

    const unregisterParent = stack.register(parent)
    expect(stack.isTop(parent)).toBe(true)

    const unregisterChild = stack.register(child)
    expect(stack.isTop(parent)).toBe(false)
    expect(stack.isTop(child)).toBe(true)

    unregisterChild()
    expect(stack.isTop(parent)).toBe(true)

    unregisterParent()
    expect(stack.isTop(parent)).toBe(false)
  })

  test('soporta tres niveles y reactiva el padre inmediato al cerrar el superior', () => {
    const stack = createAdminDialogStack()
    const proposal = Symbol('proposal')
    const price = Symbol('price')
    const valuation = Symbol('valuation')

    const removeProposal = stack.register(proposal)
    const removePrice = stack.register(price)
    const removeValuation = stack.register(valuation)

    expect(stack.isTop(valuation)).toBe(true)
    expect(stack.isTop(price)).toBe(false)
    expect(stack.isTop(proposal)).toBe(false)

    removeValuation()
    expect(stack.isTop(price)).toBe(true)
    expect(stack.isTop(proposal)).toBe(false)

    removePrice()
    expect(stack.isTop(proposal)).toBe(true)

    removeProposal()
  })

  test('desregistrar dos veces no altera la pila ni emite una revisión extra', () => {
    const stack = createAdminDialogStack()
    const dialog = Symbol('dialog')
    const revisions: number[] = []
    const unsubscribe = stack.subscribe(() => revisions.push(stack.snapshot()))

    const unregister = stack.register(dialog)
    unregister()
    unregister()

    expect(revisions).toEqual([1, 2])
    unsubscribe()
  })

  test('AdminDialog limita Escape y backdrop al diálogo superior', async () => {
    const source = await Bun.file(
      'src/features/solog/admin/admin.dialog.tsx',
    ).text()

    expect(source).toContain('event.defaultPrevented')
    expect(source).toContain('!isTop')
    expect(source).toContain('event.stopImmediatePropagation()')
    expect(source).toContain('inert={!isTop}')
    expect(source).toMatch(
      /isTop\s*&&\s*event\.target\s*===\s*event\.currentTarget\s*&&\s*!closeDisabled/,
    )
  })

  test('scroll lock conserva el overflow previo hasta cerrar el último diálogo', () => {
    const lock = createAdminDialogScrollLock()
    const body = { style: { overflow: 'auto' } }

    const releaseParent = lock.lock(body)
    expect(body.style.overflow).toBe('hidden')
    expect(lock.count()).toBe(1)

    const releaseChild = lock.lock(body)
    expect(body.style.overflow).toBe('hidden')
    expect(lock.count()).toBe(2)

    releaseParent()
    expect(body.style.overflow).toBe('hidden')
    expect(lock.count()).toBe(1)

    releaseChild()
    expect(body.style.overflow).toBe('auto')
    expect(lock.count()).toBe(0)

    releaseChild()
    expect(body.style.overflow).toBe('auto')
    expect(lock.count()).toBe(0)
  })

  test('AdminDialog conserva Footer por defecto y permite omitirlo con null', async () => {
    const source = await Bun.file(
      'src/features/solog/admin/admin.dialog.tsx',
    ).text()

    expect(source).toContain("adminDialogScrollLock.lock(document.body)")
    expect(source).toContain('const resolvedFooter = footer === undefined ? (')
    expect(source).toContain('resolvedFooter !== null && resolvedFooter !== false')
    expect(source).toContain('<footer className="admin-dialog__footer">{resolvedFooter}</footer>')
    expect(source).toContain('button button--secondary')
    expect(source).toContain('Cerrar')
  })

  test('CSS aplica el contrato visual y responsive congelado', async () => {
    const css = await Bun.file('src/features/solog/admin/admin.css').text()

    expect(css).toContain('var(--color-dark-surface) 50%')
    expect(css).toContain('backdrop-filter: blur(4px)')
    expect(css).toContain('width: min(calc(100% - 48px), var(--admin-dialog-drawer-max-width, 960px))')
    expect(css).toContain('max-width: 960px')
    expect(css).toContain('.admin-dialog--default')
    expect(css).toContain('max-height: calc(100dvh - 24px)')
    expect(css).toContain('.admin-dialog-backdrop--wide,')
    expect(css).toContain('.admin-dialog-backdrop--drawer')
    expect(css).not.toContain('@media (max-width: 560px)')
    expect(css).not.toContain('width: min(1100px, 100%)')
  })

  test('AdminDialog centraliza entrada, trap y restauración de foco', async () => {
    const source = await Bun.file(
      'src/features/solog/admin/admin.dialog.tsx',
    ).text()
    const focus = await Bun.file(
      'src/features/solog/admin/admin.dialog.focus.ts',
    ).text()

    expect(source).toContain('focusDialogEntry(dialogRef.current)')
    expect(source).toContain("event.key === 'Tab'")
    expect(source).toContain('trapDialogTab(event, dialogRef.current)')
    expect(source).toContain('restoreDialogFocusAfterLifecycle(')
    expect(source).toContain('returnFocusRef.current === null')
    expect(focus).toContain('lifecycleRef.current !== lifecycle')
    expect(source).toContain('tabIndex={-1}')
    expect(focus).toContain('button:not([disabled])')
    expect(focus).toContain("event.shiftKey")
    expect(focus).toContain("root.focus({ preventScroll: true })")
    expect(focus).toContain("window.setTimeout(restore, 0)")
  })
})
