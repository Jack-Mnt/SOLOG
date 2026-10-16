// Entrada de compatibilidad para el Dashboard V1 (RPC metrics_dashboard_v1).
// El harness de Control permanece independiente en tests/admin-v2.browser.mjs.
import { runDashboardMetricsBrowser } from './admin-dashboard-metrics.browser.mjs'

await runDashboardMetricsBrowser()
