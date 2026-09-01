import { describe, expect, test } from 'bun:test'

const readSource = (path: string) => Bun.file(path).text()

describe('Detalles Fase 3: historial modal', () => {
  test('consulta history solo con hoy o ayer y sin token de dispositivo', async () => {
    const api = await readSource('src/features/solog/api.ts')
    expect(api).toContain("'history',\n    { periodo }")

    const dialog = await readSource(
      'src/features/solog/detalles/detalles.historial.dialog.tsx',
    )
    expect(dialog).toContain('getSologDetailsHistory(period)')
    expect(dialog).not.toContain('getOrCreateDeviceToken')
    expect(dialog).not.toContain('device_token')
    expect(dialog).not.toContain('sede_id')
  })

  test('presenta un modal de solo lectura con filtros y expansión múltiple', async () => {
    const source = await readSource(
      'src/features/solog/detalles/detalles.historial.dialog.tsx',
    )
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain("(['hoy', 'ayer'] as const)")
    expect(source).toContain('expandedItemIds')
    expect(source).toContain('deriveCajeroCategories(items)')
    expect(source).not.toContain('Guardar')
    expect(source).not.toContain('Recontar')
  })

  test('abre el historial desde Detalles sin crear una ruta nueva', async () => {
    const panel = await readSource(
      'src/features/solog/detalles/detalles.panel.tsx',
    )
    expect(panel).toContain('Ver historial')
    expect(panel).toContain('SologDetailsHistoryDialog')

    const router = await readSource('src/lib/router.ts')
    expect(router).not.toContain('/detalles/historial')
  })
})
