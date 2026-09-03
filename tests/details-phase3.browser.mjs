// Ejecutar con node tests/details-phase3.browser.mjs.
// Playwright externo mediante SOLOG_PLAYWRIGHT_MODULE; no instala dependencias.
// Contexto aislado y RPC simuladas: nunca accede a Supabase real.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(process.env.SOLOG_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href : 'playwright')
const server = await createServer({
  server: { host: '127.0.0.1', port: 5203, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-details-phase3.test'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon-key'),
  },
})
await server.listen()
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SOLOG_TEST_BROWSER ? { executablePath: process.env.SOLOG_TEST_BROWSER } : {}),
})

const serverNow = '2026-08-31T17:00:00Z'
const user = { id: '00000000-0000-4000-8000-000000000023', email: 'cajero@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: serverNow }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const errors = []
const calls = []
const bootstrap = {
  usuario: { id: user.id, nombre: 'Cajero prueba', rol: 'cajero' },
  sede: { id: 'site-1', nombre: 'Huaca', activo: true },
  dispositivo: { id: 'device-1', estado: 'pendiente', sede_correcta: true, autorizado: false, sede_tiene_dispositivo_autorizado: false, solicitud_existente: true, puede_solicitar_acceso: false },
  sesion_activa: null,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: serverNow, confirmado_at: serverNow, puede_iniciar_conteo: false },
  server_now: serverNow,
  cobertura_diaria: { fecha: '2026-08-31', grupos_requeridos: 4, grupos_verificados: 2, pendientes: 2, porcentaje: 50, sin_requerimientos: false },
  cobertura_periodo: { desde: '2026-08-16', hasta: '2026-08-31', inaugurada: true, grupos_contados: 15, grupos_totales: 20, pendientes: 5, porcentaje: 75, completa: false },
  conteo_principal: { categorias: [], stock_cero_pendientes: 0 },
  vistas_inteligentes: { conteo_diario: { cantidad: 2, habilitado: false }, revisar: { cantidad: 3, habilitado: false } },
}
const summary = {
  ok: true,
  codigo: 'DETAILS_SUMMARY',
  server_now: serverNow,
  sede: bootstrap.sede,
  dispositivo: bootstrap.dispositivo,
  stock: { disponible: true, snapshot_id: 'snapshot-1', snapshot_at: serverNow, confirmado_at: serverNow },
  cobertura_periodo: bootstrap.cobertura_periodo,
  cobertura_diaria: bootstrap.cobertura_diaria,
  conteo_diario_pendientes: 2,
  revisar_pendientes: 3,
}
const todayItems = [
  { detalle_id: 'detail-1', categoria_id: 'cat-1', categoria: 'Bebidas', contado_at: '2026-08-31T14:00:00Z', grupo_id: 'group-1', grupo: 'Agua mineral', stock_teorico: 10, stock_fisico: 8, diferencia: -2, precio: 2.5, valor_diferencia: -5, estado_diferencia: 'Confirmada', stock_posterior: 9, stock_reconteo: 8, recontado_at: '2026-08-31T15:00:00Z' },
  { detalle_id: 'detail-2', categoria_id: 'cat-2', categoria: 'Snacks', contado_at: '2026-08-31T15:30:00Z', grupo_id: 'group-2', grupo: 'Papas clásicas', stock_teorico: 4, stock_fisico: 6, diferencia: 2, precio: 3, valor_diferencia: 6, estado_diferencia: 'Inconsistente', stock_posterior: 5, stock_reconteo: 6, recontado_at: '2026-08-31T16:00:00Z' },
]

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await context.route('**/*', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-details-phase3.test') {
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
  if (rpc === 'rpc_solog_state' && payload.p_action === 'bootstrap') return fulfill(bootstrap)
  if (rpc === 'rpc_solog_details' && payload.p_action === 'summary') return fulfill(summary)
  if (rpc === 'rpc_solog_details' && payload.p_action === 'history') {
    const period = payload.p_payload?.periodo
    return fulfill({ ok: true, codigo: 'DETAILS_HISTORY', periodo: period, desde: period === 'hoy' ? '2026-08-31T05:00:00Z' : '2026-08-30T05:00:00Z', hasta: period === 'hoy' ? '2026-09-01T05:00:00Z' : '2026-08-31T05:00:00Z', server_now: serverNow, items: period === 'hoy' ? todayItems : [] })
  }

  errors.push('RPC fuera de alcance: ' + rpc)
  return route.abort()
})

const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(10000)

try {
  await page.goto('http://127.0.0.1:5203/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test-only-password')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL('**/detalles')
  await page.getByRole('button', { name: 'Ver historial' }).click()

  const dialog = page.getByRole('dialog', { name: 'Historial de la sede' })
  await dialog.waitFor()
  await dialog.getByText('Agua mineral', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Bebidas' }).count(), 1)
  assert.equal(await dialog.getByRole('button', { name: 'Snacks' }).count(), 1)

  const firstRow = dialog.getByRole('button', { name: 'Expandir detalle de Agua mineral' })
  const secondRow = dialog.getByRole('button', { name: 'Expandir detalle de Papas clásicas' })
  await firstRow.click()
  await secondRow.click()
  assert.equal(await dialog.getByRole('button', { name: 'Contraer detalle de Agua mineral' }).getAttribute('aria-expanded'), 'true')
  assert.equal(await dialog.getByRole('button', { name: 'Contraer detalle de Papas clásicas' }).getAttribute('aria-expanded'), 'true')

  await dialog.getByRole('button', { name: 'Ayer' }).click()
  await dialog.getByText('No hay observaciones para ayer.', { exact: true }).waitFor()

  const historyCalls = calls.filter((call) => call.rpc === 'rpc_solog_details' && call.payload.p_action === 'history')
  assert.deepEqual(historyCalls.map((call) => call.payload.p_payload), [{ periodo: 'hoy' }, { periodo: 'ayer' }])
  assert.equal(historyCalls.some((call) => 'device_token' in call.payload.p_payload || 'sede_id' in call.payload.p_payload), false)
  assert.equal(calls.some((call) => call.rpc === 'rpc_solog_count'), false)

  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS Historial de /detalles usa hoy/ayer, permite expansión múltiple y permanece solo lectura')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
