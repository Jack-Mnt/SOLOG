// Ejecutar con node tests/details-phase4.browser.mjs.
// Playwright externo mediante SOLOG_PLAYWRIGHT_MODULE; no instala dependencias.
// Contexto aislado y RPC simuladas: nunca accede a Supabase real.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/package.json'))('fflate')
const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5204, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-details-phase4.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER ? { executablePath: process.env.SOLOG_TEST_BROWSER } : {}),
})

const serverNow = '2026-08-31T17:00:00Z'
const user = { id: '00000000-0000-4000-8000-000000000024', email: 'cajero@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: serverNow }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const errors = []
const calls = []
const bootstrap = {
  usuario: { id: user.id, nombre: 'Cajero prueba', rol: 'cajero' },
  sede: { id: 'site-1', nombre: 'Huaca Principal', activo: true },
  dispositivo: { id: 'device-1', estado: 'pendiente', sede_correcta: true, autorizado: false, sede_tiene_dispositivo_autorizado: false, solicitud_existente: true, puede_solicitar_acceso: false },
  sesion_activa: null,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: serverNow, confirmado_at: serverNow, puede_iniciar_conteo: false },
  server_now: serverNow,
  cobertura_diaria: { fecha: '2026-08-31', grupos_requeridos: 0, grupos_verificados: 0, pendientes: 0, porcentaje: 100, sin_requerimientos: true },
  cobertura_periodo: { desde: '2026-08-16', hasta: '2026-08-31', inaugurada: true, grupos_contados: 20, grupos_totales: 20, pendientes: 0, porcentaje: 100, completa: true },
  conteo_principal: { categorias: [], stock_cero_pendientes: 0 },
  vistas_inteligentes: { conteo_diario: { cantidad: 0, habilitado: false }, revisar: { cantidad: 0, habilitado: false } },
}
const summary = {
  ok: true, codigo: 'DETAILS_SUMMARY', server_now: serverNow,
  sede: bootstrap.sede, dispositivo: bootstrap.dispositivo,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: serverNow, confirmado_at: serverNow },
  cobertura_periodo: bootstrap.cobertura_periodo, cobertura_diaria: bootstrap.cobertura_diaria,
  conteo_diario_pendientes: 0, revisar_pendientes: 0,
}
const exportRows = [
  { fecha: '2026-08-31T15:35:00Z', nombre: 'Agua mineral', categoria: 'Bebidas', estado: 'Confirmada', stock_tumi: 12, fisico: 15, diferencia: 3, valorizado: 24, precio: 8, unidades_por_paquete: null, precio_paquete: null, detalle_id: 'detail-1' },
  { fecha: '2026-08-31T04:30:00Z', nombre: 'Galletas por paquete', categoria: 'Snacks', estado: 'Inconsistente', stock_tumi: 30, fisico: 16, diferencia: -14, valorizado: -60, precio: 5, unidades_por_paquete: 12, precio_paquete: 50, detalle_id: 'detail-2' },
]
let emptyExport = false

const exportResponse = () => ({
  ok: true,
  codigo: 'DETAILS_EXPORT',
  sede: { id: 'site-1', nombre: 'Huaca Principal' },
  periodo: { desde: '2026-08-16', hasta: '2026-08-31' },
  summary: emptyExport
    ? { diferencias_finales: 0, confirmadas: 0, inconsistentes: 0, faltantes: 0, sobrantes: 0, valorizado_faltantes: 0, valorizado_sobrantes: 0, balance_valorizado: 0 }
    : { diferencias_finales: 2, confirmadas: 1, inconsistentes: 1, faltantes: 1, sobrantes: 1, valorizado_faltantes: -60, valorizado_sobrantes: 24, balance_valorizado: -36 },
  rows: emptyExport ? [] : exportRows,
  server_now: serverNow,
})

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-details-phase4.test') {
    errors.push('Tráfico externo inesperado: ' + url.hostname)
    return route.abort()
  }

  const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname === '/auth/v1/token') return fulfill({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user })
  if (url.pathname === '/auth/v1/user') return fulfill(user)

  const rpc = url.pathname.split('/').at(-1)
  const payload = request.postDataJSON() ?? {}
  calls.push({ rpc, payload })
  if (rpc === 'rpc_solog_state' && payload.p_action === 'bootstrap') return fulfill(bootstrap)
  if (rpc === 'rpc_solog_details' && payload.p_action === 'summary') return fulfill(summary)
  if (rpc === 'rpc_solog_details' && payload.p_action === 'export') return fulfill(exportResponse())
  errors.push('RPC fuera de alcance: ' + rpc)
  return route.abort()
})

async function readWorkbook(download, page) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const zip = unzipSync(Buffer.concat(chunks))
  const files = Object.fromEntries(Object.entries(zip).map(([path, data]) => [path, strFromU8(data)]))
  return page.evaluate((files) => {
    const parse = (text) => new DOMParser().parseFromString(text, 'application/xml')
    const strings = files['xl/sharedStrings.xml'] ? [...parse(files['xl/sharedStrings.xml']).querySelectorAll('si')].map((node) => node.textContent) : []
    const sheet = (path) => Object.fromEntries([...parse(files[path]).querySelectorAll('c')].map((cell) => [
      cell.getAttribute('r'), cell.getAttribute('t') === 's' ? strings[Number(cell.querySelector('v').textContent)] : cell.querySelector('v, t')?.textContent ?? '',
    ]))
    return { names: [...parse(files['xl/workbook.xml']).querySelectorAll('sheet')].map((node) => node.getAttribute('name')), summary: sheet('xl/worksheets/sheet1.xml'), differences: sheet('xl/worksheets/sheet2.xml'), styles: files['xl/styles.xml'] }
  }, files)
}

const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(10000)

try {
  await page.goto('http://127.0.0.1:5204/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL('**/detalles')

  const firstDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click()
  const firstDownload = await firstDownloadEvent
  assert.match(firstDownload.suggestedFilename(), /^SOLOG_Diferencias_quincenal_[a-z]{3}-\d{2}-\d{4}_(?:am|pm)_Huaca_Principal\.xlsx$/)
  const workbook = await readWorkbook(firstDownload, page)
  assert.deepEqual(workbook.names, ['Resumen', 'Diferencias'])
  assert.deepEqual(
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1'].map((cell) => workbook.differences[cell]),
    ['Fecha', 'Hora', 'Nombre', 'Categoría', 'Estado', 'Stock Tumi', 'Fisico', 'Diferencia', 'Valorizado', 'Detalle'],
  )
  assert.equal(workbook.differences.C2, 'Galletas por paquete')
  assert.equal(workbook.differences.E2, 'Inconsistente')
  assert.equal(workbook.differences.F2, '30')
  assert.equal(workbook.differences.G2, '16')
  assert.equal(workbook.differences.H2, '-14')
  assert.equal(workbook.differences.I2, '-60')
  assert.equal(workbook.differences.J2, '-14 uds. = -(1 paquete × S/ 50.00 + 2 uds. × S/ 5.00) = -S/ 60.00')
  assert.equal(workbook.differences.C3, 'Agua mineral')
  assert.equal(workbook.differences.J3, '+3 × S/ 8.00 = +S/ 24.00')
  assert.equal(Math.floor(Number(workbook.differences.A2)), (Date.UTC(2026, 7, 30) - Date.UTC(1899, 11, 30)) / 86400000)
  assert.ok(
    Math.abs(
      Number(workbook.differences.B2) -
        Math.floor(Number(workbook.differences.B2)) -
        23.5 / 24,
    ) < 0.00001,
    `Hora serial inesperada: ${workbook.differences.B2}`,
  )
  assert.equal(workbook.summary.B6, '2')
  assert.equal(workbook.summary.B11, '-60')
  assert.equal(workbook.summary.B13, '-36')
  assert.match(workbook.styles, /AM\/PM/)

  const exportCall = calls.find((call) => call.rpc === 'rpc_solog_details' && call.payload.p_action === 'export')
  assert.deepEqual(exportCall?.payload.p_payload, {})
  assert.equal(calls.some((call) => call.rpc === 'rpc_solog_control_export' || call.rpc === 'rpc_solog_count'), false)

  emptyExport = true
  const emptyDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar Excel', exact: true }).click()
  const emptyWorkbook = await readWorkbook(await emptyDownloadEvent, page)
  assert.deepEqual(emptyWorkbook.names, ['Resumen', 'Diferencias'])
  assert.equal(emptyWorkbook.differences.A2, undefined)
  await page.getByText('Excel generado. El período no contiene diferencias finales.', { exact: true }).waitFor()

  assert.deepEqual(errors, [])
  console.log('PASS Excel de /detalles respeta contrato, zona Lima, orden, paquete, libro vacío y aislamiento del Motor V3')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
