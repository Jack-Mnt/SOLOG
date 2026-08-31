import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminOverview } from '../src/features/solog/admin/dashboard/admin.dashboard.overview'
import {
  formatDashboardDuration,
  formatDashboardRelativeActivity,
  getDashboardSessionStateLabel,
} from '../src/features/solog/admin/dashboard/admin.dashboard.format'
import type { SologDashboardResponse } from '../src/features/solog/types'

function dashboardFixture(): SologDashboardResponse {
  return {
    server_now: '2026-08-31T17:00:00Z',
    periodo: { fecha: '2026-08-31', periodo_desde: '2026-08-16', periodo_hasta: '2026-08-31' },
    kpis: {
      cobertura_periodo: { grupos_contados: 15, grupos_totales: 20, porcentaje: 75 },
      contados_hoy: { grupos_contados: 2 }, recontar: 3, confirmadas: 4, inconsistentes: 5,
    },
    sedes: [{
      sede_id: 'huaca', sede: 'Huaca',
      cobertura_periodo: { grupos_contados: 15, grupos_totales: 20, porcentaje: 75 },
      cobertura_hoy: { fecha: '2026-08-31', grupos_requeridos: 7, grupos_verificados: 2, pendientes: 5, porcentaje: 28.57, sin_requerimientos: false },
      recontar: 3, confirmadas: 4, inconsistentes: 5,
      actividad: { ultima_actividad_at: null, sesion_activa: true },
    }],
  }
}

function render(dashboard: SologDashboardResponse) {
  return renderToStaticMarkup(createElement(AdminOverview, {
    dashboard, refreshOperationalState: async () => {},
  }))
}

describe('Dashboard V3', () => {
  test('presenta exactamente los cinco KPIs con valores autoritativos V3', () => {
    const html = render(dashboardFixture())
    expect(html.match(/<article /g)).toHaveLength(5)
    for (const [label, value] of [['Cobertura del período', '75%'], ['Contados hoy', '2'], ['Por recontar', '3'], ['Confirmadas', '4'], ['Inconsistentes', '5']]) {
      expect(html).toContain(`<span>${label}</span><strong>${value}</strong>`)
    }
    expect(html).not.toMatch(/Persistentes|Diferencias vigentes|Verificados hoy|undefined|NaN/)
  })

  test('cobertura diaria usa verificados/requeridos, no el shape del período', () => {
    const html = render(dashboardFixture())
    expect(html).toContain('Cobertura del período de Huaca: 15 de 20, 75%')
    expect(html).toContain('Grupos verificados y requeridos hoy en Huaca: 2 de 7, 28.57%')
    expect(html).toContain('<strong>2 / 7</strong>')
    for (const label of ['Cobertura diaria', 'Por recontar', 'Confirmadas', 'Inconsistentes']) {
      expect(html).toContain(`<th>${label}</th>`)
    }
  })

  test('ignora aliases legacy aunque el backend aún los entregue', () => {
    const data = dashboardFixture()
    const before = render(data)
    Object.assign(data.kpis, { persistentes: 999, diferencias_pendientes: 998, diferencias_vigentes: 997, requeridos_hoy: 996, verificados_hoy: 995 })
    Object.assign(data.sedes[0], { persistentes: 999, diferencias_pendientes: 998, diferencias_vigentes: 997 })
    expect(render(data)).toBe(before)
  })

  test('ceros y sede sin requerimientos no generan porcentajes inventados', () => {
    const data = dashboardFixture()
    data.kpis = { cobertura_periodo: { grupos_contados: 0, grupos_totales: 0, porcentaje: 0 }, contados_hoy: { grupos_contados: 0 }, recontar: 0, confirmadas: 0, inconsistentes: 0 }
    Object.assign(data.sedes[0], {
      cobertura_periodo: data.kpis.cobertura_periodo,
      cobertura_hoy: { fecha: '2026-08-31', grupos_verificados: 0, grupos_requeridos: 0, pendientes: 0, porcentaje: 100, sin_requerimientos: true },
      recontar: 0, confirmadas: 0, inconsistentes: 0,
      actividad: { ultima_actividad_at: null, sesion_activa: false },
    })
    const html = render(data)
    expect(html).toContain('Grupos verificados y requeridos hoy en Huaca: 0 de 0, 100%')
    expect(html).toContain('Sin actividad')
    expect(html).not.toMatch(/NaN|undefined/)
    data.sedes = []
    expect(render(data)).toContain('No hay sedes disponibles.')
    expect(render(data)).not.toContain('<table')
  })

  test('actividad conserva sesión activa y usa server_now sin campos de inicio inexistentes', () => {
    const data = dashboardFixture()
    expect(render(data)).toContain('Contando ahora')
    expect(render(data)).not.toMatch(/Desde|Fecha no disponible/)
    data.sedes[0].actividad = { sesion_activa: false, ultima_actividad_at: '2026-08-31T16:55:00Z' }
    expect(render(data)).toContain('Hace 5 min')
  })
})

describe('actividad Dashboard V3', () => {
  test('preserva los estados de sesión y duración, independientes de diferencias V3', () => {
    expect(getDashboardSessionStateLabel('activo')).toBe('Activa')
    expect(getDashboardSessionStateLabel('finalizado')).toBe('Finalizado')
    expect(getDashboardSessionStateLabel('expirado')).toBe('Expirado')
    expect(formatDashboardDuration(0)).toBe('0 s')
    expect(formatDashboardDuration(3900)).toBe('1 h 5 min')
    expect(formatDashboardRelativeActivity('2026-08-31T16:00:00Z', '2026-08-31T17:00:00Z')).toBe('Hace 1 h')
  })

  test('contratos de Dashboard/actividad no exigen campos retirados', async () => {
    const types = await Bun.file('src/features/solog/types.ts').text()
    const block = types.slice(types.indexOf('export interface SologDashboardCoverage'), types.indexOf('export type SologAdminIncidentType'))
    expect(block).not.toMatch(/persistentes|diferencias_pendientes|diferencias_vigentes|grupos_registrados|sesion_iniciada_at|sesion_expira_at|sedes_con_actividad|requeridos_hoy|verificados_hoy/)
    expect(block).toContain('SologDashboardDailyCoverage = SologDailyCoverage')
    expect(block).toContain('observaciones_registradas_hoy: number')
    expect(block).toContain('grupos_verificados_distintos_hoy: number')
  })
})
