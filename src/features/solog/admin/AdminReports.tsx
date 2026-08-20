import { AdminCountsReport } from './AdminCountsReport'
import { AdminDifferencesReport } from './AdminDifferencesReport'
import { AdminReportFilters } from './AdminReportFilters'
import { AdminHistoryReport } from './AdminHistoryReport'
import { AdminPosAdjustmentsReport } from './AdminPosAdjustmentsReport'
import { AdminSummaryReport } from './AdminSummaryReport'
import {
  ADMIN_REPORT_PAGE_SIZE,
  useAdminReports,
} from './useAdminReports'
import type { SologAdminReportType, SologAdminSite } from '../types'

const REPORT_TABS: Array<{
  type: SologAdminReportType
  label: string
  icon: LucideIcon
}> = [
  { type: 'summary', label: 'Resumen por período', icon: ScrollText },
  { type: 'counts', label: 'Conteos', icon: ListChecks },
  { type: 'differences', label: 'Diferencias', icon: Scale },
  { type: 'history', label: 'Historial', icon: History },
  { type: 'pos_adjustments', label: 'Ajuste POS', icon: SlidersHorizontal },
]

export function AdminReports({
  sites,
  refreshOperationalState,
}: {
  sites: SologAdminSite[]
  refreshOperationalState: () => Promise<void>
}) {
  const reports = useAdminReports({
    enabled: true,
    refreshOperationalState,
  })
  const currentData =
    reports.data?.report_type === reports.reportType ? reports.data : null
  const isPaginated = reports.reportType !== 'summary'
  const currentRows = currentData?.rows.length ?? 0

  return (
    <section className="content-section admin-reports" aria-labelledby="reports-title">
      <div className="section-heading">
        <div>
          <h2 id="reports-title">Reportes</h2>
          <p>Consulta los cinco reportes administrativos procesados por backend.</p>
        </div>
      </div>

      <div className="admin-report-tabs" role="tablist" aria-label="Tipos de reporte">
        {REPORT_TABS.map((tab) => {
          const TabIcon = tab.icon
          return (
          <button
            aria-selected={reports.reportType === tab.type}
            className={`admin-tab${reports.reportType === tab.type ? ' admin-tab--active' : ''}`}
            key={tab.type}
            onClick={() => reports.selectReport(tab.type)}
            role="tab"
            type="button"
          >
            <TabIcon size={17} /> {tab.label}
          </button>
          )
        })}
      </div>

      <AdminReportFilters
        filters={reports.draftFilters}
        loading={reports.status === 'loading'}
        onApply={reports.apply}
        onReset={reports.reset}
        onUpdate={reports.updateFilters}
        reportType={reports.reportType}
        sites={sites}
      />

      {reports.error ? (
        <div className="notice notice--error admin-message" role="alert">
          <strong>No se pudo cargar el reporte</strong>
          <p>{reports.error}</p>
        </div>
      ) : null}

      {reports.status === 'idle' ? (
        <div className="notice">
          <strong>Filtros pendientes de aplicar</strong>
          <p>Pulsa Aplicar para consultar el reporte.</p>
        </div>
      ) : null}

      {reports.status === 'loading' ? (
        <div className="notice" role="status">
          <strong>Consultando reporte…</strong>
          <p>Los filtros se procesan en una única llamada administrativa.</p>
        </div>
      ) : null}

      {currentData?.report_type === 'summary' ? (
        <AdminSummaryReport report={currentData} />
      ) : null}
      {currentData?.report_type === 'counts' ? (
        <AdminCountsReport report={currentData} />
      ) : null}
      {currentData?.report_type === 'differences' ? (
        <AdminDifferencesReport report={currentData} />
      ) : null}
      {currentData?.report_type === 'history' ? (
        <AdminHistoryReport
          internalCode={reports.draftFilters.internalCode}
          report={currentData}
        />
      ) : null}
      {currentData?.report_type === 'pos_adjustments' ? (
        <AdminPosAdjustmentsReport report={currentData} />
      ) : null}

      {isPaginated && currentData ? (
        <nav className="admin-report-pagination" aria-label="Paginación del reporte">
          <button
            className="button button--secondary"
            disabled={reports.offset === 0 || reports.status === 'loading'}
            onClick={reports.previousPage}
            type="button"
          >
            <ArrowLeft size={17} /> Anterior
          </button>
          <span>Página {Math.floor(reports.offset / ADMIN_REPORT_PAGE_SIZE) + 1}</span>
          <button
            className="button button--secondary"
            disabled={
              currentRows !== ADMIN_REPORT_PAGE_SIZE ||
              reports.status === 'loading'
            }
            onClick={reports.nextPage}
            type="button"
          >
            Siguiente <ArrowRight size={17} />
          </button>
        </nav>
      ) : null}
    </section>
  )
}
import {
  ArrowLeft,
  ArrowRight,
  History,
  ListChecks,
  Scale,
  ScrollText,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
