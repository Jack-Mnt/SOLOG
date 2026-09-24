import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const dialogConsumerPaths = [
  'src/features/solog/admin/admin.valuation-dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
  'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
  'src/features/solog/admin/control/admin.control.v2.tsx',
  'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
  'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
  'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
  'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
  'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
]

describe('AdminDialog Fase 9.3 — foundation format / size / kind', () => {
  test('separa formato, tamaño y kind sin conservar AdminDialogVariant', async () => {
    const dialog = await source('src/features/solog/admin/admin.dialog.tsx')

    expect(dialog).toContain("export type AdminDialogFormat = 'dialog' | 'drawer'")
    expect(dialog).toContain("export type AdminDialogSize = 'default' | 'wide'")
    expect(dialog).toContain(
      "export type AdminDialogKind = 'confirmation' | 'task' | 'management'",
    )
    expect(dialog).toContain("format?: 'dialog'")
    expect(dialog).toContain("format: 'drawer'")
    expect(dialog).toContain('drawerMaxWidth?: never')
    expect(dialog).toContain('size?: never')
    expect(dialog).toContain('kind?: never')
    expect(dialog).not.toContain('AdminDialogVariant')
  })

  test('los consumidores ya no usan variant de AdminDialog', async () => {
    for (const path of dialogConsumerPaths) {
      const current = await source(path)
      const dialogBlocks =
        current.match(/<AdminDialog[\s\S]{0,900}?>/g) ?? []

      for (const block of dialogBlocks) {
        expect(block).not.toContain('variant=')
      }
    }
  })

  test('drawer conserva lifecycle y geometría existentes bajo format', async () => {
    const dialog = await source('src/features/solog/admin/admin.dialog.tsx')

    expect(dialog).toContain("const isDrawer = format === 'drawer'")
    expect(dialog).toContain('const [drawerOpen, setDrawerOpen] = useState(!isDrawer)')
    expect(dialog).toContain('requestAnimationFrame(() => setDrawerOpen(true))')
    expect(dialog).toContain('closeRequestedRef.current = true')
    expect(dialog).toContain("event.propertyName === 'transform'")
    expect(dialog).toContain('--admin-dialog-drawer-max-width')
    expect(dialog).toContain('inert={!isTop || (isDrawer && !drawerOpen)}')
  })

  test('kind queda preparado como clase estructural propiedad de AdminDialog', async () => {
    const dialog = await source('src/features/solog/admin/admin.dialog.tsx')

    expect(dialog).toContain("const kindClass = kind ? ` admin-dialog--kind-${kind}` : ''")
    expect(dialog).toContain('${dialogLayoutClass}${kindClass}')
  })

  test('Footer es explícito y AdminDialog no sintetiza Cerrar', async () => {
    const dialog = await source('src/features/solog/admin/admin.dialog.tsx')

    expect(dialog).toContain('const hasFooter =')
    expect(dialog).toContain(
      'footer !== undefined && footer !== null && footer !== false',
    )
    expect(dialog).toContain(
      '<footer className="admin-dialog__footer">{footer}</footer>',
    )
    expect(dialog).not.toContain('const resolvedFooter')
    expect(dialog).not.toContain('button button--secondary')
    expect(dialog).toContain('aria-label="Cerrar"')
  })

  test('los tres drawers existentes migran a format sin cambiar anchos', async () => {
    const control = await source(
      'src/features/solog/admin/control/admin.control.v2.tsx',
    )
    const dashboard = await source(
      'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
    )
    const incidents = await source(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    )

    expect(control).toContain('format="drawer"')
    expect(control).toContain('drawerMaxWidth={560}')
    expect(dashboard).toContain('format="drawer"')
    expect(dashboard).toContain('drawerMaxWidth={620}')
    expect(incidents).toContain('format="drawer"')
    expect(incidents).toContain('drawerMaxWidth={520}')
  })
})
