import { describe, expect, test } from 'bun:test'

const readSource = (path: string) => Bun.file(path).text()

describe('Index Fase I2: loader accesible', () => {
  test('presenta símbolo, puntos, texto y semántica de estado', async () => {
    const loader = await readSource('src/components/panel-loader.tsx')

    expect(loader).toContain('role="status"')
    expect(loader).toContain('aria-live="polite"')
    expect(loader).toContain('aria-busy="true"')
    expect(loader).toContain('src="/isotipo.svg"')
    expect(loader).toContain('panel-loader__dots')
    expect(loader).toContain('Cargando el panel…')
  })

  test('respeta reducción de movimiento', async () => {
    const styles = await readSource('src/styles.css')

    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('.panel-loader__halo')
    expect(styles).toContain('animation: none !important')
  })
})

describe('Index Fase I2: code splitting', () => {
  test('separa las fronteras protegida, Admin, Cajero y Detalles', async () => {
    const [app, protectedApp] = await Promise.all([
      readSource('src/app.tsx'),
      readSource('src/protected-app.tsx'),
    ])

    expect(app).toContain("lazy(() => import('./protected-app'))")
    expect(protectedApp).toContain("import('./features/solog/admin/admin-app')")
    expect(protectedApp).toContain("import('./features/solog/cajero/cajero.app')")
    expect(protectedApp).toContain("import('./pages/detalles')")
    expect(protectedApp).not.toMatch(
      /import \\{ AdminLayout \\}|import \\{ AdminDashboardPage \\}|import \\{ AdminDevicesPage \\}|import \\{ DetailsPage \\}/,
    )
  })

  test('cada módulo Admin tiene un límite lazy propio', async () => {
    const adminApp = await readSource(
      'src/features/solog/admin/admin-app.tsx',
    )
    const pages = [
      'admin.dashboard',
      'admin.control',
      'admin.incidencias',
      'admin.catalogo',
      'admin.grupos',
      'admin.dispositivos',
    ]

    for (const page of pages) {
      expect(adminApp).toContain("import('../../../pages/" + page + "')")
    }
  })

  test('Excel permanece bajo demanda y no requiere manualChunks', async () => {
    const [detailsExport, adminExport, vite] = await Promise.all([
      readSource('src/features/solog/detalles/detalles.export.ts'),
      readSource('src/features/solog/admin/control/admin.control.v2.export.ts'),
      readSource('vite.config.ts'),
    ])

    expect(detailsExport).toContain("await import('write-excel-file/browser')")
    expect(adminExport).toContain("await import('write-excel-file/browser')")
    expect(vite).not.toContain('manualChunks')
  })
})
