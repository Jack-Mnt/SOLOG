// Ejecutar con node tests/details-phase2.browser.mjs.
// Playwright externo mediante SOLOG_PLAYWRIGHT_MODULE; no instala dependencias.
// Contexto aislado y RPC simuladas: nunca accede a Supabase real.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5202, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-details-phase2.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER ? { executablePath: process.env.SOLOG_TEST_BROWSER } : {}),
})

const serverNow = '2026-08-31T17:00:00Z'
const user = { id: '00000000-0000-4000-8000-000000000022', email: 'cajero@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: serverNow }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const errors = []
const calls = []
const bootstrap = {
  usuario: { id: user.id, nombre: 'Cajero prueba', rol: 'cajero' },
  sede: { id: 'site-1', nombre: 'Huaca', activo: true },
  dispositivo: { id: 'device-1', estado: 'sin_solicitud', sede_correcta: true, autorizado: false, sede_tiene_dispositivo_autorizado: false, solicitud_existente: false, puede_solicitar_acceso: true },
  sesion_activa: null,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: '2026-08-31T15:00:00Z', confirmado_at: '2026-08-31T15:00:00Z', puede_iniciar_conteo: false },
  server_now: serverNow,
  cobertura_diaria: { fecha: '2026-08-31', grupos_requeridos: 4, grupos_verificados: 2, pendientes: 2, porcentaje: 50, sin_requerimientos: false },
  cobertura_periodo: { desde: '2026-08-16', hasta: '2026-08-31', inaugurada: true, grupos_contados: 15, grupos_totales: 20, pendientes: 5, porcentaje: 75, completa: false },
  conteo_principal: { categorias: [], stock_cero_pendientes: 0 },
  vistas_inteligentes: { conteo_diario: { cantidad: 2, habilitado: false }, revisar: { cantidad: 3, habilitado: false } },
}
let detailsDevice = { ...bootstrap.dispositivo }

const getSummary = () => ({
  ok: true,
  codigo: 'DETAILS_SUMMARY',
  server_now: serverNow,
  sede: bootstrap.sede,
  dispositivo: detailsDevice,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: '2026-08-31T15:00:00Z', confirmado_at: '2026-08-31T15:00:00Z' },
  cobertura_periodo: bootstrap.cobertura_periodo,
  cobertura_diaria: bootstrap.cobertura_diaria,
  conteo_diario_pendientes: 2,
  revisar_pendientes: 3,
})

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-details-phase2.test') {
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
  if (rpc === 'rpc_solog_details' && payload.p_action === 'summary') return fulfill(getSummary())
  if (rpc === 'rpc_solog_details' && payload.p_action === 'request_access') {
    detailsDevice = { ...detailsDevice, estado: 'pendiente', solicitud_existente: true, puede_solicitar_acceso: false }
    return fulfill({ ok: true, codigo: 'DEVICE_REQUESTED', dispositivo_id: 'device-1', estado: 'pendiente', server_now: serverNow })
  }

  errors.push('RPC fuera de alcance: ' + rpc)
  return route.abort()
})

const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(10000)

try {
  await page.goto('http://127.0.0.1:5202/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL('**/detalles')

  await page.getByRole('heading', { name: 'Detalles de la sede' }).waitFor()
  await page.getByRole('heading', { name: 'Sin solicitud' }).waitFor()
  assert.equal(await page.getByText('Cobertura del período', { exact: true }).count(), 1)
  assert.equal(await page.getByText('15 / 20', { exact: true }).count(), 1)
  assert.equal(await page.getByText('Conteo diario pendiente', { exact: true }).count(), 1)
  assert.equal(await page.getByText('Casos por revisar', { exact: true }).count(), 1)
  assert.equal(await page.getByText('Solo lectura', { exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Iniciar conteo' }).count(), 0)

  const requestButton = page.getByRole('button', { name: 'Solicitar acceso' })
  await requestButton.click()
  await page.getByText('Solicitud registrada', { exact: true }).waitFor()
  assert.equal(await requestButton.count(), 0)
  assert.equal(new URL(page.url()).pathname, '/detalles')

  const requestCall = calls.find((call) => call.rpc === 'rpc_solog_details' && call.payload.p_action === 'request_access')
  assert.equal(typeof requestCall?.payload.p_payload?.device_token, 'string')
  assert.deepEqual(Object.keys(requestCall.payload.p_payload), ['device_token'])
  assert.equal(calls.some((call) => call.rpc === 'rpc_solog_count'), false)
  assert.deepEqual(errors, [])
  console.log('PASS /detalles muestra summary, respeta puede_solicitar_acceso y no ejecuta operaciones del Motor V3')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
