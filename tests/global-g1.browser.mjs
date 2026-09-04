import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(pathToFileURL(process.env.SOLOG_PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5210, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.SOLOG_TEST_BROWSER })
const context = await browser.newContext()
const external = []
await context.route('**/*', async route => {
  const url = new URL(route.request().url())
  if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort() }
  if (url.pathname === '/src/lib/supabase.ts') return route.fulfill({ contentType: 'application/javascript', body: `
    const listeners = new Set(), sessions = [], requests = [];
    const session = id => ({ user: { id }, access_token: 'fake-' + id });
    window.g1 = {
      requests, get ready() { return listeners.size > 0 && sessions.length > 0 },
      event: id => listeners.forEach(fn => fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? session(id) : null)),
      restore: id => sessions.splice(0).forEach(resolve => resolve({data:{session:id?session(id):null},error:null})),
      route: (index,id,role='admin') => requests[index].resolve({data:{contract_version:2,generated_at:'2026-09-04T12:00:00Z',identity:{id,nombre:id,rol:role},route:role==='cajero'?'/cajero':'/admin'},error:null})
    };
    export const supabase = {
      auth: {
        onAuthStateChange: fn => { listeners.add(fn); return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}} },
        getSession: () => new Promise(resolve => sessions.push(resolve)),
        signOut: async () => { window.g1.event(null); return {error:null} }
      },
      rpc: (name,payload) => new Promise(resolve => requests.push({name,payload,resolve}))
    };
  ` })
  return route.continue()
})
try {
  const a = await context.newPage(), b = await context.newPage()
  await Promise.all([a.goto('http://127.0.0.1:5210/login'), b.goto('http://127.0.0.1:5210/login')])
  for (const page of [a,b]) await page.waitForFunction(() => window.g1?.ready)
  // An Auth event wins over a delayed initial getSession, including logout.
  await a.evaluate(() => { window.g1.event(null); window.g1.restore('old-user') })
  await a.getByRole('button', { name: 'Ingresar', exact: true }).waitFor()
  assert.equal(await a.evaluate(() => window.g1.requests.length), 0)
  // A and B overlap in one tab; another tab must retain its own routing intent.
  await a.evaluate(() => window.g1.event('user-a'))
  await a.waitForFunction(() => window.g1.requests.length === 1)
  await a.evaluate(() => window.g1.event('user-b'))
  await a.waitForFunction(() => window.g1.requests.length === 2)
  await b.evaluate(() => { window.g1.event('user-c'); window.g1.restore('old-c') })
  await b.waitForFunction(() => window.g1.requests.length === 1)
  await a.evaluate(() => window.g1.route(0, 'user-a', 'cajero'))
  assert.equal(new URL(a.url()).pathname, '/login')
  // Wrong identity must not navigate, even though role/route and contract version are valid.
  await a.evaluate(() => window.g1.route(1, 'user-a'))
  await a.getByRole('heading', { name: 'No se pudo resolver tu acceso' }).waitFor()
  assert.equal(new URL(a.url()).pathname, '/login')
  assert.equal(await b.evaluate(() => window.g1.requests.length), 1)
  await a.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await a.waitForFunction(() => window.g1.requests.length === 3)
  await a.evaluate(() => window.g1.event(null))
  await a.getByRole('button', { name: 'Ingresar', exact: true }).waitFor()
  await a.evaluate(() => window.g1.route(2, 'user-b'))
  assert.equal(new URL(a.url()).pathname, '/login')
  assert.deepEqual(await a.evaluate(() => window.g1.requests.map(r => [r.name,r.payload])), Array.from({length:3}, () => ['rpc_solog_route_v2',{p_payload:{}}]))
  assert.equal(external.length, 0)
  console.log('PASS G1: Auth restore/logout race, two users in flight, identity mismatch, retry/logout, independent tabs; zero external requests')
} finally { await context.close(); await browser.close(); await server.close() }
