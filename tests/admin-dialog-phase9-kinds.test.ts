import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const confirmationConsumers = [
  'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
  'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
  'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
]

const taskConsumers = [
  'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
  'src/features/solog/admin/admin.valuation-dialog.tsx',
  'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
]

const managementConsumers = [
  'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
]

describe('AdminDialog Fase 9.5 — kinds', () => {
  test('clasifica los siete call sites congelados como confirmation', async () => {
    const sources = await Promise.all(confirmationConsumers.map(source))
    const total = sources.reduce(
      (count, current) =>
        count + (current.match(/kind="confirmation"/g)?.length ?? 0),
      0,
    )

    expect(total).toBe(7)
  })

  test('retira wrappers manuales y traslada la composición al kind', async () => {
    const sources = await Promise.all(confirmationConsumers.map(source))
    const css = await source('src/features/solog/admin/admin.css')

    for (const current of sources) {
      expect(current).not.toContain('admin-dialog-confirmation')
    }

    expect(css).not.toContain('.admin-dialog-confirmation')
    expect(css).toContain(
      '.admin-dialog--kind-confirmation .admin-dialog__body {',
    )
    expect(css).toContain(
      '.admin-dialog--kind-confirmation .admin-dialog__body > p {',
    )
    expect(css).toContain(
      '.admin-dialog--kind-confirmation .admin-dialog__body > .admin-notice--info .admin-notice__message {',
    )
  })

  test('preserva el ritmo compacto aprobado de confirmation', async () => {
    const css = await source('src/features/solog/admin/admin.css')
    const start = css.indexOf(
      '.admin-dialog--kind-confirmation .admin-dialog__body {',
    )
    const block = css.slice(start, css.indexOf('}', start) + 1)

    expect(block).toContain('display: grid')
    expect(block).toContain('gap: 12px')
  })

  test('clasifica los ocho call sites congelados de Task', async () => {
    const sources = await Promise.all(taskConsumers.map(source))
    const total = sources.reduce(
      (count, current) =>
        count + (current.match(/kind="task"/g)?.length ?? 0),
      0,
    )

    expect(total).toBe(8)
  })

  test('Task absorbe el ritmo base sin wrappers manuales', async () => {
    const sources = await Promise.all(taskConsumers.map(source))
    const css = await source('src/features/solog/admin/admin.css')

    for (const current of sources) {
      expect(current).not.toContain('admin-dialog-task')
    }

    expect(css).toContain('.admin-dialog--kind-task .admin-dialog__body {')
    expect(css).not.toContain('.admin-dialog-task')

    const start = css.indexOf('.admin-dialog--kind-task .admin-dialog__body {')
    const block = css.slice(start, css.indexOf('}', start) + 1)
    expect(block).toContain('display: grid')
    expect(block).toContain('gap: 16px')
  })

  test('Task conserva las geometrías default y wide congeladas', async () => {
    const groups = await source(
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    )
    const catalog = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(groups).toMatch(
      /title="Crear grupo"[\s\S]*?kind="task"[\s\S]*?size="wide"/,
    )
    expect(groups).toMatch(
      /title="Editar grupo"[\s\S]*?kind="task"/,
    )
    expect(catalog.match(/title="Resolver precio"/g)?.length).toBe(2)
    expect(catalog.match(/kind="task"/g)?.length).toBe(3)
    expect(catalog.match(/size="wide"/g)?.length).toBeGreaterThanOrEqual(3)
    expect(catalog).toMatch(
      /title="Publicar catálogo"[\s\S]*?kind="task"[\s\S]*?size="wide"/,
    )
  })
  test('clasifica los tres call sites congelados de Management', async () => {
    const sources = await Promise.all(managementConsumers.map(source))
    const total = sources.reduce(
      (count, current) =>
        count + (current.match(/kind="management"/g)?.length ?? 0),
      0,
    )

    expect(total).toBe(3)
  })

  test('Management absorbe el ritmo estructural y elimina el helper legacy', async () => {
    const sources = await Promise.all(managementConsumers.map(source))
    const css = await source('src/features/solog/admin/admin.css')

    for (const current of sources) {
      expect(current).not.toContain('admin-dialog-task')
    }

    expect(css).not.toContain('.admin-dialog-task')
    expect(css).toContain(
      '.admin-dialog--kind-management .admin-dialog__body {',
    )

    const start = css.indexOf(
      '.admin-dialog--kind-management .admin-dialog__body {',
    )
    const block = css.slice(start, css.indexOf('}', start) + 1)
    expect(block).toContain('display: grid')
    expect(block).toContain('gap: 16px')
  })

  test('Management conserva geometrías y composición específica', async () => {
    const categories = await source(
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
    )
    const members = await source(
      'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
    )
    const products = await source(
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
    )

    expect(categories).toContain('title="Administrar categorías"')
    expect(categories).toContain('kind="management"')
    expect(categories).toContain('size="wide"')
    expect(categories).toContain('admin-categories__row-actions')

    expect(members).toContain('title={`Integrantes · ${group.nombre}`}')
    expect(members).toContain('kind="management"')
    expect(members).toContain('size="wide"')
    expect(members).toContain('admin-groups-members__section')

    const pendingTag = products.match(
      /<AdminDialog\s+title="Configuración pendiente"[\s\S]*?>/,
    )?.[0]
    expect(pendingTag).toBeDefined()
    expect(pendingTag).toContain('kind="management"')
    expect(pendingTag).not.toContain('size="wide"')
    expect(products).toContain('admin-products__setup-list')
  })

  test('inventario final de 9.5 queda en 18 Dialog con kind y 4 Drawers', async () => {
    const consumerPaths = [
      ...new Set([
        ...confirmationConsumers,
        ...taskConsumers,
        ...managementConsumers,
        'src/features/solog/admin/control/admin.control.v2.tsx',
        'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
      ]),
    ]
    const sources = await Promise.all(consumerPaths.map(source))
    const totalKinds = sources.reduce(
      (count, current) =>
        count +
        (current.match(/kind="(?:confirmation|task|management)"/g)?.length ?? 0),
      0,
    )
    const totalDrawers = sources.reduce(
      (count, current) =>
        count + (current.match(/format="drawer"/g)?.length ?? 0),
      0,
    )

    expect(totalKinds).toBe(18)
    expect(totalDrawers).toBe(4)
  })
})
