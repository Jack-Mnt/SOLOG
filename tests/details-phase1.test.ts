import { describe, expect, test } from 'bun:test'
import type {
  SologDetailsExportResponse,
  SologDetailsHistoryResponse,
  SologDetailsRequestAccessResponse,
  SologDetailsSummaryResponse,
} from '../src/features/solog/types'

const readSource = (path: string) => Bun.file(path).text()

describe('Detalles Fase 1: contratos', () => {
  test('modela las cuatro respuestas exactas de rpc_solog_details', () => {
    const contracts: [
      SologDetailsSummaryResponse['codigo'],
      SologDetailsHistoryResponse['codigo'],
      SologDetailsExportResponse['codigo'],
      SologDetailsRequestAccessResponse['codigo'],
    ] = [
      'DETAILS_SUMMARY',
      'DETAILS_HISTORY',
      'DETAILS_EXPORT',
      'DEVICE_REQUESTED',
    ]
    expect(contracts).toEqual([
      'DETAILS_SUMMARY',
      'DETAILS_HISTORY',
      'DETAILS_EXPORT',
      'DEVICE_REQUESTED',
    ])
  })

  test('cada acción envía únicamente su payload permitido', async () => {
    const source = await readSource('src/features/solog/api.ts')
    expect(source).toContain("'rpc_solog_details',\n    'summary'")
    expect(source).toContain("'rpc_solog_details',\n    'history',\n    { periodo }")
    expect(source).toContain("'rpc_solog_details',\n    'export',\n    {}")
    expect(source).toContain("'rpc_solog_details',\n    'request_access',\n    { device_token: deviceToken }")
  })
})

describe('Detalles Fase 1: Login y rutas', () => {
  test('elimina las páginas completas intermedias y mantiene Login durante la carga', async () => {
    const source = await readSource('src/app.tsx')
    expect(source).toContain('<LoginPage loading />')
    expect(source).not.toContain('title="Cargando…"')
    expect(source).not.toContain('title="Preparando sesión…"')
    expect(source).not.toContain('title="Cargando panel…"')
  })

  test('retira device-pending del routing operativo', async () => {
    const source = await readSource('src/lib/router.ts')
    expect(source).toContain("'/detalles'")
    expect(source).not.toContain("'/device-pending'")
  })
})
