import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('Admin primitives closure delta', () => {
  test('Admin control density follows the frozen 36/32/40/44 geometry', () => {
    const css = source('src/features/solog/admin/admin.css')
    expect(css).toMatch(/\.admin-v2-workspace \.admin-workspace__main \.button\s*\{[^}]*height:\s*36px[^}]*min-height:\s*36px[^}]*padding:\s*8px 12px[^}]*border-radius:\s*8px[^}]*font-size:\s*0\.8rem/s)
    expect(css).toMatch(/\.admin-v2-workspace \.admin-workspace__main \.icon-button\s*\{[^}]*width:\s*36px[^}]*height:\s*36px[^}]*border-radius:\s*8px/s)
    expect(css).toMatch(/\.admin-v2-workspace \.admin-quick-filter-chips \.admin-quick-filter-chip\s*\{[^}]*height:\s*32px[^}]*min-height:\s*32px/s)
    expect(css).toMatch(/\.admin-v2-workspace \.admin-state-views > button\s*\{[^}]*height:\s*36px[^}]*min-height:\s*36px/s)
    expect(css).toMatch(/\.admin-v2-workspace \.admin-site-context__desktop > button\s*\{[^}]*width:\s*84px[^}]*min-width:\s*80px[^}]*height:\s*40px[^}]*border-radius:\s*12px[^}]*font-size:\s*0\.9rem[^}]*font-weight:\s*640/s)
    expect(css).toContain('--admin-sidebar-item-height: 44px')
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.admin-v2-workspace \.admin-workspace__main \.button\s*\{[^}]*height:\s*32px[^}]*min-height:\s*32px/s)
    expect(css).not.toContain('admin-toolbar__sort')
    for (const legacyToken of ['--color-warning-strong', '--color-success-strong', '--radius-card', '--shadow-soft']) {
      expect(css).not.toContain(legacyToken)
    }
  })

  test('Dashboard keeps the approved 4px contextual inset and shared icon size', () => {
    const css = source('src/features/solog/admin/admin.css')
    expect(css).toMatch(/\.admin-v2-workspace \.admin-dashboard__actions\s*\{[^}]*height:\s*36px[^}]*box-shadow:\s*inset 4px 0 var\(--color-primary\)/s)
    expect(css).not.toContain('inset 5px 0 var(--color-primary)')
    expect(css).toMatch(/\.admin-v2-workspace \.admin-dashboard__actions > svg\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s)
  })

  test('Hover and focus use separate interaction treatments', () => {
    const css = source('src/features/solog/admin/admin.css')
    expect(css).toMatch(/\.button--secondary:hover:not\(:disabled\)[^{]*\{[^}]*background:\s*var\(--color-primary-subtle\)/s)
    expect(css).toMatch(/\.admin-workspace__main \.button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)[^}]*outline-offset:\s*2px/s)
    expect(css).toMatch(/\.admin-site-context__desktop > button:hover\s*\{[^}]*background:\s*var\(--color-dark-surface-hover\)/s)
    expect(css).toMatch(/\.admin-site-context__desktop > button\[aria-pressed="true"\]\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--color-primary\) 18%, var\(--color-dark-surface-secondary\)\)/s)
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
