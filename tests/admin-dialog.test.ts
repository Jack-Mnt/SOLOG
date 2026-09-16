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
})
