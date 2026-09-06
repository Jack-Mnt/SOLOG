import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dir, '..')
const removed = [
  'src/features/solog/context.tsx',
  'src/features/solog/cajero/cajero.pre-session.tsx',
  'src/features/solog/cajero/cajero.recovery.ts',
  'src/features/solog/cajero/cajero.table.tsx',
  'src/features/solog/admin/admin.format.ts',
  'src/features/solog/admin/catalogo/admin.catalogo.domain.ts',
  'src/features/solog/admin/catalogo/admin.catalogo.format.ts',
  'src/features/solog/admin/control/admin.control.format.ts',
  'src/features/solog/admin/control/admin.control.period.ts',
  'src/features/solog/admin/dashboard/admin.dashboard.format.ts',
  'src/features/solog/admin/dispositivos/admin.dispositivos.format.ts',
  'src/features/solog/admin/grupos/admin.grupos.valorizacion.ts',
  'src/features/solog/admin/incidencias/admin.incidencias.domain.ts',
  'src/features/solog/admin/incidencias/admin.incidencias.format.ts',
  'src/pages/admin.control.tsx',
  'src/pages/admin.dashboard.tsx',
]
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
}
const sourceFiles = files(path.join(root, 'src')).filter(file => /\.[cm]?[jt]sx?$/.test(file))
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')
const syntax = (file: string) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
  file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

describe('S10-B: contrato V9 sin retirar compatibilidades vigentes', () => {
  test('las dieciséis islas fuente autorizadas están retiradas', () => {
    for (const file of removed) expect(existsSync(path.join(root, file))).toBe(false)
  })

  test('imports, reexports e imports dinámicos locales no apuntan a archivos eliminados', () => {
    const missing: string[] = []
    for (const file of [...sourceFiles, ...files(path.join(root, 'tests')).filter(f => /\.[cm]?[jt]sx?$/.test(f))]) {
      const visit = (node: ts.Node) => {
        let specifier: ts.Expression | undefined
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0]
        if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.') &&
            !/\.(css|svg|png)$/.test(specifier.text)) {
          const resolved = ts.resolveModuleName(specifier.text, file, {
            moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, jsx: ts.JsxEmit.ReactJSX,
          }, ts.sys).resolvedModule
          if (!resolved) missing.push(path.relative(root, file) + ' → ' + specifier.text)
        }
        ts.forEachChild(node, visit)
      }
      visit(syntax(file))
    }
    expect(missing).toEqual([])
  })

  test('ningún source reintroduce RPC retiradas ni acciones unitarias', () => {
    const legacy = /\b(?:rpc_solog_state|rpc_solog_count|rpc_solog_admin|rpc_solog_catalog|rpc_solog_control|rpc_solog_control_detalle|rpc_solog_control_export|rpc_solog_dashboard|rpc_solog_dashboard_site_activity|rpc_solog_details|recount_start|recount_save)\b/
    for (const file of sourceFiles) expect(readFileSync(file, 'utf8')).not.toMatch(legacy)
  })

  test('archivos mixtos conservan exports actuales sin subgrafo eliminado', () => {
    const api = source('src/features/solog/api.ts')
    expect(api).toContain('export function getSologRoute')
    expect(api).toContain('rpc_solog_route_v2')
    expect(api).not.toMatch(/\b(?:callSologRpc|getSologBootstrap|SologRpcName)\b/)
    const operational = source('src/features/solog/cajero/cajero.operativo.tsx')
    for (const name of ['CajeroStartEmptyState', 'CajeroSelectionGrid', 'CajeroSendBar']) {
      expect(operational).toContain('export function ' + name)
    }
    expect(operational).not.toContain('CajeroOperationalView')
    const errors = source('src/features/solog/errors.ts')
    for (const name of ['normalizeSologError', 'getSologErrorMessageFromUnknown', 'SologApiError']) {
      expect(errors).toContain(name)
    }
    expect(source('src/features/solog/labels.ts')).toContain('getSologDifferenceStateClass')
  })

  test('aliases runtime siguen presentes sin resolveTrustedRoute', () => {
    const literals: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node)) literals.push(node.text)
      ts.forEachChild(node, visit)
    }
    visit(syntax(path.join(root, 'src/protected-app.tsx')))
    expect(literals).toContain('/count')
    expect(literals).toContain('/cajero/seguimiento')
    expect(source('src/lib/router.ts')).not.toContain('resolveTrustedRoute')
  })

  test('CSS no conserva tabla desmontada; Historial y H2 permanecen', () => {
    const css = source('src/styles.css')
    expect(css).not.toMatch(/\.cajero-count-table[\w-]*\b|\.cajero-review-reason\b/)
    expect(css).toMatch(/\.cajero-history-list__detail\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(css).toMatch(/\.cajero-history-list__detail dd\.cajero-history-value--discarded\s*\{[^}]*color:\s*var\(--danger,\s*#b42318\)[^}]*text-decoration:\s*line-through/)
  })

  test('saneamiento y superficies activas permanecen, incluidas RPC dinámicas Admin', () => {
    expect(source('src/features/solog/cajero/cajero.v2.context.tsx')).toContain('purgePersistedCajeroData()')
    const master = source('src/features/solog/admin/admin.management.v2.ts')
    for (const name of ['rpc_solog_admin_master_read_v2', 'rpc_solog_admin_master_v2', 'conexion-admin']) expect(master).toContain(name)
    expect(master).toContain('rpc_solog_admin_' + '$' + '{domain(action)}_v2')
    expect(master).toContain("return 'incidents'")
    expect(master).toContain("return 'devices'")
    expect(source('src/features/solog/cajero/cajero.v2.api.ts')).toContain('rpc_solog_cashier_mutate_v2')
    expect(source('src/features/solog/detalles/detalles.v2.ts')).toContain('rpc_solog_details_v2')
  })
})
