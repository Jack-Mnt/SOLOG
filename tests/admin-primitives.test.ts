import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('Admin primitives closure delta', () => {
  test('Button base restores compact legacy geometry without overriding module-specific sizes', () => {
    const css = source('src/features/solog/admin/admin.css')
    expect(css).toMatch(/\.admin-v2-workspace\s+:where\(\.button\)\s*\{[^}]*min-height:\s*38px[^}]*padding:\s*8px 12px[^}]*border-radius:\s*10px[^}]*font-size:\s*0\.82rem/s)
    expect(css).not.toContain('admin-toolbar__sort')
    for (const legacyToken of ['--color-warning-strong', '--color-success-strong', '--radius-card', '--shadow-soft']) {
      expect(css).not.toContain(legacyToken)
    }
  })

  test('AdminSort exposes roving focus and complete menu keyboard navigation', () => {
    const primitives = source('src/features/solog/admin/admin.primitives.tsx')
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) expect(primitives).toContain(key)
    expect(primitives).toContain('tabIndex={value === option.value ? 0 : -1}')
    expect(primitives).toContain('role="menuitemradio"')
    expect(primitives).toContain('onBlur={(event) =>')
  })

  test('Catalog StateView uses tab semantics with roving tabindex', () => {
    const catalog = source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    expect(catalog).toContain('role="tablist"')
    expect(catalog).toContain('role="tab"')
    expect(catalog).toContain('aria-selected={status === item.id}')
    expect(catalog).toContain('tabIndex={status === item.id ? 0 : -1}')
    expect(catalog).toContain('role="tabpanel"')
  })

  test('Productos y Grupos render Search icon in their search controls', () => {
    for (const file of [
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    ]) {
      const content = source(file)
      expect(content).toContain('admin-filter-search-control')
      expect(content).toMatch(/<Search\s+size=\{16\}\s+aria-hidden="true"\s*\/>/)
    }
  })

  test('Catalog publication primary action uses a Lucide icon', () => {
    const catalog = source('src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx')
    expect(catalog).toContain('<ClipboardCheck size={16} aria-hidden="true" />')
    expect(catalog).toContain("'Revisar publicación'")
  })

  test('Admin action Buttons in the migrated surfaces include an icon component', () => {
    const files = [
      'src/features/solog/admin/admin.v2.app.tsx',
      'src/features/solog/admin/control/admin.control.v2.tsx',
      'src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx',
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
      'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
      'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
      'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
      'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
      'src/features/solog/admin/admin.management.presentation.tsx',
      'src/features/solog/admin/admin.v2.presentation.tsx',
    ]
    const missing: string[] = []
    for (const file of files) {
      const text = source(file)
      for (const match of text.matchAll(/<button\b[^>]*className="[^"]*\bbutton\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)) {
        if (!/<[A-Z][A-Za-z0-9]*(?:\s|\/|>)/.test(match[1])) {
          missing.push(`${file}: ${match[1].replace(/\s+/g, ' ').trim().slice(0, 80)}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
