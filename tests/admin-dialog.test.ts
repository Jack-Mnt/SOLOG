import { describe, expect, test } from 'bun:test'
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
