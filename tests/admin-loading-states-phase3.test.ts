import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

test('bootstrap Admin usa PanelLoader global para pending y error', async () => {
  const app = await source('src/features/solog/admin/admin.v2.app.tsx')

  expect(app).toContain('if (!bootstrap.error) return <PanelLoader />')
  expect(app).toContain('state="error"')
  expect(app).toContain('description={bootstrap.error}')
  expect(app).toContain('Reintentar')
  expect(app).toContain('Cerrar sesión')
  expect(app).not.toContain('<h1>Administración</h1>')
  expect(app).not.toContain('Validando acceso administrativo…')
})

test('QueryState elimina Cargando aislado y usa loader contenido por defecto', async () => {
  const presentation = await source('src/features/solog/admin/admin.v2.presentation.tsx')

  expect(presentation).toContain("variant = 'contained'")
  expect(presentation).toContain('if (!error) return <PanelLoader variant={variant} />')
  expect(presentation).toContain('className="notice notice--error"')
  expect(presentation).not.toContain('Cargando…')
})

test('ReadNotice elimina Cargando aislado y conserva error contextual', async () => {
  const presentation = await source('src/features/solog/admin/admin.management.presentation.tsx')

  expect(presentation).toContain("variant = 'contained'")
  expect(presentation).toContain('if (!error) return <PanelLoader variant={variant} />')
  expect(presentation).toContain('className="notice notice--error"')
  expect(presentation).not.toContain("error ?? 'Cargando…'")
})

test('dialogs, drawers y sublecturas usan variante compacta', async () => {
  const catalog = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
  const control = await source('src/features/solog/admin/control/admin.control.v2.tsx')
  const dashboard = await source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx')
  const categories = await source('src/features/solog/admin/grupos/admin.categories.dialog.tsx')
  const groups = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
  const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')
  const setup = await source('src/features/solog/admin/productos/admin.product-setup.dialog.tsx')

  expect(catalog.match(/variant="compact"/g)?.length).toBeGreaterThanOrEqual(2)
  expect(control).toContain('<QueryState {...currentQuery} variant="compact" />')
  expect(control).toContain('<QueryState {...previousQuery} variant="compact" />')
  expect(dashboard.match(/variant="compact"/g)?.length).toBeGreaterThanOrEqual(2)
  expect(categories).toContain('variant="compact"')
  expect(groups.match(/variant="compact"/g)?.length).toBe(2)
  expect(incidents).toContain('<ReadNotice {...query} variant="compact" />')
  expect(setup).toContain('variant="compact"')
})

test('Catálogo no duplica loader entre status y proposals', async () => {
  const catalog = await source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')

  expect(catalog).toContain('if (status.error) return <QueryState {...status} variant="compact" />')
  expect(catalog).toContain('return null;')
  expect(catalog).toContain('<QueryState {...query} />')
})

test('vistas principales conservan loader contenido por defecto', async () => {
  const devices = await source('src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx')
  const groups = await source('src/features/solog/admin/grupos/admin.grupos.v2.tsx')
  const products = await source('src/features/solog/admin/productos/admin.productos.v1.tsx')
  const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')

  expect(devices).toContain('<ReadNotice {...query} />')
  expect(groups).toContain('<QueryState error={masterData.error} retry={masterData.retry} />')
  expect(products).toContain('<QueryState error={masterData.error} retry={masterData.retry} />')
  expect(incidents).toContain('<ReadNotice {...normalQuery} />')
  expect(incidents).not.toContain('Cargando sedes…')
  expect(incidents).toContain('aria-busy={allLoading}')
})
