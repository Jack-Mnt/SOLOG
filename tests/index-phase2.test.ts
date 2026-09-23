import { describe, expect, test } from 'bun:test'

const readSource = (path: string) => Bun.file(path).text()

describe('Index Fase I2: loader accesible', () => {
  test('presenta símbolo, puntos, texto y semántica de estado', async () => {
    const loader = await readSource('src/components/panel-loader.tsx')

    expect(loader).toContain("role={isError ? 'alert' : 'status'}")
    expect(loader).toContain("aria-live={isError ? 'assertive' : 'polite'}")
    expect(loader).toContain('aria-busy={!isError}')
    expect(loader).toContain('src="/isotipo.svg"')
    expect(loader).toContain('panel-loader__dots')
    expect(loader).toContain('Cargando el panel…')
  })

  test('respeta reducción de movimiento', async () => {
    const [foundations, shared] = await Promise.all([
      readSource('src/foundations.css'),
      readSource('src/shared.css'),
    ])

    expect(foundations).toContain('@media (prefers-reduced-motion: reduce)')
    expect(shared).toContain('.panel-loader__halo')
    expect(shared).toContain('animation: none !important')
  })
})

describe('Index Fase I2: code splitting', () => {
  test('separa las fronteras protegida, Admin, Cajero y Detalles', async () => {
    const [app, protectedApp] = await Promise.all([
      readSource('src/app.tsx'),
      readSource('src/protected-app.tsx'),
    ])

    expect(app).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/protected-app["']\s*\)\s*\)/s)
    expect(protectedApp).toMatch(/import\(\s*["']\.\/features\/solog\/admin\/admin\.v2\.app["']\s*\)/)
    expect(protectedApp).toMatch(/import\(\s*["']\.\/features\/solog\/cajero\/cajero\.app["']\s*\)/)
    expect(protectedApp).toMatch(/import\(\s*["']\.\/pages\/detalles["']\s*\)/)
    expect(protectedApp).not.toMatch(
      /import \\{ AdminLayout \\}|import \\{ AdminDashboardPage \\}|import \\{ AdminDevicesPage \\}|import \\{ DetailsPage \\}/,
    )
  })

  test('cada módulo Admin tiene un límite lazy propio', async () => {
    const adminApp = await readSource(
      'src/features/solog/admin/admin.v2.app.tsx',
    )
    const pages = [
      'dashboard/admin.dashboard.v2',
      'control/admin.control.v2',
      'incidencias/admin.incidencias.v2',
      'catalogo/admin.catalogo.page.v4',
      'productos/admin.productos.v1',
      'grupos/admin.grupos.v2',
      'dispositivos/admin.dispositivos.v2',
    ]

    for (const page of pages) {
      expect(adminApp).toMatch(new RegExp(`import\\(\\s*["']\\./${page.replaceAll('.', '\\.') }["']\\s*\\)`))
    }
  })

  test('Excel permanece bajo demanda y no requiere manualChunks', async () => {
    const [detailsExport, adminExport, vite] = await Promise.all([
      readSource('src/features/solog/detalles/detalles.export.ts'),
      readSource('src/features/solog/admin/control/admin.control.v2.export.ts'),
      readSource('vite.config.ts'),
    ])

    const { hasDynamicImport } = await import('./source-syntax')
    expect(hasDynamicImport(detailsExport, 'write-excel-file/browser')).toBe(true)
    expect(hasDynamicImport(adminExport, 'write-excel-file/browser')).toBe(true)
    expect(vite).not.toContain('manualChunks')
  })
})
