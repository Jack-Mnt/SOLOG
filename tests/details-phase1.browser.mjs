// Ejecutar con node tests/details-phase1.browser.mjs.
// Playwright externo mediante SOLOG_PLAYWRIGHT_MODULE; no instala dependencias.
// Contexto aislado y RPC simuladas: nunca accede a Supabase real.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { summaryFixture } from './fixtures/details-v2.mjs'
import { cashierFixture } from './fixtures/cashier-v4.mjs'

const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5201, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-details.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER ? { executablePath: process.env.SOLOG_TEST_BROWSER } : {}),
})
const serverNow = '2026-08-31T17:00:00Z'
const user = { id: '00000000-0000-4000-8000-000000000021', email: 'cajero@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: serverNow }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const errors = []
const calls = []
let releaseBootstrap
let bootstrapStartedResolve
const bootstrapStarted = new Promise((resolve) => { bootstrapStartedResolve = resolve })

const bootstrap = {
  usuario: { id: user.id, nombre: 'Cajero prueba', rol: 'cajero' },
  sede: { id: 'site-1', nombre: 'Huaca', activo: true },
  dispositivo: { id: 'device-1', estado: 'sin_solicitud', sede_correcta: true, autorizado: false, sede_tiene_dispositivo_autorizado: false, solicitud_existente: false, puede_solicitar_acceso: true },
  sesion_activa: null,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: serverNow, confirmado_at: serverNow, puede_iniciar_conteo: false },
  server_now: serverNow,
  cobertura_diaria: { fecha: '2026-08-31', grupos_requeridos: 0, grupos_verificados: 0, pendientes: 0, porcentaje: 100, sin_requerimientos: true },
  cobertura_periodo: { desde: '2026-08-16', hasta: '2026-08-31', inaugurada: true, grupos_contados: 15, grupos_totales: 20, pendientes: 5, porcentaje: 75, completa: false },
  conteo_principal: { categorias: [], stock_cero_pendientes: 0 },
  vistas_inteligentes: { conteo_diario: { cantidad: 0, habilitado: false }, revisar: { cantidad: 0, habilitado: false } },
}
const detailsSummary = summaryFixture()

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-details.test') {
    errors.push('Tráfico externo inesperado: ' + url.hostname)
    return route.abort()
  }
  const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname === '/auth/v1/token') return fulfill({ access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user })
  if (url.pathname === '/auth/v1/user') return fulfill(user)
  const rpc = url.pathname.split('/').at(-1)
  const payload = request.postDataJSON() ?? {}
  calls.push({ rpc, payload })
  if (rpc === 'rpc_solog_route_v2') return fulfill({ contract_version: 2, generated_at: serverNow, identity: bootstrap.usuario, route: '/cajero' })
  if (rpc === 'rpc_solog_cashier_bootstrap_v2') {
    bootstrapStartedResolve()
    await new Promise((resolve) => { releaseBootstrap = resolve })
    const cashier = cashierFixture()
    cashier.identity = bootstrap.usuario
    cashier.device.autorizado = false
    cashier.start_capability.allowed = false
    cashier.start_capability.reason = 'SOLOG_DEVICE_UNAUTHORIZED'
    return fulfill(cashier)
  }
  if (rpc === 'rpc_solog_details_v2' && payload.p_action === 'summary') return fulfill(detailsSummary)
  errors.push('RPC fuera de alcance: ' + rpc)
  return route.abort()
})

const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(10000)

try {
  await page.goto('http://127.0.0.1:5201/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await bootstrapStarted
  await page.getByRole('status').filter({ hasText: 'Cargando el panel…' }).waitFor()
  assert.equal(await page.getByText('Cargando…', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Preparando sesión…', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Cargando panel…', { exact: true }).count(), 0)
  releaseBootstrap()
  await page.waitForURL('**/detalles')
  await page.getByRole('heading', { name: 'Detalles de la sede' }).waitFor()
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  )
  assert.equal(resources.some((url) => url.includes('/pages/detalles.tsx')), true)
  assert.equal(
    resources.some(
      (url) =>
        url.includes('/admin/admin-app.tsx') ||
        url.includes('/features/solog/cajero/cajero.tsx'),
    ),
    false,
  )
  const routeCalls = calls.filter((call) => call.rpc === 'rpc_solog_route_v2')
  assert.equal(routeCalls.length, 1)
  assert.deepEqual(routeCalls[0].payload, { p_payload: {} })
  assert.ok(
    calls.findIndex((call) => call.rpc === 'rpc_solog_route_v2') <
      calls.findIndex((call) => call.rpc === 'rpc_solog_details_v2'),
  )
  assert.equal(calls.some((call) => call.rpc === 'rpc_solog_count'), false)
  assert.equal(calls.filter((call) => call.rpc === 'rpc_solog_details_v2').length, 1)
  assert.equal(calls.some((call) => call.rpc === 'rpc_solog_state'), false)
  assert.deepEqual(errors, [])
  console.log('PASS Login usa route v2, muestra el loader compartido y resuelve /detalles')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
