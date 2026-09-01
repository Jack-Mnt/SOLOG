import { describe, expect, test } from 'bun:test'

const readSource = (path: string) => Bun.file(path).text()

describe('Detalles Fase 2: resumen de solo lectura', () => {
  test('la página delega en un módulo aislado de Detalles', async () => {
    const source = await readSource('src/pages/detalles.tsx')
    expect(source).toContain('SologDetailsPanel')
    expect(source).not.toContain('PageShell')
    expect(source).not.toContain('device-pending')
  })

  test('el resumen consume únicamente summary y request_access', async () => {
    const source = await readSource(
      'src/features/solog/detalles/detalles.hook.ts',
    )
    expect(source).toContain('getSologDetailsSummary(getOrCreateDeviceToken())')
    expect(source).toContain('requestSologDetailsAccess(getOrCreateDeviceToken())')
    expect(source).not.toContain('rpc_solog_count')
    expect(source).not.toContain('startSologCount')
    expect(source).not.toContain('saveSolog')
  })

  test('el botón depende del flag autoritativo y no expone acciones operativas', async () => {
    const source = await readSource(
      'src/features/solog/detalles/detalles.panel.tsx',
    )
    expect(source).toContain(
      'summary.dispositivo.puede_solicitar_acceso ? (',
    )
    expect(source).toContain("'Solicitar acceso'")
    expect(source).not.toContain('Iniciar conteo')
    expect(source).not.toContain('Continuar conteo')
    expect(source).not.toContain('Enviar conteo')
    expect(source).not.toContain('Finalizar conteo')
  })
})
