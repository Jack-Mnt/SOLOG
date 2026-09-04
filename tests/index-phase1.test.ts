import { describe, expect, test } from 'bun:test'
import type { SologRouteResponse } from '../src/features/solog/types'

const readSource = (path: string) => Bun.file(path).text()

describe('Index Fase I1: frontera pública', () => {
  test('la portada no importa ni monta autenticación o SOLOG', async () => {
    const [app, home] = await Promise.all([
      readSource('src/app.tsx'),
      readSource('src/pages/home.tsx'),
    ])

    expect(app).toContain("const ProtectedApp = lazy(() => import('./protected-app'))")
    expect(app).toContain("if (pathname === '/') return <PublicHomePage />")
    expect(app).not.toContain('AuthProvider')
    expect(app).not.toContain('SologProvider')
    expect(app).not.toContain('supabase')
    expect(home).not.toContain('panelRoute')
    expect(home).not.toContain('Ir a mi panel')
    expect(home.split('href="/login"').length - 1).toBe(3)
    expect(home.split('Iniciar sesión').length - 1).toBe(3)
  })

  test('el árbol protegido se carga solo fuera de la portada', async () => {
    const source = await readSource('src/protected-app.tsx')

    expect(source).toContain('<AuthProvider>')
    expect(source).toContain("if (pathname === '/login')")
    expect(source).toContain('<LoginRouteResolver')
    expect(source).not.toContain('<SologProvider>')
    expect(source).toContain('<AdminV2App')
  })
})

describe('Index Fase I1: routing v2', () => {
  test('modela exactamente identidad y destinos congelados', () => {
    const cashier: SologRouteResponse = {
      contract_version: 2,
      generated_at: '2026-09-03T12:00:00Z',
      identity: {
        id: '00000000-0000-4000-8000-000000000001',
        nombre: 'Cajero',
        rol: 'cajero',
      },
      route: '/cajero',
    }
    const admin: SologRouteResponse = {
      ...cashier,
      identity: { ...cashier.identity, rol: 'admin' },
      route: '/admin',
    }
    const moderator: SologRouteResponse = {
      ...cashier,
      identity: { ...cashier.identity, rol: 'moderador' },
      route: '/admin',
    }

    expect([cashier.route, moderator.route, admin.route]).toEqual([
      '/cajero',
      '/admin',
      '/admin',
    ])
  })

  test('llama route v2 con payload vacío y no usa metadata cliente', async () => {
    const [api, protectedApp] = await Promise.all([
      readSource('src/features/solog/api.ts'),
      readSource('src/protected-app.tsx'),
    ])

    expect(api).toContain("callSologPayloadRpc<unknown>('rpc_solog_route_v2', {})")
    expect(api).toContain('response.contract_version !== 2')
    expect(api).toContain('route !== expectedRoute')
    expect(protectedApp).toContain('getSologRoute(userId)')
    expect(protectedApp).not.toMatch(/user_metadata|app_metadata/)
    expect(protectedApp).not.toContain("getSologBootstrap")
  })
})
