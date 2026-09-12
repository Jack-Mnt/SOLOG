// Smoke browser Cajero V3 con RPC simuladas y tráfico externo bloqueado.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { cashierV3Bootstrap, cashierV3Mutation } from './fixtures/cashier-v3.mjs'

const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5210, strictPort: true }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://solog-cashier-v3.test'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only'),
} })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
const context = await browser.newContext()
const base = cashierV3Bootstrap('pre_session')
const user = { id: base.identity.id, email: 'cashier@example.test', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: base.server_now }
const jwt = [{ alg: 'HS256', typ: 'JWT' }, { sub: user.id, aud: 'authenticated',
  role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }]
  .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
const calls = []
let active = false
let operational = 10
await context.route('**/*', async route => {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'solog-cashier-v3.test') return route.abort()
  const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname.includes('/auth/v1/token')) return reply({ access_token: jwt, refresh_token: 'test',
    expires_in: 3600, token_type: 'bearer', user })
  if (url.pathname.includes('/auth/v1/user')) return reply(user)
  if (url.pathname.includes('/auth/v1/logout')) return reply({})
  const rpc = url.pathname.split('/').at(-1)
  const body = route.request().postDataJSON()
  calls.push({ rpc, body })
  if (rpc === 'rpc_solog_route_v2') return reply({ contract_version: 2, generated_at: base.server_now,
    identity: base.identity, route: '/cajero' })
  if (rpc === 'rpc_solog_cashier_bootstrap_v3') {
    const value = cashierV3Bootstrap(active ? 'session' : 'pre_session')
    value.revisions.operational = operational
    return reply(value)
  }
  if (rpc === 'rpc_solog_cashier_history_v2') {
    const period = body.p_payload.period
    return reply({ contract_version: 2, generated_at: base.server_now, period,
      date: period === 'today' ? '2026-09-12' : '2026-09-11', items: [], revisions: { operational } })
  }
  assert.equal(rpc, 'rpc_solog_cashier_mutate_v3')
  const action = body.p_action
  const response = cashierV3Mutation(action)
  response.revisions.operational = ++operational
  if (action === 'start') active = true
  if (action === 'finish') active = false
  return reply(response)
})
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(15000)
try {
  await page.goto('http://127.0.0.1:5210/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('test')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.getByRole('heading', { name: 'Inicio', exact: true }).waitFor()
  assert.equal(calls.filter(call => call.rpc === 'rpc_solog_cashier_bootstrap_v3').length, 1)

  await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).click()
  await page.getByText('Grupo group-1', { exact: true }).waitFor()
  assert.equal(calls.filter(call => call.rpc === 'rpc_solog_cashier_bootstrap_v3').length, 1,
    'start instala el panel completo sin bootstrap')
  await page.getByRole('navigation', { name: 'Panel Cajero' }).getByRole('button', { name: 'Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Finalizar conteo', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar conteo', exact: true }).waitFor()
  assert.equal(calls.filter(call => call.rpc === 'rpc_solog_cashier_bootstrap_v3').length, 2)
  assert.deepEqual(calls.filter(call => call.rpc === 'rpc_solog_cashier_mutate_v3').map(call => call.body.p_action),
    ['start', 'finish'])
  assert.equal(calls.some(call => ['rpc_solog_cashier_bootstrap_v2', 'rpc_solog_cashier_mutate_v2'].includes(call.rpc)), false)
  assert.deepEqual(errors, [])
  console.log('PASS Cajero V3: bootstrap compacto, start local, navegación y finish compacto')
} finally {
  await context.close()
  await browser.close()
  await server.close()
}
